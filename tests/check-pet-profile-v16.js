'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let clock='2026-10-14T12:00:00';
class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return new Date(clock).getTime();}}
function load(memory=new Map()){
 let blocked=false;
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(blocked)throw new Error('QuotaExceeded');memory.set(k,String(v));},removeItem:k=>memory.delete(k)};
 const c={window:{},localStorage:storage,sessionStorage:storage,Date:Clock,Math,console};vm.createContext(c);
 for(const f of ['app.js','workflow-data.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/',f),'utf8'),c);
 return {V:c.window.VZ,memory,setFailure:value=>{blocked=value;}};
}
function ok(r){assert.equal(r.ok,true,r.error||JSON.stringify(r.errors));return r;}
function unchanged(V,fn){const b=JSON.stringify(V.db);assert.equal(fn().ok,false);assert.equal(JSON.stringify(V.db),b);}
const state=load(),V=state.V,pet=V.db.pets[0],other=V.db.pets[1],photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWuEAAAAASUVORK5CYII=';
unchanged(V,()=>V.setPetPhoto(pet.id,photo));unchanged(V,()=>V.confinePet(pet.id,'Observation'));
ok(V.login('staff1','staff123'));const clinical=JSON.stringify(V.db.records),health=pet.status,visits=V.visitCount(pet.id),last=V.lastVisit(pet.id),requests=V.db.workflowRequests.length;
assert.equal(V.petLocation(pet.id).confined,false);ok(V.admitPet(pet.id,'Routine visit'));assert.equal(V.activeStay(pet.id).confined,false);assert.equal(V.petLocation(pet.id).label,'Not confined');assert.equal(V.petLocation(pet.id).detail,'In clinic for a visit');
const olderRelease=ok(V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Owner'}));ok(V.confinePet(pet.id,'Stay for observation'));assert.equal(V.petLocation(pet.id).confined,true);assert.equal(V.activeStay(pet.id).confinementBy,'staff1');
unchanged(V,()=>V.confinePet(pet.id,'Duplicate'));unchanged(V,()=>V.markReadyForPickup(pet.id));
ok(V.login('admin','admin123'));unchanged(V,()=>V.reviewRecord(olderRelease.record.id,'approve',''));ok(V.reviewRecord(olderRelease.record.id,'reject','Confinement began after the release request.'));ok(V.markReadyForPickup(pet.id));assert.equal(V.petLocation(pet.id).confined,true);assert.equal(V.petLocation(pet.id).detail,'Awaiting pickup');
ok(V.login('staff1','staff123'));ok(V.setPetPhoto(pet.id,photo));assert.equal(pet.photo,photo);assert.equal(pet.photoUpdatedBy,'staff1');assert.equal(other.photo,undefined);assert.equal(V.db.workflowRequests.length,requests);assert.ok(V.petPhotoHTML(pet).includes('<img'));
for(const bad of ['https://example.com/a.jpg','data:image/svg+xml;base64,YWJj','data:image/png;base64,YWJj" onerror="bad',{},null,'data:image/png;base64,'+'A'.repeat(200001)])unchanged(V,()=>V.setPetPhoto(pet.id,bad));
unchanged(V,()=>V.setPetPhoto('missing',photo));
state.setFailure(true);unchanged(V,()=>V.setPetPhoto(pet.id,''));state.setFailure(false);assert.equal(pet.photo,photo,'Storage failure retains old picture and audit history');
const release=ok(V.addPetEvent(pet.id,'release',{date:V.today(),receivedBy:'Owner',notes:'Home care'}));assert.equal(V.petLocation(pet.id).confined,true);ok(V.login('admin','admin123'));ok(V.reviewRecord(release.record.id,'approve',''));assert.equal(V.petLocation(pet.id).confined,false);assert.equal(V.activeStay(pet.id),null);assert.equal(pet.photo,photo);assert.equal(pet.status,health);assert.equal(V.visitCount(pet.id),visits);assert.equal(V.lastVisit(pet.id),last);
assert.equal(JSON.stringify(V.db.records.filter(r=>!['release'].includes(r.type))),clinical);
ok(V.confinePet(other.id,'Observation admission'));assert.equal(V.activeStay(other.id).confined,true);const restored=load(state.memory).V;assert.equal(restored.findPet(pet.id).photo,photo);assert.equal(restored.petLocation(other.id).confined,true);
ok(V.setPetPhoto(pet.id,''));assert.ok(!V.petPhotoHTML(pet).includes('<img'));assert.ok(V.db.audit.some(a=>a.action==='pet.photo.updated'));assert.ok(V.db.audit.some(a=>a.action==='pet.photo.removed'));
ok(V.requestPetDeath(other.id,{date:V.today(),location:'At clinic'}));assert.equal(V.petLocation(other.id).confined,false);unchanged(V,()=>V.confinePet(other.id,'Unavailable'));
console.log('PASS: V16 visit vs confinement, same-second stale release guard, staff/admin pickup and release, direct admissions and deceased closure, pet-photo validation, permissions/isolation, storage failure rollback, audit and reload persistence; medical history/status/counts unchanged.');
