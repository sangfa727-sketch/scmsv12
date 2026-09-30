const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const load=f=>{const s={window:{}};vm.runInNewContext(fs.readFileSync(f,'utf8'),s);return s.window};
const en=load(path.join(root,'js/00a_locales_en.js')).I18N_EN;
const zh=load(path.join(root,'js/i18n/zh/00_zh_batch_b.js')).I18N_ZH_BATCH_B;
const p=v=>(v.match(/\{[^}]+\}/g)||[]).sort();
const t=v=>(v.match(/<\/?[a-z][^>]*>/gi)||[]).sort();
const keys=Object.keys(zh);
assert.equal(new Set(keys).size,keys.length,'Batch B must not contain duplicate keys');
assert.ok(keys.length>0);
for(const [k,v] of Object.entries(zh)){assert.ok(Object.hasOwn(en,k),`EN key missing: ${k}`);assert.equal(typeof v,'string');assert.ok(v.trim(),`empty value: ${k}`);assert.deepEqual(p(v),p(en[k]),`placeholder mismatch: ${k}`);assert.deepEqual(t(v),t(en[k]),`HTML-tag mismatch: ${k}`);}
