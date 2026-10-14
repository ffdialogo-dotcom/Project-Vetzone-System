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
    const target=await page.evaluate(()=>{const pet=VZ.db.pets.find(p=>VZ.overdueVaccinations(p.id).length);return {id:pet.id,due:JSON.stringify(VZ.petState(pet).dueItems),count:VZ.visitCount(pet.id),last:VZ.lastVisit(pet.id),records:JSON.stringify(VZ.db.records.filter(r=>r.petId===pet.id)),future:VZ.addDays(VZ.today(),7)};});
    await open('pet.html?id='+target.id);await page.locator('#missed-vaccination').click();await page.locator('#workflow-form [data-cancel]').click();assert.equal(await page.evaluate(id=>JSON.stringify(VZ.db.records.filter(r=>r.petId===id)),target.id),target.records);
    await page.locator('#missed-vaccination').click();await page.locator('#workflow-form [name=notes]').fill('Owner did not attend vaccination');await page.locator('#workflow-form [name=nextDue]').fill(target.future);
    await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/v14-missed-vaccination-mobile.png',fullPage:true});assert.equal(await page.locator('#workflow-form button[type=submit]').isVisible(),true);await page.locator('#workflow-form button[type=submit]').click();await page.setViewportSize({width:1280,height:900});
    const request=await page.evaluate(()=>VZ.db.records.at(-1));assert.equal(request.type,'missed_vaccination');assert.equal(request.status,'pending');assert.ok((await page.locator('main').innerText()).includes('Missed vaccination:'));await logout();await login('admin','admin123');await open('approvals.html');await page.locator('[data-tab=medical]').click();
    await page.locator('[data-review-rec="'+request.id+'"]').click();await page.getByRole('button',{name:'Approve',exact:true}).click();
    await open('pet.html?id='+target.id);assert.ok((await page.locator('#pet-vaccinations').innerText()).includes('Missed vaccination:'));await page.locator('#pet-vaccinations .visit-details summary').click();assert.ok((await page.locator('#pet-vaccinations').innerText()).includes('dose still due'));
    const after=await page.evaluate(id=>({due:JSON.stringify(VZ.petState(VZ.findPet(id)).dueItems),count:VZ.visitCount(id),last:VZ.lastVisit(id)}),target.id);assert.equal(after.due,target.due);assert.equal(after.count,target.count);assert.equal(after.last,target.last);
    await page.locator('#missed-vaccination').click();await page.locator('#workflow-form button[type=submit]').click();assert.ok((await page.locator('#workflow-form .form-error').innerText()).includes('already'));await page.keyboard.press('Escape');await page.screenshot({path:'/tmp/v14-vaccination-desktop.png',fullPage:true});await page.reload();assert.ok((await page.locator('#pet-vaccinations').innerText()).includes('Missed vaccination:'));assert.deepEqual(errors,[]);
    console.log('PASS: V14 missed vaccination browser cancellation, mobile form, staff pending/admin approval, distinct attendance history, original overdue reminders, counts, duplicate guard and persistence.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
