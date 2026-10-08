const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

const draft=require('../../school-website/server/draft-persistence');

test('draft schema is isolated and not public',()=>{
 const sql=read('school-website/db/website_drafts_schema.sql');
 assert.match(sql,/website_drafts/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/No public\/anon access/i);
 assert.doesNotMatch(sql,/grant\s+.*anon/i);
});

test('draft normalization accepts only supported templates and bounded public content',()=>{
 const value=draft.normalizeDraft({
   template:'modern',
   schoolName:'  Bright School  ',
   tagline:'Welcome',
   aboutText:'x'.repeat(9999),
   programs:Array.from({length:60},(_,i)=>'Program '+i),
   facilities:[' Lab '],
   news:[' Open Day ']
 });
 assert.equal(value.schoolName,'Bright School');
 assert.equal(value.aboutText.length,draft.LIMITS.aboutText);
 assert.equal(value.programs.length,draft.LIMITS.collectionCount);
 assert.equal(value.facilities[0],'Lab');
 assert.equal(value.news[0],'Open Day');
 assert.throws(()=>draft.normalizeDraft({template:'unknown'}),/invalid template/);
});

test('draft writes require resolved school and authorized website editor',()=>{
 const base={template:'classic',schoolName:'School'};
 assert.throws(()=>draft.buildDraftRecord(base,null),/write context required/);
 assert.throws(()=>draft.buildDraftRecord(base,{schoolId:'s1',actorId:'a1'}),/authorization required/);
 assert.throws(()=>draft.buildDraftRecord(base,{schoolId:'s1',actorId:'a1',isWebsiteEditor:true,requestedSchoolId:'s2'}),/cross-school/);
 const record=draft.buildDraftRecord(base,{schoolId:'s1',actorId:'a1',isWebsiteEditor:true});
 assert.equal(record.schoolId,'s1');
 assert.equal(record.actorId,'a1');
 assert.equal(record.status,'draft');
});

test('draft boundary cannot create a public publication state',()=>{
 const base={template:'premium'};
 assert.throws(()=>draft.buildDraftRecord(base,{schoolId:'s1',actorId:'a1',isWebsiteEditor:true},'published'),/invalid draft status/);
});
