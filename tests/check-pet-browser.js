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
    const errors=[]; const observations={}; page.on('pageerror',e=>errors.push(e.message));
    async function open(path){const r=await page.goto(baseURL+path,{waitUntil:'load'});assert.equal(r.status(),200);}
    async function login(user,password){await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#login-form button[type=submit]').click();await page.waitForURL('**/dashboard.html');}
    async function logout(){await page.locator('#user-btn').click();await page.locator('#logout-btn').click();await page.waitForURL('**/index.html');}
    async function submitDeath(petId,notes){
      await open('pet.html?id='+petId);
      await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=death]').click();
      await page.locator('#death-request-form [name=location]').selectOption('At clinic');
      await page.locator('#death-request-form [name=notes]').fill(notes);
      await page.locator('#death-request-form button[type=submit]').click();
      await page.waitForSelector('#death-request-form',{state:'detached'});
      assert.ok((await page.locator('#pet-death-requests').innerText()).includes('pending admin approval'));
      assert.equal(await page.locator('#request-deceased').isVisible(),false);
      return page.evaluate(id=>VZ.db.petStatusRequests.find(r=>r.petId===id&&r.status==='pending').id,petId);
    }
    await open('index.html');
    await page.locator('#username').fill('staff1');await page.locator('#password').fill('incorrect');
    await page.locator('#login-form button[type=submit]').click();assert.equal(await page.locator('#login-error').isVisible(),true);
    await login('staff1','staff123');assert.equal(await page.locator('#dashboard-sales-card').isVisible(),false);
    await open('profile.html');assert.match(await page.locator('#me-name').innerText(),/STF-\d{4,}/);
    await open('inventory.html');assert.match(await page.locator('#rows').innerText(),/ITM-\d{4,}/);
    const initial=await page.evaluate(()=>{
      const pet=VZ.db.pets.find(p=>VZ.petState(p).dueItems.length>0);
      const other=VZ.db.pets.find(p=>p.id!==pet.id);
      return {petId:pet.id,petName:pet.name,otherId:other.id,status:pet.status,birth:pet.birth,records:JSON.stringify(VZ.db.records.filter(r=>r.petId===pet.id)),reminders:VZ.petState(pet).dueItems.length};
    });
    await open('pet.html?id='+initial.petId);
    await page.locator('#add-visit').click();assert.equal(await page.locator('.modal-overlay').count(),1);await page.keyboard.press('Escape');
    const approvedRequest=await submitDeath(initial.petId,'Confirmed staff report');
    assert.equal(await page.evaluate(id=>VZ.findPet(id).status,initial.petId),initial.status);
    const controls=await page.evaluate(({id,requestId})=>({duplicate:VZ.requestPetDeath(id,{date:VZ.today(),location:'At clinic'}).ok,staffReview:VZ.reviewPetDeath(requestId,'approve','').ok}),{id:initial.petId,requestId:approvedRequest});
    assert.deepEqual(controls,{duplicate:false,staffReview:false});
    await page.locator('#add-visit').click();
    observations.visitDialogsAfterDeathSubmission=await page.locator('.modal-overlay').count();
    assert.equal(observations.visitDialogsAfterDeathSubmission,1,'One click must open exactly one visit form after a deceased request rerenders the page');
    await page.keyboard.press('Escape');
    await page.locator('#add-rec').click();observations.vaccinationDialogsAfterDeathSubmission=await page.locator('.modal-overlay').count();await page.keyboard.press('Escape');
    assert.equal(observations.vaccinationDialogsAfterDeathSubmission,1);
    // Repeated renders must not stack status handlers or visit handlers.
    for(const status of [initial.status==='Healthy'?'In Treatment':'Healthy',initial.status]){
      const activityBefore=await page.evaluate(()=>VZ.db.activity.length);
      await page.locator('#pet-status').selectOption(status);
      assert.equal(await page.evaluate(()=>VZ.db.activity.length),activityBefore+1,'Each status change must be applied once');
    }
    await page.locator('#add-visit').click();
    assert.equal(await page.locator('.modal-overlay').count(),1);
    const visitForm=page.locator('.modal-overlay form');
    for(const [name,value] of Object.entries({reason:'Visit handler regression',happened:'Follow-up visit',exam:'None',treatment:'None',outcome:'Improving'}))await visitForm.locator('[name='+name+']').fill(value);
    await visitForm.locator('button[type=submit]').click();
    await page.waitForSelector('.modal-overlay',{state:'detached'});
    assert.equal(await page.evaluate(id=>VZ.db.records.filter(r=>r.petId===id&&r.title==='Visit handler regression').length,initial.petId),1,'One visit submission must create exactly one record');
    initial.records=await page.evaluate(id=>JSON.stringify(VZ.db.records.filter(r=>r.petId===id)),initial.petId);
    await page.locator('#add-visit').click();assert.equal(await page.locator('.modal-overlay').count(),1);await page.keyboard.press('Escape');
    observations.singleVisitAfterRepeatedRenders=true;
    await page.reload();assert.ok((await page.locator('#pet-death-requests').innerText()).includes('pending admin approval'));
    const rejectedRequest=await submitDeath(initial.otherId,'Report needing confirmation');
    await open('approvals.html');assert.ok((await page.locator('#approvals-body').innerText()).includes('deceased status request'));assert.equal(await page.locator('[data-review-death]').count(),0);
    await logout();await login('admin','admin123');assert.equal(await page.locator('#dashboard-sales-card').isVisible(),true);
    await open('staff.html');assert.match(await page.locator('#staff-rows').innerText(),/STF-\d{4,}/);
    await open('approvals.html');await page.locator('[data-tab=death]').click();
    await page.locator(`[data-review-death="${approvedRequest}"]`).click();
    assert.ok((await page.locator('.modal-body').innerText()).includes('Confirmed staff report'));
    await page.locator('[data-decide=approve]').click();await page.waitForSelector('#review-form',{state:'detached'});
    await page.locator(`[data-review-death="${rejectedRequest}"]`).click();
    await page.locator('[data-decide=reject]').click();assert.equal(await page.locator('#review-form [name=note]').getAttribute('aria-invalid'),'true');
    await page.locator('#review-form [name=note]').fill('Insufficient confirmation');await page.locator('[data-decide=reject]').click();await page.waitForSelector('#review-form',{state:'detached'});
    await open('pet.html?id='+initial.petId);
    assert.equal(await page.locator('#pet-status').isDisabled(),true);assert.equal(await page.locator('#pet-status').inputValue(),'Deceased');assert.equal(await page.locator('#request-deceased').isVisible(),false);
    assert.ok((await page.locator('#pet-deceased-details').innerText()).includes('At clinic'));
    const verified=await page.evaluate(({id,requestId,otherRequest})=>({
      status:VZ.findPet(id).status,records:JSON.stringify(VZ.db.records.filter(r=>r.petId===id)),due:VZ.petState(VZ.findPet(id)).dueItems.length,
      notifications:VZ.notifications().filter(n=>n.kind==='pet'&&n.href==='pet.html?id='+id).length,
      request:VZ.db.petStatusRequests.find(r=>r.id===requestId).status,rejected:VZ.db.petStatusRequests.find(r=>r.id===otherRequest).status,
      duplicateApproval:VZ.reviewPetDeath(requestId,'approve','').ok,reactivation:VZ.setPetStatus(id,'Healthy').ok
    }),{id:initial.petId,requestId:approvedRequest,otherRequest:rejectedRequest});
    assert.equal(verified.status,'Deceased');assert.equal(verified.records,initial.records);assert.equal(verified.due,0);assert.equal(verified.notifications,0);assert.equal(verified.request,'approved');assert.equal(verified.rejected,'rejected');assert.equal(verified.duplicateApproval,false);assert.equal(verified.reactivation,false);
    await open('pets.html');await page.locator('#status').selectOption('Deceased');assert.ok((await page.locator('#pets').innerText()).includes(initial.petName));await page.locator('[data-view=list]').click();assert.ok((await page.locator('#pets').innerText()).includes(initial.petName));
    for(const path of ['dashboard.html','inventory.html','sales.html','pets.html','profile.html','income.html','staff.html','top-sellers.html','approvals.html']){await open(path);assert.ok(await page.locator('#main').innerText(),path);}
    await logout();await login('staff1','staff123');await open('approvals.html');
    assert.ok((await page.locator('#approvals-body').innerText()).includes('Insufficient confirmation'));
    // Regression: the actual HTML form must reject a pre-birth death date.
    const third=await page.evaluate(()=>VZ.db.pets.find(p=>!VZ.db.petStatusRequests.some(r=>r.petId===p.id)).id);
    await open('pet.html?id='+third);await page.locator('#pet-more-actions').click();await page.locator('[data-pet-action=death]').click();
    await page.locator('#death-request-form [name=date]').fill('1900-01-01');await page.locator('#death-request-form [name=location]').selectOption('At clinic');await page.locator('#death-request-form button[type=submit]').click();
    assert.equal(await page.locator('#death-request-form [name=date]').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(id=>VZ.db.petStatusRequests.filter(r=>r.petId===id).length,third),0);
    observations.preBirthDateRejectedThroughUI=true;
    await page.locator('#death-request-form [data-cancel]').click();
    await logout();await open('create-account.html');assert.equal(await page.locator('#create-form').isVisible(),true);
    assert.deepEqual(errors,[]);
    observations.browserErrors=errors;observations.functionalChecks='PASS';
    console.log('PASS: browser login and role views, staff/item ID rendering, pending deceased requests, staff restriction, duplicate guard, admin approval/rejection, rejection-note validation, reload persistence, preserved history, reminder suppression, deceased filtering, all application pages.');
    console.log('EDGE OBSERVATIONS:',JSON.stringify(observations));
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
