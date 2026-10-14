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
    const ids=await page.evaluate(()=>({pet:VZ.db.pets[0].id,product:VZ.db.products.find(p=>p.name==='Syringe 3mL').id,service:VZ.db.services[0].id,tomorrow:VZ.addDays(VZ.today(),1)}));
    await open('sales.html');assert.equal(await page.locator('#service-admin-tab').isVisible(),false);
    await page.locator(`[data-add="${ids.product}"]`).click();await page.locator('[data-catalog=services]').click();await page.locator(`[data-add="${ids.service}"]`).click();
    await page.locator('[name=method][value="Online payment"]').check();await page.locator('#pay-btn').click();await page.locator('#confirm-sale').click();await page.waitForSelector('[data-done]');
    const sale=await page.evaluate(()=>VZ.db.sales.at(-1));assert.equal(sale.items.length,2);assert.equal(sale.items[1].kind,'service');await page.locator('[data-done]').click();
    await page.locator('[data-sales-tab=history]').click();await page.locator(`[data-sale-view="${sale.id}"]`).click();await page.locator('[data-reverse-sale]').click();
    await page.locator('#workflow-form [name=reason]').fill('Customer returned damaged item');await page.locator('#workflow-form button[type=submit]').click();
    assert.ok((await page.locator('#sales-secondary-panel').innerText()).includes('Pending review'));
    await open('inventory.html');assert.equal(await page.locator('#costs-tab').isVisible(),false);await page.locator('[data-stock-section=receiving]').click();await page.locator('[data-receive]').click();
    await page.locator('#workflow-form [name=supplier]').fill('UI supplier');await page.locator('#workflow-form [name=reference]').fill('UI-13');
    await page.locator('[data-line-field=productId]').selectOption(ids.product);await page.locator('[data-line-field=qty]').fill('4');await page.locator('[data-line-field=unitCost]').fill('10.25');await page.locator('[data-line-field=lot]').fill('UI-LOT');
    await page.setViewportSize({width:375,height:812});await page.screenshot({path:'/tmp/v13-receiving-mobile.png',fullPage:true});
    assert.equal(await page.locator('#workflow-form button[type=submit]').isVisible(),true);await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#stock-secondary-panel').innerText()).includes('Pending review'));await page.setViewportSize({width:1280,height:900});
    await open('pet.html?id='+ids.pet);await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=edit]').click();await page.locator('#workflow-form [name=name]').fill('UI edited pet');await page.locator('#workflow-form button[type=submit]').click();
    await open('clinic.html');await page.locator('[data-new-appointment]').click();await page.locator('#workflow-form [name=petId]').selectOption(ids.pet);await page.locator('#workflow-form [name=date]').fill(ids.tomorrow);await page.locator('#workflow-form [name=time]').fill('10:30');await page.locator('#workflow-form button[type=submit]').click();
    await page.locator(`[data-calendar-date="${ids.tomorrow}"]`).click();const appointment=await page.evaluate(()=>VZ.db.appointments.at(-1));await page.locator(`[data-manage-appointment="${appointment.id}"]`).click();
    assert.equal(await page.locator('[data-appointment-action=attended]').count(),0);await page.locator('[data-appointment-action=reschedule]').click();await page.locator('#workflow-form [name=time]').fill('11:30');await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#clinic-body').innerText()).includes('Rescheduled'));
    await page.locator('[data-clinic-tab=board]').click();await page.locator('[data-check-in]').click();await page.locator('#workflow-form [name=petId]').selectOption(ids.pet);await page.locator('#workflow-form [name=reason]').fill('Observation');await page.locator('#workflow-form button[type=submit]').click();
    const stay=await page.evaluate(()=>VZ.activeStay(VZ.db.pets[0].id));await page.locator(`[data-manage-stay="${stay.id}"]`).click();assert.equal(await page.getByRole('button',{name:'Ready for pickup',exact:true}).count(),0);await page.keyboard.press('Escape');
    await logout();await login('admin','admin123');await open('approvals.html');await page.locator('[data-tab=operations]').click();
    const requests=await page.evaluate(()=>VZ.workflowRequests().filter(r=>r.status==='pending').map(r=>({id:r.id,kind:r.kind})));
    for(const r of requests){await page.locator(`[data-review-operation="${r.id}"]`).click();
      if(r.kind==='reversal'){assert.equal(await page.locator('[data-return-qty]').inputValue(),'0');await page.locator('[data-wf-choice=approve]').click();assert.ok((await page.locator('#workflow-review .form-error').innerText()).includes('refund'));await page.locator('[name=refundConfirmed]').check();}
      await page.locator('[data-wf-choice=approve]').click();await page.waitForSelector('#workflow-review',{state:'detached'});
    }
    assert.equal(await page.evaluate(id=>VZ.db.sales.find(s=>s.id===id).status,sale.id),'voided');assert.equal(await page.evaluate(id=>VZ.findPet(id).name,ids.pet),'UI edited pet');
    await open('inventory.html');await page.locator('[data-stock-section=costs]').click();assert.ok((await page.locator('#stock-secondary-panel').innerText()).includes('41.00'));
    await page.locator('[data-loss]').click();const batch=await page.evaluate(()=>VZ.db.receivings.at(-1).lines[0].batchId);await page.locator('#workflow-form [name=batchId]').selectOption(batch);await page.locator('#workflow-form [name=qty]').fill('1');await page.locator('#workflow-form [name=notes]').fill('Package damaged');await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#stock-secondary-panel').innerText()).includes('10.25'));
    await open('sales.html');await page.locator('[data-sales-tab=services]').click();await page.locator('[data-service-add]').click();await page.locator('#workflow-form [name=name]').fill('UI service');await page.locator('#workflow-form [name=price]').fill('550');await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#sales-secondary-panel').innerText()).includes('UI service'));
    await open('clinic.html');await page.locator('[data-clinic-tab=board]').click();await page.locator(`[data-manage-stay="${stay.id}"]`).click();
    await page.getByRole('button',{name:'Ready for pickup',exact:true}).click();assert.ok((await page.locator('#clinic-body').innerText()).includes('Awaiting pickup'));
    await page.setViewportSize({width:375,height:812});await page.screenshot({path:'/tmp/v13-clinic-board-mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1280,height:900});
    await page.locator(`[data-manage-stay="${stay.id}"]`).click();await page.getByRole('link',{name:'Release pet home',exact:true}).click();
    await page.locator('#pet-event-form button[type=submit]').click();assert.equal(await page.evaluate(id=>VZ.activeStay(id),ids.pet),null);
    await open('clinic.html');await page.locator('[data-clinic-tab=released]').click();assert.ok((await page.locator('#clinic-body').innerText()).includes('UI edited pet'));
    await page.locator('[data-clinic-tab=appointments]').click();await page.screenshot({path:'/tmp/v13-clinic-desktop.png',fullPage:true});
    await page.setViewportSize({width:375,height:812});await page.screenshot({path:'/tmp/v13-clinic-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.reload();assert.equal(await page.evaluate(id=>VZ.db.sales.find(s=>s.id===id).status,sale.id),'voided');assert.deepEqual(errors,[]);
    console.log('PASS: V13 browser service/product billing, default-zero reversal and refund validation, staff/admin receiving and losses, editable service prices, pet edit approval, calendar booking/rescheduling, clinic board, pickup and release, responsive pages and persistence.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
