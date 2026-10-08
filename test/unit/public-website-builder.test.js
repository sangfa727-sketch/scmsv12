const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('template-first website studio stays outside private SCMS data',()=>{
 const html=read('school-website/create.html'),js=read('school-website/create.js');
 assert.match(html,/Start with a professional template/i);
 assert.match(html,/data-template="modern"/);
 assert.match(html,/Add your information/i);
 assert.match(js,/localStorage/);
 assert.doesNotMatch(js,/supabase|service_role|students|attendance|billing|health/i);
});
test('school admin fills guided fields instead of designing a blank website',()=>{
 const html=read('school-website/create.html'),js=read('school-website/create.js');
 for(const field of ['schoolName','tagline','aboutTitle','aboutText','contactTitle','contactText']) assert.match(html,new RegExp('data-field="'+field+'"'));
 assert.match(html,/template-option/);assert.match(html,/Change template/);assert.match(js,/templateMeta/);assert.match(js,/applyTemplate/);assert.match(js,/state\.template/);
 assert.match(js,/fieldProgress/);assert.match(js,/updateProgress/);
});
test('optional sections remain progressive and safe',()=>{
 const html=read('school-website/create.html'),js=read('school-website/create.js');
 for(const section of ['programs','facilities','news','gallery','admissions','contact']) assert.match(html,new RegExp('data-section="'+section+'"'));
 assert.doesNotMatch(js,/insertApplication|supabase\.from|\.insert\(/i);
 assert.match(js,/Preview only/);
});
test('mobile preview remains on-demand and source compiles',()=>{
 const html=read('school-website/create.html'),css=read('school-website/create.css'),js=read('school-website/create.js');
 assert.match(html,/id="previewToggle"/);assert.match(css,/@media\(max-width:1000px\)/);assert.match(css,/\.preview-panel\.open/);new Function(js);
});
