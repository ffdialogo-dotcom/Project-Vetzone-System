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
    async function open(path){await page.goto(baseURL+path,{waitUntil:'load'});}
    async function login(user,password){await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#login-form button[type=submit]').click();await page.waitForURL('**/dashboard.html');}
    async function logout(){await page.locator('#user-btn').click();await page.locator('#logout-btn').click();await page.waitForURL('**/index.html');}
    async function review(id,decision,note){
      await open('approvals.html');await page.locator('[data-tab=medical]').click();await page.locator(`[data-review-rec="${id}"]`).click();
      if(decision==='reject'){
        await page.locator('[data-decide=reject]').click();assert.equal(await page.locator('#review-form [name=note]').getAttribute('aria-invalid'),'true');
        await page.locator('#review-form [name=note]').fill(note);
      }
      await page.locator('[data-decide='+decision+']').click();await page.waitForSelector('#review-form',{state:'detached'});
    }
    await open('index.html');await login('staff1','staff123');
    const baseline=await page.evaluate(()=>{
      const p=VZ.db.pets[0],missedPet=VZ.db.pets.find(p=>{const a=VZ.checkupAppointment(p.id);return a&&a.date<VZ.today();});
      return {pet:p.id,status:p.status,count:VZ.visitCount(p.id),last:VZ.lastVisit(p.id),totalRecords:VZ.db.records.length,
        missedPet:missedPet.id,missedCount:VZ.visitCount(missedPet.id),missedLast:VZ.lastVisit(missedPet.id),plan:VZ.checkupAppointment(missedPet.id),future:VZ.addDays(VZ.today(),7)};
    });
    await open('pet.html?id='+baseline.pet);assert.equal(await page.locator('#release-pet').innerText(),'Request pet release');
    assert.equal(await page.locator('#missed-checkup').isDisabled(),true,'Upcoming scheduled checkup cannot be marked missed');
    await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=release]').click();assert.equal(await page.locator('.modal-overlay').count(),1);await page.locator('#pet-event-form [data-cancel]').click();
    assert.equal(await page.evaluate(()=>VZ.db.records.length),baseline.totalRecords);
    await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=release]').click();await page.locator('#pet-event-form [name=receivedBy]').fill('');await page.locator('#pet-event-form button[type=submit]').click();
    assert.equal(await page.locator('#pet-event-form [name=receivedBy]').getAttribute('aria-invalid'),'true');
    await page.locator('#pet-event-form [name=receivedBy]').fill('Owner test');await page.locator('#pet-event-form [name=notes]').fill('Continue prescribed home care.');
    await page.evaluate(()=>{const f=document.querySelector('#pet-event-form');f.requestSubmit();f.requestSubmit();});await page.waitForSelector('#pet-event-form',{state:'detached'});
    const releaseId=await page.evaluate(id=>VZ.db.records.find(r=>r.petId===id&&r.type==='release').id,baseline.pet);
    assert.equal(await page.evaluate(id=>VZ.db.records.filter(r=>r.petId===id&&r.type==='release').length,baseline.pet),1);
    assert.equal(await page.locator('#pet-release-details').innerText(),'');
    await page.locator('#pet-waiting .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-waiting').innerText()).includes('Released home'));
    assert.ok(!(await page.locator('#pet-visits').innerText()).includes('Released home'));
    await open('pet.html?id='+baseline.missedPet);await page.locator('#missed-checkup').click();
    assert.equal(await page.locator('#pet-event-form [name=date]').inputValue(),baseline.plan.date);
    await page.locator('#pet-event-form [name=notes]').fill('Owner did not attend the checkup.');
    await page.locator('#pet-event-form [name=nextDue]').fill(baseline.future);await page.locator('#pet-event-form button[type=submit]').click();await page.waitForSelector('#pet-event-form',{state:'detached'});
    let missedId=await page.evaluate(id=>VZ.db.records.find(r=>r.petId===id&&r.type==='missed_checkup').id,baseline.missedPet);
    assert.equal(await page.evaluate(id=>VZ.checkupAppointment(id).date,baseline.missedPet),baseline.plan.date);
    await page.locator('#pet-waiting .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-waiting').innerText()).includes('Did not attend'));
    await logout();await login('admin','admin123');
    await review(releaseId,'approve');await open('pet.html?id='+baseline.pet);
    assert.ok((await page.locator('#pet-release-details').innerText()).includes('Owner test'));
    await page.locator('#pet-visits .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-visits').innerText()).includes('Continue prescribed home care.'));
    assert.equal(await page.locator('#pet-status').inputValue(),baseline.status);
    assert.equal(await page.evaluate(id=>VZ.visitCount(id),baseline.pet),baseline.count);assert.equal(await page.evaluate(id=>VZ.lastVisit(id),baseline.pet),baseline.last);
    await page.reload();assert.ok((await page.locator('#pet-release-details').innerText()).includes('Owner test'));
    await review(missedId,'reject','Please confirm the revised appointment date.');
    await logout();await login('staff1','staff123');await open('pet.html?id='+baseline.missedPet);
    await page.locator('#pet-waiting .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-waiting').innerText()).includes('Please confirm the revised appointment date.'));
    await page.locator('#missed-checkup').click();await page.locator('#pet-event-form [name=notes]').fill('Owner confirmed the new date.');await page.locator('#pet-event-form [name=nextDue]').fill(baseline.future);
    await page.locator('#pet-event-form button[type=submit]').click();await page.waitForSelector('#pet-event-form',{state:'detached'});
    missedId=await page.evaluate(id=>VZ.db.records.find(r=>r.petId===id&&r.type==='missed_checkup'&&r.status==='pending').id,baseline.missedPet);
    await logout();await login('admin','admin123');await review(missedId,'approve');await open('pet.html?id='+baseline.missedPet);
    await page.locator('#pet-visits .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-visits').innerText()).includes('Owner did not attend checkup'));
    await page.locator('#pet-visits .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-visits').innerText()).includes('Rescheduled checkup'));
    assert.equal(await page.evaluate(id=>VZ.checkupAppointment(id).date,baseline.missedPet),baseline.future);
    assert.equal(await page.evaluate(id=>VZ.petState(VZ.findPet(id)).dueItems.find(d=>d.type==='checkup').due,baseline.missedPet),baseline.future);
    assert.equal(await page.evaluate(id=>VZ.visitCount(id),baseline.missedPet),baseline.missedCount);assert.equal(await page.evaluate(id=>VZ.lastVisit(id),baseline.missedPet),baseline.missedLast);
    await page.reload();await page.locator('#pet-visits .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-visits').innerText()).includes('Owner did not attend checkup'));
    const manual=await page.evaluate(()=>VZ.db.pets.find(p=>!VZ.checkupAppointment(p.id)).id);await open('pet.html?id='+manual);
    const beforeManual=await page.evaluate(id=>({count:VZ.visitCount(id),last:VZ.lastVisit(id),status:VZ.findPet(id).status}),manual);
    assert.equal(await page.locator('#release-pet').innerText(),'Release pet home');await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=release]').click();
    await page.locator('#pet-event-form [name=receivedBy]').fill('Owner direct');await page.locator('#pet-event-form [name=notes]').fill('Discharged home by admin.');await page.locator('#pet-event-form button[type=submit]').click();await page.waitForSelector('#pet-event-form',{state:'detached'});
    assert.ok((await page.locator('#pet-release-details').innerText()).includes('Owner direct'));
    assert.equal(await page.evaluate(id=>VZ.db.records.find(r=>r.petId===id&&r.type==='release').status,manual),'approved');
    await page.locator('#missed-checkup').click();assert.equal(await page.locator('#pet-event-form [name=sourceRecordId]').count(),0);assert.equal(await page.locator('#pet-event-form [name=nextDue]').count(),0);
    await page.locator('#pet-event-form [name=notes]').fill('Owner did not attend the arranged checkup.');await page.locator('#pet-event-form button[type=submit]').click();await page.waitForSelector('#pet-event-form',{state:'detached'});
    await page.locator('#pet-visits .visit-details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));assert.ok((await page.locator('#pet-visits').innerText()).includes('No examination or treatment took place.'));
    assert.equal(await page.evaluate(id=>VZ.visitCount(id),manual),beforeManual.count);assert.equal(await page.evaluate(id=>VZ.lastVisit(id),manual),beforeManual.last);assert.equal(await page.locator('#pet-status').inputValue(),beforeManual.status);
    await page.setViewportSize({width:375,height:812});await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=release]').click();assert.equal(await page.locator('#pet-event-form button[type=submit]').isVisible(),true);await page.locator('#pet-event-form [data-cancel]').click();
    assert.deepEqual(errors,[]);console.log('PASS: release cancellation/recipient validation/duplicate guard, staff approval, direct admin release, history and health preservation, missed-checkup rejection/resubmission/approval, reminder rescheduling, unchanged counts/last visit, manual no-shows, persistence, future schedule guard and mobile forms.');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
