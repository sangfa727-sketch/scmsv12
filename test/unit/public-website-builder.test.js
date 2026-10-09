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


test('School Website navigation supports owner/admin defaults and delegated website.manage permission',()=>{
 const sidebar=read('js/17_sidebar.js');
 assert.match(sidebar,/id: 'website'/);
 assert.match(sidebar,/school-website\/create\.html/);
 assert.match(sidebar,/ownerOrAdmin/);
 assert.match(sidebar,/school_owner/);
 assert.match(sidebar,/website\.manage/);
 assert.match(sidebar,/School Website/);
});


test('School Website is discoverable from More on Telegram/mobile and desktop app layouts',()=>{
 const more=read('js/12_more.js');
 assert.match(more,/canManageWebsite/);
 assert.match(more,/school_owner/);
 assert.match(more,/website\.manage/);
 assert.match(more,/more-tile-website/);
 assert.match(more,/school-website\/create\.html/);
 assert.match(more,/School Website/);
});

test('website.manage is a global sensitive permission with admin defaults only',()=>{
 const migration=read('supabase/migrations/20261009100000_school_website_manage_permission.sql');
 assert.match(migration,/'website\.manage'/);
 assert.match(migration,/'global'/);
 assert.match(migration,/'admin',\s*'website\.manage',\s*true/);
 assert.match(migration,/'super_admin',\s*'website\.manage',\s*true/);
 assert.doesNotMatch(migration,/values\s*\(\s*'teacher',\s*'website\.manage',\s*true/i);
 const rpc=read('supabase/migrations/20260929075000_teacher_access_management_rpc.sql');
 assert.match(rpc,/p_action='permission_set'/);
 assert.match(rpc,/public\.teacher_permissions/);
});

test('website studio uses querySelectorAll for every DOM collection loop',()=>{
 const js=read('school-website/create.js');
 assert.doesNotMatch(js,/(?<!\$)\$\([^)]*\)\.forEach/);
 assert.match(js,/\$\$\("\[data-field\]"\)\.forEach/);
 assert.match(js,/\$\$\("\.template-option"\)\.forEach/);
 new Function(js);
});


test('School Website Studio fails closed until the server verifies an active authorized school session',()=>{
 const html=read('school-website/create.html'),migration=read('supabase/migrations/20261010120000_school_website_server_authorization.sql');
 assert.match(html,/auth-pending/); assert.match(html,/scms_web_session/); assert.match(html,/rpc_school_website_authorize/); assert.match(html,/result\.authorized !== true/); assert.match(html,/editor\.src = '\.\/create\.js'/);
 assert.match(migration,/security definer/i); assert.match(migration,/private\.web_has_permission\(p_session_token, 'website\.manage', null, null\)/); assert.match(migration,/s\.expires_at > now\(\)/); assert.match(migration,/t\.status = 'active'/); assert.match(migration,/revoke all on function public\.rpc_school_website_authorize\(text\) from public/i); assert.match(migration,/grant execute on function public\.rpc_school_website_authorize\(text\) to anon, authenticated/i);
});

test('website drafts are isolated by the verified school context',()=>{
 const js=read('school-website/create.js'); assert.match(js,/function draftStorageKey\(\)/); assert.match(js,/SCMS_WEBSITE_CONTEXT\?\.schoolId/); assert.match(js,/scms-website-draft:/); assert.match(js,/localStorage\.setItem\(draftStorageKey\(\)/); assert.match(js,/localStorage\.getItem\(draftStorageKey\(\)/); new Function(js);
});
