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
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL);await page.locator('#username').fill('admin');await page.locator('#password').fill('admin123');await page.locator('#login-form button[type=submit]').click();await page.waitForURL('**/dashboard.html');
    const item=await page.evaluate(()=>{
      const p=VZ.products().find(p=>VZ.info(p).expiredQty>0&&VZ.info(p).sellable>0);
      if(!p)throw Error('Seed needs mixed expired and fresh stock');
      return{id:p.id,code:p.displayId,name:p.name,good:VZ.info(p).sellable,expired:VZ.info(p).expiredQty,others:JSON.stringify(VZ.db.products.filter(x=>x.id!==p.id))};
    });
    await page.goto(baseURL+'inventory.html');await page.locator('#q').fill(item.code);await page.locator('[data-act=manage]').click();
    assert.ok((await page.locator('[data-do=archive-expired]').innerText()).includes('Archive expired stock only'));
    assert.ok((await page.locator('[data-do=archive]').innerText()).includes('Archive entire product'));
    await page.locator('[data-do=archive-expired]').click();await page.locator('[data-no]').click();
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).expiredQty,item.id),item.expired);
    await page.locator('[data-act=manage]').click();await page.locator('[data-do=archive-expired]').click();await page.locator('[data-yes]').click();await page.waitForSelector('.modal-overlay',{state:'detached'});
    assert.equal(await page.locator('#rows tr').count(),1);assert.equal(await page.locator('#rows td:nth-child(5)').innerText(),String(item.good));
    assert.equal(await page.evaluate(id=>VZ.findProduct(id).archived,item.id),false);
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).expiredQty,item.id),0);
    await page.locator('[data-view=archived]').click();assert.equal(await page.locator('#rows tr').count(),1);
    assert.equal(await page.locator('#rows td:nth-child(5)').innerText(),String(item.expired));assert.ok((await page.locator('#rows').innerText()).includes('Archived expired stock'));
    assert.equal(await page.locator('[data-act=restore]').count(),0);
    await page.locator('[data-act=batches]').click();assert.ok((await page.locator('.modal-body').innerText()).includes('Archived expired stock'));assert.ok((await page.locator('.modal-body').innerText()).includes('Active stock'));await page.locator('[data-cancel]').click();
    await page.reload();await page.locator('#q').fill(item.code);assert.equal(await page.locator('#rows td:nth-child(5)').innerText(),String(item.good));
    await page.goto(baseURL+'sales.html');await page.locator('#q').fill(item.code);await page.locator(`[data-add="${item.id}"]`).click();await page.locator('[name=method][value="Online payment"]').check();await page.locator('#pay-btn').click();await page.locator('#confirm-sale').click();await page.waitForSelector('[data-done]');
    assert.equal(await page.evaluate(id=>VZ.info(VZ.findProduct(id)).sellable,item.id),item.good-1);
    assert.equal(await page.evaluate(id=>VZ.archivedBatches(VZ.findProduct(id)).reduce((n,b)=>n+b.qty,0),item.id),item.expired);
    assert.equal(await page.evaluate(id=>JSON.stringify(VZ.db.products.filter(x=>x.id!==id)),item.id),item.others);
    assert.deepEqual(errors,[]);console.log('PASS: separate expired/full-product archive actions, cancel, expired-only confirmation, active fresh stock, archived quantities/batch labels, reload and sale from retained fresh stock; other products unchanged.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
