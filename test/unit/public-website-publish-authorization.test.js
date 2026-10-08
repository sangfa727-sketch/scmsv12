const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const auth=require('../../school-website/server/publish-authorization');

const publisher={schoolId:'school-a',actorId:'staff-1',isWebsitePublisher:true};

test('publish audit schema is private and RLS protected',()=>{
 const sql=read('school-website/db/website_publish_audit_schema.sql');
 assert.match(sql,/website_publish_audit/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/No public\/anon access/i);
 assert.doesNotMatch(sql,/grant\s+.*anon/i);
});

test('review transition requires authorized publisher and same tenant',()=>{
 const draft={schoolId:'school-a',status:'draft'};
 const result=auth.buildReviewTransition(draft,publisher);
 assert.deepEqual(result,{schoolId:'school-a',actorId:'staff-1',from:'draft',to:'review'});
 assert.throws(()=>auth.buildReviewTransition(draft,{schoolId:'school-a',actorId:'staff-1'}),/authorization required/);
 assert.throws(()=>auth.buildReviewTransition(draft,{...publisher,requestedSchoolId:'school-b'}),/cross-school/);
 assert.throws(()=>auth.buildReviewTransition({...draft,schoolId:'school-b'},publisher),/cross-school/);
});

test('publish requires review state and never accepts client-side published state',()=>{
 const result=auth.buildPublishTransition({schoolId:'school-a',status:'review'},publisher);
 assert.equal(result.to,'published');
 assert.equal(result.publishedAtRequired,true);
 assert.throws(()=>auth.buildPublishTransition({schoolId:'school-a',status:'draft'},publisher),/requires review/);
 assert.throws(()=>auth.buildPublishTransition({schoolId:'school-a',status:'published'},publisher),/requires review/);
});

test('publisher cannot publish another school',()=>{
 assert.throws(()=>auth.buildPublishTransition({schoolId:'school-b',status:'review'},publisher),/cross-school/);
});
