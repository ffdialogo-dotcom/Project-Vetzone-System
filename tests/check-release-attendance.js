'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function load(memory=new Map()){
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const ctx={window:{},localStorage:storage,sessionStorage:storage,Date,Math,console};vm.createContext(ctx);vm.runInContext(source,ctx);return{V:ctx.window.VZ,memory};
}
const state=load(),V=state.V,pet=V.db.pets[0];
const original=JSON.stringify(V.db.records),count=V.visitCount(pet.id),last=V.lastVisit(pet.id),health=pet.status;
V.login('staff1','staff123');
const release=V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Pet owner',notes:'Continue prescribed home care.'});
assert.equal(release.ok,true);assert.equal(release.pending,true);assert.equal(release.record.status,'pending');
assert.equal(V.petRecords(pet.id).some(r=>r.type==='release'),false);assert.equal(V.visitCount(pet.id),count);assert.equal(V.lastVisit(pet.id),last);
assert.equal(V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Another recipient'}).ok,false);
assert.equal(V.reviewRecord(release.record.id,'approve','').ok,false,'Staff cannot approve release');
V.login('admin','admin123');assert.equal(V.reviewRecord(release.record.id,'approve','').ok,true);
assert.equal(V.petRecords(pet.id).filter(r=>r.type==='release').length,1);assert.equal(V.visitCount(pet.id),count);assert.equal(V.lastVisit(pet.id),last);assert.equal(pet.status,health);
assert.equal(V.reviewRecord(release.record.id,'approve','').ok,false,'No double approval');
assert.equal(V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Pet owner',notes:'Continue prescribed home care.'}).ok,false);
assert.equal(JSON.stringify(V.db.records.slice(0,-1)),original,'Existing clinical history is unchanged');
const second=V.db.pets[1],direct=V.addPetEvent(second.id,'release',{date:V.today(),receivedBy:'Owner'});
assert.equal(direct.pending,false);assert.equal(direct.record.status,'approved');assert.equal(direct.record.reviewedBy,'admin');
const restored=load(state.memory).V;assert.equal(restored.db.records.find(r=>r.id===direct.record.id).receivedBy,'Owner');
for(const details of [{date:'2026-02-30',receivedBy:'Owner'},{date:V.addDays(V.today(),1),receivedBy:'Owner'},{date:'1900-01-01',receivedBy:'Owner'},{date:V.today(),receivedBy:''}]){
 const before=JSON.stringify(V.db);assert.equal(V.addPetEvent(V.db.pets[2].id,'release',details).ok,false);assert.equal(JSON.stringify(V.db),before);
}
// Pending release becomes unapprovable if the pet is later deceased; rejection still works.
V.login('staff1','staff123');const stale=V.addPetEvent(V.db.pets[2].id,'release',{date:V.today(),receivedBy:'Owner'});
V.login('admin','admin123');assert.equal(V.requestPetDeath(V.db.pets[2].id,{date:V.today(),location:'At clinic'}).ok,true);
assert.equal(V.reviewRecord(stale.record.id,'approve','').ok,false);assert.equal(stale.record.status,'pending');assert.equal(V.reviewRecord(stale.record.id,'reject','Pet deceased before release.').ok,true);
assert.equal(V.addPetEvent(V.db.pets[2].id,'missed_checkup',{date:V.today()}).ok,false);
const noShow=load(),N=noShow.V;
const target=N.db.pets.find(p=>{const a=N.checkupAppointment(p.id);return a&&a.date<N.today();});
const plan=N.checkupAppointment(target.id),previousCount=N.visitCount(target.id),previousLast=N.lastVisit(target.id),sourceDue=N.db.records.find(r=>r.id===plan.recordId).nextDue;
N.login('staff1','staff123');const future=N.addDays(N.today(),3);
const missed=N.addPetEvent(target.id,'missed_checkup',{date:plan.date,sourceRecordId:plan.recordId,notes:'Owner did not attend.',nextDue:future});
assert.equal(missed.pending,true);assert.equal(N.checkupAppointment(target.id).date,plan.date,'Pending reschedule must not change reminders');
assert.equal(N.addPetEvent(target.id,'missed_checkup',{date:plan.date,sourceRecordId:plan.recordId}).ok,false,'Duplicate missed date blocked');
N.login('admin','admin123');assert.equal(N.reviewRecord(missed.record.id,'approve','').ok,true);
assert.equal(N.checkupAppointment(target.id).date,future);assert.equal(N.checkupAppointment(target.id).missed,false);
assert.equal(N.visitCount(target.id),previousCount);assert.equal(N.lastVisit(target.id),previousLast);
assert.equal(N.db.records.find(r=>r.id===plan.recordId).nextDue,sourceDue,'Original schedule/history is preserved');
assert.equal(N.petState(target).dueItems.find(d=>d.type==='checkup').due,future);
const withoutReschedule=load(),W=withoutReschedule.V;W.login('admin','admin123');
const overdue=W.db.pets.find(p=>{const a=W.checkupAppointment(p.id);return a&&a.date<W.today();}),appointment=W.checkupAppointment(overdue.id);
const marked=W.addPetEvent(overdue.id,'missed_checkup',{date:appointment.date,sourceRecordId:appointment.recordId});assert.equal(marked.ok,true);
assert.equal(W.checkupAppointment(overdue.id).missed,true);assert.equal(W.petState(overdue).checkMissed,true);
assert.ok(W.notifications().some(n=>n.href==='pet.html?id='+overdue.id&&n.label==='Did not attend'));
assert.equal(W.addPetEvent(overdue.id,'missed_checkup',{date:appointment.date}).ok,false,'Manual entry cannot duplicate a linked missed appointment');
// A missed-date-only entry is supported when no prior schedule was saved.
const manual=W.db.pets.find(p=>!W.checkupAppointment(p.id)),manualCount=W.visitCount(manual.id);
assert.equal(W.addPetEvent(manual.id,'missed_checkup',{date:W.today(),notes:'Owner did not attend the arranged appointment.'}).ok,true);
assert.equal(W.visitCount(manual.id),manualCount);
const upcoming=W.db.pets.find(p=>{const a=W.checkupAppointment(p.id);return a&&a.date>W.today();}),up=W.checkupAppointment(upcoming.id);
assert.equal(W.addPetEvent(upcoming.id,'missed_checkup',{date:up.date,sourceRecordId:up.recordId}).ok,false,'Upcoming checkup cannot be marked missed');
const staleSchedule=load(),S=staleSchedule.V,stalePet=S.db.pets.find(p=>{const a=S.checkupAppointment(p.id);return a&&a.date<S.today();}),oldPlan=S.checkupAppointment(stalePet.id);
S.login('staff1','staff123');const pending=S.addPetEvent(stalePet.id,'missed_checkup',{date:oldPlan.date,sourceRecordId:oldPlan.recordId});
S.db.records.find(r=>r.id===oldPlan.recordId).nextDue=S.addDays(S.today(),5);S.login('admin','admin123');
assert.equal(S.reviewRecord(pending.record.id,'approve','').ok,false,'Approval must recheck a changed schedule');
assert.equal(S.reviewRecord(pending.record.id,'reject','Schedule was changed; please review.').ok,true);
console.log('PASS: staff/admin release approval, duplicate/date/recipient/deceased guards, preserved history and clinical state, pending and approved missed-checkup reminders, rescheduling, unchanged visit counts/last visit, manual no-shows, future/stale schedules and reload persistence.');
