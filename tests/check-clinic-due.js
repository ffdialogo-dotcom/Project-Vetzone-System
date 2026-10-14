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
const state=load(),V=state.V,p=V.db.pets[0];ok(V.login('admin','admin123'));
V.db.records=[{id:'due-vax',petId:p.id,type:'vaccination',date:V.addDays(V.today(),-30),title:'Rabies vaccine',nextDue:V.addDays(V.today(),-1),status:'approved',by:'admin'}, {id:'due-check',petId:p.id,type:'checkup',date:V.addDays(V.today(),-30),title:'Routine checkup',nextDue:V.addDays(V.today(),-1),status:'approved',by:'admin'}];
const original=JSON.stringify(V.db),rows=V.clinicDueReminders();assert.equal(rows.length,2);assert.equal(JSON.stringify(V.db),original,'Displaying reminders must create no appointments or change records');assert.equal(V.db.appointments.length,0);assert.ok(rows.some(r=>r.sourceRecordId==='due-vax'&&r.type==='vaccination'));assert.ok(rows.some(r=>r.sourceRecordId==='due-check'&&r.type==='checkup'));
ok(V.login('staff1','staff123'));const dose=ok(V.addRecord(p.id,{type:'vaccination',date:V.today(),title:'RABIES VACCINE',nextDue:V.addDays(V.today(),365)})).record;assert.ok(V.clinicDueReminders().some(r=>r.sourceRecordId==='due-vax'));assert.ok(!V.clinicDueReminders().some(r=>r.sourceRecordId===dose.id));
ok(V.login('admin','admin123'));ok(V.reviewRecord(dose.id,'approve',''));assert.ok(!V.clinicDueReminders().some(r=>r.sourceRecordId==='due-vax'));assert.ok(V.clinicDueReminders().some(r=>r.sourceRecordId===dose.id&&r.date===V.addDays(V.today(),365)));
ok(V.login('staff1','staff123'));const missed=ok(V.addPetEvent(p.id,'missed_checkup',{date:V.addDays(V.today(),-1),sourceRecordId:'due-check',nextDue:V.addDays(V.today(),1)})).record;
assert.equal(V.clinicDueReminders().find(r=>r.sourceRecordId==='due-check').date,V.addDays(V.today(),-1));ok(V.login('admin','admin123'));ok(V.reviewRecord(missed.id,'approve',''));assert.equal(V.clinicDueReminders().find(r=>r.sourceRecordId==='due-check').date,V.addDays(V.today(),1));
const booking=ok(V.bookAppointment({petId:p.id,purpose:'Checkup',date:V.addDays(V.today(),2),time:'09:00'})).appointment;assert.ok(!V.clinicDueReminders().some(r=>r.sourceRecordId==='due-check'),'Linked booking represents its checkup without a duplicate reminder');
ok(V.changeAppointment(booking.id,'cancel',{reason:'Owner cancelled'}));assert.equal(V.clinicDueReminders().find(r=>r.sourceRecordId==='due-check').date,V.addDays(V.today(),1));
const attended=ok(V.bookAppointment({petId:p.id,purpose:'Checkup',date:V.addDays(V.today(),2),time:'09:00'})).appointment;clock=V.addDays(V.today(),2)+'T12:00:00';ok(V.changeAppointment(attended.id,'attended'));assert.ok(!V.clinicDueReminders().some(r=>r.sourceRecordId==='due-check'));
const restored=load(state.memory).V;assert.ok(restored.clinicDueReminders().some(r=>r.sourceRecordId===dose.id));ok(V.requestPetDeath(p.id,{date:V.today(),location:'At clinic'}));assert.equal(V.clinicDueReminders().length,0);
console.log('PASS: V17 approved/latest vaccine and checkup calendar reminders without writes, pending/approved dose updates, approved missed-checkup reschedules, linked booking deduplication/cancellation/attendance, deceased suppression and reload persistence.');
