'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8'),memory=new Map();
function load(){const store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},c={window:{},localStorage:store,sessionStorage:store,Date,Math,console};vm.createContext(c);vm.runInContext(src,c);return c.window.VZ;}
const V=load(),p=V.products()[0],others=JSON.stringify(V.db.products.filter(x=>x.id!==p.id));
V.db.batches=V.db.batches.filter(b=>b.productId!==p.id);
const batches=[{id:'expired',productId:p.id,qty:5,expiry:V.addDays(V.today(),-1),received:V.today()},{id:'fresh',productId:p.id,qty:8,expiry:V.addDays(V.today(),30),received:V.today()},{id:'today',productId:p.id,qty:3,expiry:V.today(),received:V.today()},{id:'no-expiry',productId:p.id,qty:2,expiry:null,received:V.today()}];V.db.batches.push(...batches);
V.login('staff1','staff123');const before=JSON.stringify(V.db);assert.equal(V.archiveExpiredStock(p.id).ok,false);assert.equal(JSON.stringify(V.db),before);
V.login('admin','admin123');assert.equal(V.info(p).sellable,13);
const result=V.archiveExpiredStock(p.id);assert.equal(result.qty,5);assert.equal(result.batches,1);
assert.equal(p.archived,false);assert.equal(V.products().some(x=>x.id===p.id),true);assert.equal(V.info(p).sellable,13);assert.equal(V.info(p).expiredQty,0);
assert.equal(batches[0].archived,true);for(const b of batches.slice(1))assert.equal(b.archived,undefined);
assert.equal(V.archivedBatches(p).reduce((n,b)=>n+b.qty,0),5);assert.equal(JSON.stringify(V.db.products.filter(x=>x.id!==p.id)),others);
assert.equal(V.archiveExpiredStock(p.id).ok,false);assert.ok(V.db.audit.some(a=>a.action==='inventory.archive_expired'));
assert.equal(V.recordSale([{productId:p.id,qty:1}],0,'Online payment').ok,true);assert.equal(batches[0].qty,5);assert.equal(batches[2].qty,2,'Sale uses active expiring-today batch');
const loaded=load(),lp=loaded.findProduct(p.id);assert.equal(loaded.info(lp).sellable,12);assert.equal(loaded.archivedBatches(lp)[0].archived,true);
const allExpired=V.products().find(x=>x.id!==p.id);V.db.batches=V.db.batches.filter(b=>b.productId!==allExpired.id);V.db.batches.push({id:'all-expired',productId:allExpired.id,qty:4,expiry:V.addDays(V.today(),-5),received:V.today()});
assert.equal(V.archiveExpiredStock(allExpired.id).ok,true);assert.equal(allExpired.archived,true);assert.equal(V.restoreProduct(allExpired.id).ok,true);assert.equal(V.info(allExpired).sellable,0,'Restoring SKU never restores expired batch to sellable stock');
console.log('PASS: only expired batches archived, fresh/today/no-expiry stock retained, product and other items retained, safe sales, archived quantities/audit/reload, permissions, duplicate guard and all-expired restore safety.');
