'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let clock='2026-10-14T12:00:00';
class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return new Date(clock).getTime();}}
function load(memory=new Map()){
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const c={window:{},localStorage:storage,sessionStorage:storage,Date:Clock,Math,console};vm.createContext(c);
 for(const f of ['app.js','workflow-data.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/',f),'utf8'),c);
 return {V:c.window.VZ,memory};
}
function ok(r){assert.equal(r.ok,true,r.error||JSON.stringify(r.errors));return r;}
function unchanged(V,fn){const b=JSON.stringify(V.db);assert.equal(fn().ok,false);assert.equal(JSON.stringify(V.db),b);}
const state=load(),V=state.V;ok(V.login('staff1','staff123'));
const p=V.db.products.find(p=>V.info(p).sellable>=4), stock=V.info(p).sellable,svc=V.db.services[0];
const sale=ok(V.recordSale([{productId:p.id,qty:2},{productId:svc.id,qty:1}],10,'Online payment')).sale;
assert.equal(V.info(p).sellable,stock-2);assert.equal(sale.items[1].kind,'service');assert.equal(sale.items[1].allocations.length,0);assert.equal(sale.items[0].allocations.reduce((s,a)=>s+a.qty,0),2);
const originalItems=JSON.stringify(sale.items),rq=ok(V.requestSaleReversal(sale.id,'Wrong quantity recorded')).request;
unchanged(V,()=>V.requestSaleReversal(sale.id,'Duplicate'));
unchanged(V,()=>V.reviewWorkflow(rq.id,'approve','',{refundConfirmed:true,refundMethod:'Cash'}));
ok(V.login('admin','admin123'));unchanged(V,()=>V.reviewWorkflow(rq.id,'approve',''));
unchanged(V,()=>V.reviewWorkflow(rq.id,'approve','',{refundConfirmed:true,refundMethod:'Cash',returns:[{lineIndex:0,qty:1}]}));
ok(V.reviewWorkflow(rq.id,'approve','',{refundConfirmed:true,refundMethod:'Cash',returns:[{lineIndex:0,qty:1,usableConfirmed:true}]}));
assert.equal(V.info(p).sellable,stock-1);assert.equal(JSON.stringify(sale.items),originalItems);assert.equal(sale.status,'voided');
assert.equal(V.aggregate([sale]).n,0);assert.equal(V.aggregate([sale]).net,0);assert.equal(V.salesBetween(V.today(),V.today()).some(s=>s.id===sale.id),false);assert.equal(V.refundsBetween(V.today(),V.today()).length,1);
unchanged(V,()=>V.reviewWorkflow(rq.id,'approve','',{refundConfirmed:true,refundMethod:'Cash'}));
const sale2=ok(V.recordSale([{productId:p.id,qty:1}],0,'Online payment')).sale,rq2=ok(V.requestSaleReversal(sale2.id,'Opened and damaged item')).request,beforeZero=V.info(p).sellable;
ok(V.reviewWorkflow(rq2.id,'approve','',{refundConfirmed:true,refundMethod:'Online payment'}));assert.equal(V.info(p).sellable,beforeZero,'Default reversal must not restock');
const sale3=ok(V.recordSale([{productId:p.id,qty:1}],0,'Online payment')).sale,rq3=ok(V.requestSaleReversal(sale3.id,'Expired return')).request;
const soldBatch=V.db.batches.find(b=>b.id===sale3.items[0].allocations[0].batchId);soldBatch.archived=true;
unchanged(V,()=>V.reviewWorkflow(rq3.id,'approve','',{refundConfirmed:true,refundMethod:'Cash',returns:[{lineIndex:0,qty:1,usableConfirmed:true}]}));
ok(V.reviewWorkflow(rq3.id,'approve','',{refundConfirmed:true,refundMethod:'Cash'}));
const old=V.db.sales.find(s=>s.items.some(i=>!i.allocations));const oldRq=ok(V.requestSaleReversal(old.id,'Older recorded sale')).request;
unchanged(V,()=>V.reviewWorkflow(oldRq.id,'approve','',{refundConfirmed:true,refundMethod:'Cash',returns:[{lineIndex:0,qty:1,usableConfirmed:true}]}));
ok(V.reviewWorkflow(oldRq.id,'reject','Cannot verify this refund.'));
// Receiving validates every line before applying, and staff submissions require approval.
const delivery={supplier:'Test Supplier',reference:'DEL-13',date:V.today(),lines:[{productId:p.id,qty:4,unitCost:10.25,lot:'LOT-13',expiry:V.addDays(V.today(),90)}]};
unchanged(V,()=>V.receiveDelivery({...delivery,lines:[...delivery.lines,{...delivery.lines[0],lot:'BAD',qty:0}]}));
ok(V.login('staff1','staff123'));const batchesBefore=JSON.stringify(V.db.batches),pending=ok(V.receiveDelivery(delivery)).request;
assert.equal(JSON.stringify(V.db.batches),batchesBefore);unchanged(V,()=>V.receiveDelivery(delivery));
unchanged(V,()=>V.saveService(null,{name:'Forbidden',price:100}));assert.equal(V.costSummary(),null);
ok(V.login('admin','admin123'));ok(V.reviewWorkflow(pending.id,'approve',''));const received=V.db.receivings.at(-1),batch=V.db.batches.find(b=>b.id===received.lines[0].batchId);
assert.equal(received.totalCost,41);assert.equal(received.submittedBy,'staff1');assert.equal(batch.unitCost,10.25);assert.equal(batch.qty,4);
unchanged(V,()=>V.receiveDelivery(delivery));unchanged(V,()=>V.recordStockLoss({batchId:batch.id,qty:5,date:V.today(),reason:'Damaged',notes:'Broken packaging'}));
ok(V.login('staff1','staff123'));const loss=ok(V.recordStockLoss({batchId:batch.id,qty:2,date:V.today(),reason:'Damaged',notes:'Broken packaging'})).request;assert.equal(batch.qty,4);
ok(V.login('admin','admin123'));ok(V.reviewWorkflow(loss.id,'approve',''));assert.equal(batch.qty,2);assert.equal(V.costSummary().lossCost,20.5);
ok(V.saveService(null,{name:'Dental cleaning',price:550,active:true}));assert.ok(V.db.services.some(s=>s.name==='Dental cleaning'));
// Controlled edits preserve IDs, treatment and complete medical history; stale owner changes cannot overwrite.
const pet=V.db.pets[0],history=JSON.stringify(V.db.records),petId=pet.id,health=pet.status,details={...V.petSnapshot(pet),name:'Updated pet'};
ok(V.login('staff1','staff123'));const edit=ok(V.editPetDetails(pet.id,details)).request;assert.notEqual(pet.name,details.name);
ok(V.login('admin','admin123'));ok(V.reviewWorkflow(edit.id,'approve',''));assert.equal(pet.name,'Updated pet');assert.equal(pet.id,petId);assert.equal(pet.status,health);assert.equal(JSON.stringify(V.db.records),history);
ok(V.login('staff1','staff123'));const stale=ok(V.editPetDetails(pet.id,{...V.petSnapshot(pet),breed:'New breed'})).request;V.findOwner(pet.ownerId).phone='09123456789';
ok(V.login('admin','admin123'));unchanged(V,()=>V.reviewWorkflow(stale.id,'approve',''));ok(V.reviewWorkflow(stale.id,'reject','Owner contact changed.'));
// Appointment history, attendance, separate physical stays and role-controlled pickup/release.
ok(V.login('staff1','staff123'));const appt=ok(V.bookAppointment({petId:pet.id,date:V.today(),time:'13:00',purpose:'Checkup'})).appointment;
unchanged(V,()=>V.bookAppointment({petId:pet.id,date:V.today(),time:'13:00',purpose:'Consultation'}));
unchanged(V,()=>V.changeAppointment(appt.id,'attended'));ok(V.changeAppointment(appt.id,'reschedule',{date:V.today(),time:'14:00'}));assert.equal(appt.status,'rescheduled');
const next=V.db.appointments.find(a=>a.id===appt.nextId);assert.equal(next.previousId,appt.id);clock='2026-10-14T15:00:00';
const visits=V.visitCount(pet.id),last=V.lastVisit(pet.id);ok(V.changeAppointment(next.id,'attended'));assert.equal(V.visitCount(pet.id),visits);assert.equal(V.lastVisit(pet.id),last);assert.equal(pet.status,health);assert.ok(V.activeStay(pet.id));
unchanged(V,()=>V.markReadyForPickup(pet.id));unchanged(V,()=>V.admitPet(pet.id,'Duplicate'));
ok(V.login('admin','admin123'));ok(V.markReadyForPickup(pet.id));assert.equal(V.activeStay(pet.id).status,'awaiting_pickup');
ok(V.login('staff1','staff123'));const release=ok(V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Owner'}));assert.ok(V.activeStay(pet.id));
ok(V.login('admin','admin123'));ok(V.reviewRecord(release.record.id,'approve',''));assert.equal(V.activeStay(pet.id),null);assert.equal(pet.status,health);
const other=V.db.pets[1];clock='2026-10-14T12:00:00';ok(V.login('staff1','staff123'));
const missed=ok(V.bookAppointment({petId:other.id,date:V.today(),time:'14:00',purpose:'Consultation'})).appointment;
unchanged(V,()=>V.changeAppointment(missed.id,'missed'));clock='2026-10-14T15:00:00';ok(V.changeAppointment(missed.id,'missed',{notes:'Owner did not arrive'}));assert.ok(missed.pendingRecordId);assert.equal(missed.status,'scheduled');
unchanged(V,()=>V.changeAppointment(missed.id,'cancel',{reason:'Waiting review'}));ok(V.login('admin','admin123'));
ok(V.reviewRecord(missed.pendingRecordId,'reject','Owner attended another time.'));assert.equal(missed.pendingRecordId,undefined);ok(V.changeAppointment(missed.id,'missed'));assert.equal(missed.status,'missed');
const dead=V.db.pets[2];ok(V.admitPet(dead.id,'Observation'));const deadAppt=ok(V.bookAppointment({petId:dead.id,date:V.addDays(V.today(),1),time:'09:00',purpose:'Checkup'})).appointment;
ok(V.requestPetDeath(dead.id,{date:V.today(),location:'At clinic'}));assert.equal(V.activeStay(dead.id),null);assert.equal(deadAppt.status,'cancelled');
const restored=load(state.memory).V;assert.equal(restored.db.sales.find(s=>s.id===sale.id).status,'voided');assert.equal(restored.db.receivings.at(-1).totalCost,41);assert.equal(restored.db.clinicStays.find(s=>s.petId===pet.id).status,'released');
// Profile attendance uses the same calendar entry; approval alone creates the new schedule.
clock='2026-10-14T12:00:00';
const linkedState=load(),L=linkedState.V;ok(L.login('staff1','staff123'));
const linkedPet=L.db.pets.find(p=>L.checkupAppointment(p.id));
const linkedAppt=ok(L.bookAppointment({petId:linkedPet.id,date:L.today(),time:'14:00',purpose:'Checkup'})).appointment;
clock='2026-10-14T15:00:00';
const linkedPlan=L.checkupAppointment(linkedPet.id);
const pendingProfile=ok(L.addPetEvent(linkedPet.id,'missed_checkup',{date:linkedPlan.date,sourceRecordId:linkedPlan.recordId,nextDue:L.addDays(L.today(),2)}));
assert.equal(pendingProfile.record.appointmentId,linkedAppt.id);assert.equal(linkedAppt.pendingRecordId,pendingProfile.record.id);
unchanged(L,()=>L.changeAppointment(linkedAppt.id,'attended'));
assert.equal(L.db.appointments.length,1);ok(L.login('admin','admin123'));ok(L.reviewRecord(pendingProfile.record.id,'approve',''));
assert.equal(linkedAppt.status,'missed');assert.equal(L.db.appointments.length,2);assert.equal(L.checkupAppointment(linkedPet.id).date,L.addDays(L.today(),2));
assert.equal(L.db.appointments[1].previousId,linkedAppt.id);
// V12 data migration is additive and retains every existing record, stock batch and ID.
const migration=load();for(const k of ['services','workflowRequests','appointments','clinicStays','receivings','stockLosses'])delete migration.V.db[k];
const retained={};for(const k of ['pets','owners','records','products','batches','sales','users'])retained[k]=JSON.stringify(migration.V.db[k]);migration.V.save();
const migrated=load(migration.memory).V;for(const k of Object.keys(retained))assert.equal(JSON.stringify(migrated.db[k]),retained[k]);
assert.equal(migrated.db.appointments.length,0);assert.equal(migrated.db.services.length,3);
console.log('PASS: V13 mixed service/product billing, traced/default-zero reversals, admin permissions, duplicate and unsafe returns, atomic receiving, costs/losses, controlled and stale edits, appointment history and attendance, approval/rejection, separate clinic stays, releases, deceased closure and persistence.');
