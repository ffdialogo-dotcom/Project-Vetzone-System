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
const {V,memory}=load();ok(V.login('staff1','staff123'));const pet=V.db.pets.find(p=>V.overdueVaccinations(p.id).length),source=V.overdueVaccinations(pet.id)[0];
const original=JSON.stringify(source),visits=V.visitCount(pet.id),last=V.lastVisit(pet.id),due=JSON.stringify(V.petState(pet).dueItems);
const r=ok(V.addMissedVaccination(pet.id,{sourceRecordId:source.id,date:source.nextDue,notes:'Owner did not attend',nextDue:V.addDays(V.today(),7)}));
assert.equal(r.pending,true);assert.equal(V.petRecords(pet.id).some(x=>x.id===r.record.id),false);unchanged(V,()=>V.reviewRecord(r.record.id,'approve',''));
unchanged(V,()=>V.addMissedVaccination(pet.id,{sourceRecordId:source.id,date:source.nextDue}));ok(V.login('admin','admin123'));ok(V.reviewRecord(r.record.id,'approve',''));
assert.equal(JSON.stringify(source),original);assert.equal(JSON.stringify(V.petState(pet).dueItems),due);assert.equal(V.visitCount(pet.id),visits);assert.equal(V.lastVisit(pet.id),last);assert.equal(r.record.type,'missed_vaccination');
unchanged(V,()=>V.reviewRecord(r.record.id,'approve',''));assert.equal(load(memory).V.db.records.find(x=>x.id===r.record.id).status,'approved');
const other=V.db.pets.find(p=>p.id!==pet.id);ok(V.addRecord(other.id,{type:'vaccination',date:V.addDays(V.today(),-30),title:'Test vaccine',nextDue:V.addDays(V.today(),-5)}));const otherSource=V.overdueVaccinations(other.id)[0];
unchanged(V,()=>V.addMissedVaccination(other.id,{sourceRecordId:otherSource.id,date:otherSource.nextDue,nextDue:'2026-02-30'}));
ok(V.login('staff1','staff123'));const rejected=ok(V.addMissedVaccination(other.id,{sourceRecordId:otherSource.id,date:otherSource.nextDue}));ok(V.login('admin','admin123'));ok(V.reviewRecord(rejected.record.id,'reject','Date needs confirmation.'));const direct=ok(V.addMissedVaccination(other.id,{sourceRecordId:otherSource.id,date:otherSource.nextDue}));assert.equal(direct.pending,false);
const fresh=load().V;ok(fresh.login('staff1','staff123'));const stalePet=fresh.db.pets.find(p=>fresh.overdueVaccinations(p.id).length),staleSource=fresh.overdueVaccinations(stalePet.id)[0];const stale=ok(fresh.addMissedVaccination(stalePet.id,{sourceRecordId:staleSource.id,date:staleSource.nextDue}));ok(fresh.login('admin','admin123'));ok(fresh.addRecord(stalePet.id,{type:'vaccination',date:fresh.today(),title:staleSource.title,nextDue:fresh.addDays(fresh.today(),365)}));unchanged(fresh,()=>fresh.reviewRecord(stale.record.id,'approve',''));ok(fresh.reviewRecord(stale.record.id,'reject','New dose was given.'));
console.log('PASS: V14 missed vaccination roles, dates, rejection/resubmission, duplicates, stale approval after actual vaccination, dose history/reminders/counts unchanged, reschedule and reload persistence.');
