const test=require('node:test');
const assert=require('node:assert/strict');
const repo=require('../../school-website/server/publish-repository');

const base={
 draft:{
  draftId:'draft-1',
  schoolId:'school-a',
  status:'review',
  templateKey:'modern',
  content:{
   schoolName:'Example School',
   tagline:'Learning',
   aboutText:'Public content',
   internalNote:'must-not-publish'
  }
 },
 context:{schoolId:'school-a',actorId:'staff-1',isWebsitePublisher:true}
};

test('requires reviewed draft and authorized same-school publisher',()=>{
 assert.equal(repo.assertPublishRepositoryInput(base),true);
 assert.throws(()=>repo.assertPublishRepositoryInput({...base,draft:{...base.draft,status:'draft'}}),/reviewed/);
 assert.throws(()=>repo.assertPublishRepositoryInput({...base,context:{...base.context,isWebsitePublisher:false}}),/authorization/);
 assert.throws(()=>repo.assertPublishRepositoryInput({...base,context:{...base.context,schoolId:'school-b'}}),/mismatch/);
});

test('materializes only allowlisted public content',()=>{
 const op=repo.buildAtomicPublishOperation(base);
 assert.equal(op.publicStatus,'published');
 assert.equal(op.requireAtomicTransaction,true);
 assert.equal(op.publicContent.schoolName,'Example School');
 assert.equal(op.publicContent.internalNote,undefined);
 assert.equal(op.auditAction,'publish');
});

test('does not create a published operation from an unreviewed draft',()=>{
 assert.throws(()=>repo.buildAtomicPublishOperation({...base,draft:{...base.draft,status:'draft'}}),/reviewed/);
});
