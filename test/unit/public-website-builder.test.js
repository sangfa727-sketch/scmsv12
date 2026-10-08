const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('visual school website builder keeps the editor client-only and outside private data',()=>{
  const html=read('school-website/create.html');
  const js=read('school-website/create.js');
  assert.match(html,/Create your school website/i);
  assert.match(html,/Live preview/i);
  assert.match(html,/Add section/i);
  assert.match(js,/localStorage/);
  assert.doesNotMatch(js,/supabase|service_role|students|attendance|billing|health/i);
});

test('visual builder exposes progressive-disclosure content blocks',()=>{
  const html=read('school-website/create.html');
  for(const field of ['schoolName','tagline','aboutTitle','aboutText','contactTitle','contactText']) assert.match(html,new RegExp('data-field="'+field+'"'));
  for(const section of ['programs','facilities','news','gallery','admissions','contact']) assert.match(html,new RegExp('data-section="'+section+'"'));
  assert.match(html,/data-add-item="programs"/);
  assert.match(html,/data-add-item="facilities"/);
  assert.match(html,/data-add-item="news"/);
});

test('visual builder supports mobile on-demand preview and publish safety boundary',()=>{
  const html=read('school-website/create.html');
  const css=read('school-website/create.css');
  const js=read('school-website/create.js');
  assert.match(html,/id="previewToggle"/);
  assert.match(html,/id="closePreview"/);
  assert.match(css,/@media\(max-width:1000px\)/);
  assert.match(css,/\.preview-panel\.open/);
  assert.match(js,/Preview only/);
  assert.doesNotMatch(js,/insertApplication|supabase\.from|\.insert\(/i);
});

test('visual builder source passes JavaScript syntax compilation',()=>{
  const js=read('school-website/create.js');
  new Function(js);
});
