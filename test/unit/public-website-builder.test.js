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
 assert.match(html,/template-option/);assert.match(html,/id="templateName"/);assert.match(html,/Change template/);assert.match(js,/templateMeta/);assert.match(js,/applyTemplate/);assert.match(js,/state\.template/);assert.match(js,/preview\.dataset\.template/);assert.match(read("school-website/create.css"),/body\[data-template="classic"\]/);assert.match(read("school-website/create.css"),/body\[data-template="premium"\]/);
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


test('section navigation exposes stable anchors and keyboard-safe interaction',()=>{
 const html=read('school-website/create.html'),css=read('school-website/create.css'),js=read('school-website/create.js');
 for(const section of ['hero','about','programs','facilities','news','contact']) assert.match(html,new RegExp('id="'+section+'"'));
 assert.match(html,/aria-label="Page sections"/); assert.match(html,/href="#hero"/); assert.match(html,/href="#contact"/);
 assert.match(css,/\.section-nav a:focus-visible/); assert.match(css,/\.section-nav a\.active/); assert.match(js,/IntersectionObserver/); assert.match(js,/initSectionNavigation/);
});


test('section management exposes safe hide, reorder and duplicate controls',()=>{
 const html=read('school-website/create.html'),js=read('school-website/create.js'),css=read('school-website/create.css');
 for(const section of ['hero','about','programs','facilities','news','contact']){
  assert.match(html,new RegExp('data-section-id="'+section+'"'));
  assert.match(html,/data-section-action="hide"/);
  assert.match(html,/data-section-action="up"/);
  assert.match(html,/data-section-action="down"/);
 }
 assert.match(html,/data-section-action="duplicate"/);
 assert.match(js,/DEFAULT_SECTIONS/);assert.match(js,/normalizeSections/);assert.match(js,/sectionAction/);assert.match(js,/renderSectionLayout/);assert.match(js,/localStorage/);assert.match(js,/m\.locked/);
 assert.match(css,/\.section-controls/);assert.match(css,/\.site-block\[hidden\]/);new Function(js);
});


test('logo media management stays client-only and validates safe image inputs',()=>{
 const html=read('school-website/create.html'),js=read('school-website/create.js'),css=read('school-website/create.css');
 assert.match(html,/id="logoUpload"/);assert.match(html,/accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(js,/openMediaPicker/);assert.match(js,/handleLogoUpload/);assert.match(js,/2\*1024\*1024/);assert.match(js,/image\\\/(png\\\|jpeg\\\|webp)/);assert.match(js,/readAsDataURL/);
 assert.doesNotMatch(js,/service_role|supabase\.from|fetch\(/i);assert.match(css,/\.media-placeholder img/);
});
