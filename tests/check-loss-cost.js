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
const state=load(),V=state.V;ok(V.login('admin','admin123'));const p=V.db.products[0];
V.db.batches=[{id:'legacy-cost',productId:p.id,qty:5,received:V.addDays(V.today(),-90),expiry:V.addDays(V.today(),-5)}, {id:'other-cost',productId:p.id,qty:3,received:V.addDays(V.today(),-90),expiry:V.addDays(V.today(),-5)}];
ok(V.archiveExpiredStock(p.id));const batch=V.db.batches[0];assert.equal(batch.archived,true);
const a=ok(V.recordStockLoss({batchId:batch.id,qty:2,date:V.today(),reason:'Expired',notes:'Expired two units'}));
ok(V.recordStockLoss({batchId:batch.id,qty:1,date:V.today(),reason:'Expired',notes:'Remaining damaged unit'}));const target=V.db.stockLosses[0];
assert.equal(target.cost,null);assert.equal(V.costSummary().unknownLossUnits,3);const stock=JSON.stringify(V.db.batches.map(b=>({id:b.id,qty:b.qty,archived:b.archived}))),oldPrice=p.price,purchases=JSON.stringify(V.db.receivings),originalSales=JSON.stringify(V.db.sales);
for(const cost of ['', ' ', true, -1, 'invalid', Infinity, 30.001, 1e10])unchanged(V,()=>V.setLossPurchaseCost(target.id,cost,'Supplier invoice',true));
unchanged(V,()=>V.setLossPurchaseCost(target.id,30,'',true));unchanged(V,()=>V.setLossPurchaseCost(target.id,30,'Supplier invoice',false));
ok(V.login('staff1','staff123'));unchanged(V,()=>V.setLossPurchaseCost(target.id,30,'Supplier invoice',true));ok(V.login('admin','admin123'));ok(V.setLossPurchaseCost(target.id,30,'Supplier invoice A-15',true));
assert.equal(target.cost,60);assert.equal(V.db.stockLosses[1].cost,30);assert.equal(V.costSummary().lossCost,90);assert.equal(V.costSummary().unknownLossUnits,0);assert.equal(V.costSummary().expiredCost,60);assert.equal(V.costSummary().unknownExpiredUnits,3);
assert.equal(JSON.stringify(V.db.batches.map(b=>({id:b.id,qty:b.qty,archived:b.archived}))),stock);assert.equal(p.price,oldPrice);assert.equal(JSON.stringify(V.db.receivings),purchases);assert.equal(JSON.stringify(V.db.sales),originalSales);assert.equal(V.info(p).sellable,0);
assert.equal(V.db.batches[1].unitCost,undefined);assert.equal(target.costEnteredBy,'admin');assert.ok(V.db.audit.some(a=>a.action==='stock.purchase_cost.entered'));
unchanged(V,()=>V.setLossPurchaseCost(target.id,40,'Duplicate',true));const restored=load(state.memory).V;assert.equal(restored.db.stockLosses[0].cost,60);assert.equal(restored.db.batches[0].unitCost,30);
// Fully consumed archived stock remains identifiable and costs can be filled afterwards.
ok(V.recordStockLoss({batchId:'other-cost',qty:3,date:V.today(),reason:'Expired',notes:'All three units expired'}));const full=V.db.stockLosses.at(-1);ok(V.setLossPurchaseCost(full.id,30,'Supplier purchase record',true));assert.equal(full.cost,90);assert.equal(V.db.batches[1].qty,0);assert.equal(V.costSummary().expiredCost,60);
console.log('PASS: V15 missing purchase costs, three units at 30 = 90, archived/consumed batches, all unknown losses per batch, admin-only, input/confirmation/duplicate guards, quantities/prices/sales/purchases unchanged, audit and persistence.');
