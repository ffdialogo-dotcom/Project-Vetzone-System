'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = {
 'pet.html':['vz-static-page','pet-name','pet-status','pet-facts','pet-visits','pet-vaccinations','add-rec','add-visit'],
 'profile.html':['vz-static-page','profile-form','pw-form','pick-photo','photo-input','me-name'],
 'create-account.html':['create-form','toggle-pw','admin-role','login-link']
};
for (const [page, ids] of Object.entries(pages)) {
 const html=fs.readFileSync(path.join(root,page),'utf8');
 for(const id of ids) assert.match(html,new RegExp('id="'+id+'"'),page+' missing '+id);
 if(page==='create-account.html') assert.match(html,/<main\b(?=[^>]*\bid="page")(?=[^>]*\shidden(?:\s|=|>))[^>]*>/,'Account-creation page must stay hidden until the admin guard runs');
}
for (const file of ['pet.js','profile.js','create-account.js']) {
 const js=fs.readFileSync(path.join(root,'js',file),'utf8');
 const dynamicPage = file === 'pet.js' ? js.replace(/if \(!pet\) \{[\s\S]*?return;\s*\}/, '') : js;
 assert.doesNotMatch(dynamicPage,/main\.innerHTML\s*=|getElementById\('page'\)\.innerHTML\s*=/,file+' still replaces the main interface');
}
console.log('PASS: 3 converted pages contain their static interface elements and do not overwrite the main page; account creation starts hidden.');
