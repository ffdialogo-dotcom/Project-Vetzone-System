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
    const target=await page.evaluate(()=>{const r=VZ.clinicDueReminders().find(r=>r.type==='vaccination'&&r.date<VZ.today());return {...r,name:VZ.findPet(r.petId).name,records:JSON.stringify(VZ.db.records),appointments:VZ.db.appointments.length,future:VZ.addDays(VZ.today(),365)};});
    await open('clinic.html?date='+target.date);assert.ok((await page.locator('[data-calendar-date="'+target.date+'"]').innerText()).includes('due'));const row=page.locator('[data-due-reminder="'+target.sourceRecordId+'"]');assert.ok((await row.innerText()).includes(target.name));assert.ok((await row.innerText()).includes('Overdue reminder'));assert.equal(await row.locator('[data-manage-appointment]').count(),0);assert.equal(await page.evaluate(()=>VZ.db.appointments.length),target.appointments);assert.equal(await page.evaluate(()=>JSON.stringify(VZ.db.records)),target.records);
    await page.screenshot({path:'/tmp/v17-clinic-due-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/v17-clinic-due-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});
    await row.getByRole('link',{name:'Open pet record'}).click();await page.waitForURL('**/pet.html?id='+target.petId);assert.ok((await page.locator('#pet-vaccinations').innerText()).includes('Overdue'));await page.locator('#add-rec').click();await page.locator('#rec-form [name=title]').fill(target.purpose.split(' · ')[0]);await page.locator('#rec-form [name=nextDue]').fill(target.future);await page.locator('#rec-form button[type=submit]').click();const pending=await page.evaluate(()=>VZ.db.records.at(-1));assert.equal(pending.status,'pending');await open('clinic.html?date='+target.date);assert.equal(await page.locator('[data-due-reminder="'+target.sourceRecordId+'"]').count(),1);
    await logout();await login('admin','admin123');await open('approvals.html');await page.locator('[data-tab=medical]').click();await page.locator('[data-review-rec="'+pending.id+'"]').click();await page.locator('[data-decide=approve]').click();await open('clinic.html?date='+target.date);assert.equal(await page.locator('[data-due-reminder="'+target.sourceRecordId+'"]').count(),0);await open('clinic.html?date='+target.future);assert.ok((await page.locator('[data-due-reminder="'+pending.id+'"]').innerText()).includes('Due reminder'));await page.reload();assert.equal(await page.locator('[data-due-reminder="'+pending.id+'"]').count(),1);assert.equal(await page.evaluate(()=>VZ.db.appointments.length),target.appointments);assert.deepEqual(errors,[]);
    console.log('PASS: V17 calendar automatically displays approved pet vaccination/checkup due reminders, separates them from bookings, opens correct pet profile, waits for staff approval, moves latest vaccine due dates, mobile layout, nonmutation and persistence.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
