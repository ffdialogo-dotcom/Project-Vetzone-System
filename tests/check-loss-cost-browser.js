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

    await open('index.html');await login('admin','admin123');
    const item=await page.evaluate(()=>{const b=VZ.db.batches.find(b=>b.qty>=3&&b.expiry&&b.expiry<VZ.today()&&b.unitCost==null),p=VZ.findProduct(b.productId);return {id:p.id,code:p.displayId,batchId:b.id,price:p.price,stock:VZ.info(p).sellable};});
    await open('inventory.html');await page.locator('#q').fill(item.code);await page.locator('[data-act=manage]').click();await page.locator('[data-do=archive-expired]').click();await page.locator('[data-yes]').click();await page.waitForSelector('.modal-overlay',{state:'detached'});
    await page.locator('[data-stock-section=costs]').click();await page.locator('[data-loss]').click();await page.locator('#workflow-form [name=batchId]').selectOption(item.batchId);await page.locator('#workflow-form [name=qty]').fill('3');await page.locator('#workflow-form [name=reason]').selectOption('Expired');await page.locator('#workflow-form [name=notes]').fill('Three units expired');await page.locator('#workflow-form button[type=submit]').click();
    assert.ok((await page.locator('.cost-summary').innerText()).includes('Incomplete: 3 units'));assert.ok((await page.locator('#stock-secondary-panel').innerText()).includes('Purchase cost not entered'));
    const loss=await page.evaluate(()=>VZ.db.stockLosses.at(-1)),batchBefore=await page.evaluate(id=>JSON.stringify(VZ.db.batches.find(b=>b.id===id)),item.batchId);
    await page.locator('[data-loss-cost="'+loss.id+'"]').click();await page.locator('#workflow-form [data-cancel]').click();assert.equal(await page.evaluate(id=>JSON.stringify(VZ.db.batches.find(b=>b.id===id)),item.batchId),batchBefore);
    await page.locator('[data-loss-cost="'+loss.id+'"]').click();await page.locator('#workflow-form [name=unitCost]').fill('30');await page.locator('#workflow-form [name=note]').fill('Supplier purchase record');assert.ok((await page.locator('[data-loss-cost-preview]').innerText()).includes('90.00'));
    await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#workflow-form .form-error').innerText()).includes('confirm'));assert.equal(await page.evaluate(()=>VZ.db.stockLosses.at(-1).cost),null);
    await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/v15-loss-cost-mobile.png',fullPage:true});assert.equal(await page.locator('#workflow-form button[type=submit]').isVisible(),true);await page.locator('#workflow-form [name=confirmed]').check();
    await page.evaluate(()=>{const f=document.querySelector('#workflow-form');f.requestSubmit();f.requestSubmit();});await page.waitForSelector('#workflow-form',{state:'detached'});await page.setViewportSize({width:1280,height:900});
    assert.ok((await page.locator('.cost-summary').innerText()).includes('90.00'));assert.equal(await page.locator('[data-loss-cost="'+loss.id+'"]').count(),0);
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).sellable,item.id),item.stock);assert.equal(await page.evaluate(id=>VZ.findProduct(id).price,item.id),item.price);assert.equal(await page.evaluate(id=>VZ.db.batches.find(b=>b.id===id).archived,item.batchId),true);
    await page.screenshot({path:'/tmp/v15-loss-cost-desktop.png',fullPage:true});await page.reload();await page.locator('[data-stock-section=costs]').click();assert.ok((await page.locator('.cost-summary').innerText()).includes('90.00'));
    await logout();await login('staff1','staff123');await open('inventory.html');assert.equal(await page.locator('#costs-tab').isVisible(),false);assert.equal(await page.evaluate(id=>VZ.setLossPurchaseCost(id,30,'Unauthorized change',true).ok,loss.id),false);assert.deepEqual(errors,[]);
    console.log('PASS: V15 archived stock loss, incomplete totals, admin missing cost form/cancel/preview/confirmation, 3×30=90, duplicate submission guard, unchanged stock/selling price, mobile, staff restriction and persistence.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
