const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/' ? '/index.html' : pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404);res.end();return;}
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const baseURL='http://127.0.0.1:'+server.address().port+'/';
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    const context=await browser.newContext();
    await context.route('https://fonts.googleapis.com/**',r=>r.abort());
    const page=await context.newPage(); page.setDefaultTimeout(12000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    async function open(path){const r=await page.goto(baseURL+path,{waitUntil:'load'});assert.equal(r.status(),200);}
    async function login(user,password){await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#login-form button[type=submit]').click();await page.waitForURL('**/dashboard.html');}
    async function logout(){await page.locator('#user-btn').click();await page.locator('#logout-btn').click();await page.waitForURL('**/index.html');}
    await open('index.html');await login('staff1','staff123');
    await open('profile.html');assert.match(await page.locator('#me-name').innerText(),/STF-\d{4,}/);
    const product=await page.evaluate(()=>{
      const p=VZ.db.products.find(p=>p.name==='Syringe 3mL');
      return {id:p.id,code:p.displayId,name:p.name,price:p.price,stock:VZ.info(p).sellable};
    });
    await open('inventory.html');
    assert.equal(await page.getByRole('columnheader',{name:'Item code',exact:true}).isVisible(),true);
    await page.locator('#q').fill(product.code);assert.equal(await page.locator('#rows tr').count(),1);
    assert.equal(await page.locator('#rows .item-code').innerText(),product.code);
    assert.ok((await page.locator('#rows').innerText()).includes(product.name));
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.locator('#rows .item-code').isVisible(),true);
    await page.setViewportSize({width:1280,height:900});
    await open('sales.html');await page.locator('#q').fill(product.code);
    assert.equal(await page.locator('#grid .product').count(),1);
    assert.ok((await page.locator('#grid').innerText()).includes(product.code));
    await page.locator(`[data-add="${product.id}"]`).click();await page.locator(`[data-add="${product.id}"]`).click();
    const before=await page.evaluate(id=>({sales:VZ.db.sales.length,stock:VZ.info(VZ.findProduct(id)).sellable}),product.id);
    await page.locator('#pay-btn').click();assert.equal(await page.locator('#pay-error').isVisible(),true);
    assert.equal(await page.locator('#confirm-sale-form').count(),0);
    await page.locator('[name=method][value="Cash"]').check();await page.locator('#disc').fill('10');
    const total=await page.evaluate(price=>VZ.cartTotals([{price,qty:2}],10).total,product.price);
    await page.locator('#pay-btn').click();assert.equal(await page.locator('#confirm-sale-form').isVisible(),true);
    assert.equal(await page.evaluate(()=>VZ.db.sales.length),before.sales);
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).sellable,product.id),before.stock);
    await page.locator('[data-back]').click();assert.equal(await page.locator('#confirm-sale-form').count(),0);
    assert.ok((await page.locator('#count').innerText()).includes('2 items'));
    await page.locator('#pay-btn').click();await page.locator('#confirm-sale').click();
    assert.ok((await page.locator('#confirm-sale-form .form-error').innerText()).includes('cash received'));
    await page.locator('#cash-received').fill(String(Math.max(0,total-0.01)));await page.locator('#confirm-sale').click();
    assert.ok((await page.locator('#confirm-sale-form .form-error').innerText()).includes('cover the total'));
    assert.equal(await page.evaluate(()=>VZ.db.sales.length),before.sales);
    const received=Number((total+20).toFixed(2));await page.locator('#cash-received').fill(String(received));
    const twenty=await page.evaluate(()=>VZ.money(20));assert.equal(await page.locator('#change-due').innerText(),twenty);
    await page.setViewportSize({width:375,height:812});assert.equal(await page.locator('#confirm-sale').isVisible(),true);
    await page.setViewportSize({width:1280,height:900});
    // Simulate two immediate submissions of the same final confirmation form.
    await page.evaluate(()=>{const form=document.querySelector('#confirm-sale-form');form.requestSubmit();form.requestSubmit();});
    await page.waitForSelector('#recorded-change');assert.equal(await page.locator('#recorded-change').innerText(),twenty);
    const cash=await page.evaluate(()=>VZ.db.sales.at(-1));
    assert.equal(cash.total,total);assert.equal(cash.cashReceived,received);assert.equal(cash.change,20);
    assert.equal(await page.evaluate(()=>VZ.db.sales.length),before.sales+1);
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).sellable,product.id),before.stock-2);
    await page.locator('[data-done]').click();
    await page.locator(`[data-add="${product.id}"]`).click();await page.locator('[name=method][value="Online payment"]').check();
    await page.locator('#pay-btn').click();assert.equal(await page.locator('#cash-received').count(),0);
    assert.equal(await page.evaluate(()=>VZ.db.sales.length),before.sales+1);
    await page.locator('#confirm-sale').click();await page.waitForSelector('[data-done]');
    const online=await page.evaluate(()=>VZ.db.sales.at(-1));
    assert.equal(online.method,'Online payment');assert.equal(online.cashReceived,null);assert.equal(online.change,null);
    assert.equal(await page.evaluate(()=>VZ.db.sales.length),before.sales+2);
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).sellable,product.id),before.stock-3);
    await page.locator('[data-done]').click();await page.reload();
    assert.equal(await page.evaluate(id=>VZ.db.sales.find(s=>s.id===id).change,cash.id),20);
    await logout();await login('admin','admin123');
    await open('profile.html');assert.match(await page.locator('#me-name').innerText(),/ADM-\d{4,}/);
    const target=await page.evaluate(()=>{
      const pet=VZ.db.pets.find(p=>VZ.petState(p).dueItems.length);
      return {id:pet.id,status:pet.status,history:JSON.stringify(VZ.db.records.filter(r=>r.petId===pet.id))};
    });
    await open('pet.html?id='+target.id);assert.equal(await page.locator('#request-deceased').innerText(),'Mark as deceased');
    await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=death]').click();assert.equal(await page.locator('#death-request-form button[type=submit]').innerText(),'Confirm deceased status');
    await page.locator('#death-request-form [data-cancel]').click();
    assert.equal(await page.evaluate(id=>VZ.findPet(id).status,target.id),target.status);
    await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=death]').click();await page.locator('#death-request-form [name=location]').selectOption('Outside clinic');
    await page.locator('#death-request-form [name=notes]').fill('Direct admin confirmation');
    await page.locator('#death-request-form button[type=submit]').click();await page.waitForSelector('#death-request-form',{state:'detached'});
    const deceased=await page.evaluate(id=>({status:VZ.findPet(id).status,request:VZ.db.petStatusRequests.find(r=>r.petId===id),history:JSON.stringify(VZ.db.records.filter(r=>r.petId===id)),due:VZ.petState(VZ.findPet(id)).dueItems.length}),target.id);
    assert.equal(deceased.status,'Deceased');assert.equal(deceased.request.status,'approved');assert.equal(deceased.request.auto,true);
    assert.equal(deceased.request.reviewedBy,'admin');assert.equal(deceased.history,target.history);assert.equal(deceased.due,0);
    assert.equal(await page.locator('#pet-status').isDisabled(),true);assert.equal(await page.locator('#request-deceased').isVisible(),false);
    await page.reload();assert.equal(await page.locator('#pet-status').inputValue(),'Deceased');
    await open('approvals.html');await page.locator('[data-tab=death]').click();assert.equal(await page.locator('[data-review-death]').count(),0);
    await open('dashboard.html');
    const expected=await page.evaluate(()=>{
      const sales=VZ.salesBetween(VZ.today(),VZ.today()),a=VZ.aggregate(sales);
      return {count:a.n,items:a.items,total:VZ.money(a.net),saleNumbers:sales.map(s=>s.no)};
    });
    // V19: the chart dot shows only the date, the income, and the number of sales (no list, no Close button).
    const point=page.locator('#sales-chart [data-chart-point]').last();await point.hover();
    const tip=page.locator('#sales-chart-tooltip');assert.equal(await tip.isVisible(),true);
    const detail=await tip.innerText();assert.ok(detail.includes(expected.count+' sales'));assert.ok(detail.includes(expected.total));
    assert.ok(detail.includes(await page.evaluate(()=>VZ.fmtDate(VZ.today()))),'tooltip shows the date');
    assert.ok(!detail.includes(product.name)&&!detail.includes(cash.no),'tooltip no longer lists products or sale numbers');
    assert.equal(await tip.locator('button').count(),0,'no Close button');
    await point.focus();await point.press('Enter');assert.equal(await tip.isVisible(),true);await point.press('Escape');assert.equal(await tip.isVisible(),false);
    await point.click();assert.equal(await tip.isVisible(),true);await page.locator('h1').click();assert.equal(await tip.isVisible(),false,'clicking outside closes a pinned tooltip');
    const zero=page.locator('#sales-chart [data-chart-point][aria-label*="0 sales"]').first();
    if(await zero.count()){await zero.hover();assert.ok((await tip.innerText()).includes('0 sales'));}
    await page.locator('[data-days="7"]').click();assert.equal(await page.locator('#sales-chart [data-chart-point]').count(),7);
    await page.locator('#sales-chart [data-chart-point]').last().hover();assert.ok((await tip.innerText()).includes(expected.total));
    // V19: Record sales > History shows each sale of a date with what was bought.
    await open('sales.html');await page.locator('[data-sales-tab=history]').click();
    const hist=await page.locator('#sales-secondary-panel').innerText();
    for(const no of [cash.no,online.no])assert.ok(hist.includes(no),'history lists '+no);
    assert.ok(hist.includes(product.name),'history shows the products bought');
    assert.ok(hist.includes(expected.total),'history shows the day total');
    assert.ok(/ × /.test(hist),'history shows quantities');
    assert.equal(await page.locator('[data-history-mode]').count(),0,'History has only the By date view');
    assert.deepEqual(errors,[]);
    console.log('PASS: admin direct deceased confirmation/cancel/persistence, distinct role IDs, visible and searchable item codes, cash/online sale review, cancellation without writes, insufficient cash, live change, duplicate confirmation guard, stock and cash persistence, chart hover/focus/date-range sale details, and mobile code/confirmation visibility.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
