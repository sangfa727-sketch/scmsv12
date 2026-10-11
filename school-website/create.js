(function(){
"use strict";
if(!window.SCMS_WEBSITE_CONTEXT?.schoolId){console.warn("School Website Studio requires verified school authorization.");return;}
const DEFAULT_SECTIONS=[{id:"hero",type:"hero",label:"Home",visible:true,locked:true},{id:"about",type:"about",label:"About",visible:true},{id:"programs",type:"programs",label:"Programs",visible:true},{id:"facilities",type:"facilities",label:"Facilities",visible:true},{id:"news",type:"news",label:"News & events",visible:true},{id:"contact",type:"contact",label:"Contact",visible:true}];
const state={template:"modern",logo:"",schoolName:"",tagline:"",aboutTitle:"",aboutText:"",contactTitle:"",contactText:"",programs:[],facilities:[],news:[],sections:DEFAULT_SECTIONS.map(x=>({...x}))};
const templateMeta={modern:{label:"Modern School",hero:"Clean, calm and welcoming"},classic:{label:"Classic Academy",hero:"Formal and traditional"},premium:{label:"Premium Campus",hero:"Editorial and sophisticated"}};
const fieldMeta={
 logo:["School logo","Upload your school logo here when image upload is enabled.","A clear square logo works best."],
 schoolName:["School name","Give families the name they should remember.","Example: Bright Future International School"],
 tagline:["Welcome message","One short sentence that captures your school.","Example: Growing curious minds with care and confidence."],
 aboutTitle:["School introduction","A simple heading for your introduction.","Example: A place to learn, grow and belong."],
 aboutText:["About your school","Tell families what makes your school special.","Keep this clear and welcoming."],
 contactTitle:["Contact heading","A short heading for your contact area.","Example: We would love to hear from you."],
 contactText:["Contact details","Add the information families need to reach your school.","Example: +95 9... · hello@school.com · Mandalay"]
};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const dialog=$("#editorDialog"),input=$("#dialogInput"),title=$("#dialogTitle"),label=$("#dialogLabel"),hint=$("#dialogHint"),toast=$("#toast");
let activeField=null,activeCollection=null;
function showToast(message){toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),1800)}
function openField(field){activeField=field;activeCollection=null;const m=fieldMeta[field];title.textContent=m[0];label.textContent=m[0];input.value=state[field];hint.textContent=m[2];input.placeholder=m[1];input.maxLength=field==="aboutText"?4000:field==="contactText"?2000:300;input.removeAttribute("aria-invalid");dialog.showModal();setTimeout(()=>input.focus(),30)}
function openItem(collection){activeCollection=collection;activeField=null;const names={programs:["Add a program","Example: Primary Education"],facilities:["Add a facility","Example: Science & Innovation Lab"],news:["Add news or event","Example: Open Day 2026"]};const m=names[collection];title.textContent=m[0];label.textContent="Title";input.value="";hint.textContent=m[1];input.placeholder=m[1];input.maxLength=200;input.removeAttribute("aria-invalid");dialog.showModal();setTimeout(()=>input.focus(),30)}
function applyTemplate(){const meta=templateMeta[state.template]||templateMeta.modern;const label=$("#changeTemplate");if(label)label.textContent=meta.label+" selected";const name=$("#templateName");if(name)name.textContent=meta.label;$$(".template-option").forEach(x=>x.classList.toggle("selected",x.dataset.template===state.template));document.body.dataset.template=state.template}
function normalizeSections(){if(!Array.isArray(state.sections)||!state.sections.length)state.sections=DEFAULT_SECTIONS.map(x=>({...x}));const canonical=DEFAULT_SECTIONS.map(x=>x.id);const seen=new Set();state.sections=state.sections.filter(x=>x&&typeof x.id==="string"&&!seen.has(x.id)&&(seen.add(x.id),true)).map(x=>({...x,visible:x.visible!==false,locked:x.type==="hero"||x.locked===true}));for(const base of DEFAULT_SECTIONS)if(!state.sections.some(x=>x.id===base.id))state.sections.push({...base});}
function renderSectionLayout(){normalizeSections();const canvas=$("#pageCanvas");const canonical=new Map($$("#pageCanvas > .site-block").map(n=>[n.dataset.block,n]));for(const meta of state.sections){if(!document.getElementById(meta.id)){const source=canonical.get(meta.type||meta.id);if(source&&meta.id!==source.id){const copy=source.cloneNode(true);copy.id=meta.id;copy.dataset.block=meta.id;copy.dataset.sectionLabel=meta.label||source.dataset.sectionLabel||meta.type;copy.querySelectorAll("[id]").forEach(el=>{el.id=el.id+"-"+meta.id});copy.querySelectorAll("[data-section-id]").forEach(b=>b.dataset.sectionId=meta.id);canvas.appendChild(copy);}}const node=document.getElementById(meta.id);if(!node)continue;node.hidden=!meta.visible;const hide=node.querySelector("[data-section-action=hide]");if(hide){hide.textContent=meta.visible?"Hide":"Show";hide.setAttribute("aria-label",(meta.visible?"Hide ":"Show ")+(meta.label||meta.id));hide.disabled=!!meta.locked;}const up=node.querySelector("[data-section-action=up]"),down=node.querySelector("[data-section-action=down]"),dup=node.querySelector("[data-section-action=duplicate]");if(up)up.disabled=state.sections[0]?.id===meta.id;if(down)down.disabled=state.sections[state.sections.length-1]?.id===meta.id;if(dup)dup.disabled=!!meta.locked;canvas.appendChild(node);}}
function sectionIndex(id){return state.sections.findIndex(x=>x.id===id)}
function sectionAction(id,action){normalizeSections();const i=sectionIndex(id),m=state.sections[i];if(i<0||!m)return;if(action==="hide"&&!m.locked)m.visible=!m.visible;else if(action==="up"&&i>0)[state.sections[i-1],state.sections[i]]=[state.sections[i],state.sections[i-1]];else if(action==="down"&&i<state.sections.length-1)[state.sections[i+1],state.sections[i]]=[state.sections[i],state.sections[i+1]];else if(action==="duplicate"&&!m.locked){const copyId=m.id+"-copy-"+Date.now().toString(36);state.sections.splice(i+1,0,{...m,id:copyId,label:(m.label||m.id)+" copy",locked:false});}render();showToast(action==="hide"?(m.visible?"Section shown":"Section hidden"):action==="up"?"Section moved up":action==="down"?"Section moved down":action==="duplicate"?"Section duplicated":"Section updated");}
function draftStorageKey(){const schoolId=window.SCMS_WEBSITE_CONTEXT?.schoolId;if(typeof schoolId!=="string"||!schoolId.trim())throw new Error("School context is required");return "scms-website-draft:"+encodeURIComponent(schoolId)}function persistDraft(){try{localStorage.setItem(draftStorageKey(),JSON.stringify(state));$("#saveState").textContent="Saved locally"}catch(_){$("#saveState").textContent="Draft"}}function updateProgress(){const fields=["schoolName","tagline","aboutTitle","aboutText","contactTitle","contactText"];const done=fields.filter(f=>state[f]).length;$("#fieldProgress").textContent=done+" of "+fields.length+" completed"}
function renderCollection(c){const target=$("#"+(c==="programs"?"programItems":c==="facilities"?"facilityItems":"newsItems"));const items=state[c];target.innerHTML=items.length?items.map((x,i)=>'<article class="added-card"><button class="remove-card" data-remove="'+c+'" data-index="'+i+'" aria-label="Remove">×</button><b>'+escapeHtml(x)+'</b><span>Ready for review</span></article>').join(""):'<button class="add-card" data-add-item="'+c+'" type="button">＋<span>'+({programs:"Add your first program",facilities:"Show families your school",news:"Add your first news item"}[c])+"</span></button>"}
function renderPreview(){const meta=templateMeta[state.template]||templateMeta.modern;const name=escapeHtml(state.schoolName||"Your School"),tag=escapeHtml(state.tagline||meta.hero);const contentByType={about:["About",state.aboutText],programs:["Programs",state.programs.join(" · ")],facilities:["School life",state.facilities.join(" · ")],news:["News & events",state.news.join(" · ")],contact:["Contact",state.contactText]};const sections=state.sections.filter(s=>s.visible&&contentByType[s.type]).map(s=>contentByType[s.type]);const preview=$("#previewCanvas");preview.dataset.template=state.template;preview.innerHTML='<div class="mini-hero"><div class="mini-logo">'+(state.schoolName?escapeHtml(state.schoolName[0].toUpperCase()):"S")+'</div><h1>'+name+'</h1><p>'+tag+'</p></div>'+sections.map(x=>'<section class="mini-section"><h2>'+escapeHtml(x[0])+'</h2><p>'+escapeHtml(x[1]||"Content will appear here when you add it.")+"</p></section>").join("")}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
function render(){normalizeSections();renderSectionLayout();$$("[data-field]").forEach(el=>{const f=el.dataset.field;const fallback={logo:"＋ Add your school logo",schoolName:"Click here to add your school name",tagline:"Click here to add a short welcome message",aboutTitle:"Click here to add your school introduction",aboutText:"Tell families what makes your school special. A short, clear introduction works best.",contactTitle:"Click here to add your contact details",contactText:"Phone · Email · Address · Location"}[f];el.textContent=state[f]||fallback;el.classList.toggle("filled",!!state[f])});renderCollection("programs");renderCollection("facilities");renderCollection("news");applyTemplate();renderPreview();updateProgress();persistDraft()}
function addSection(){$("#sectionDialog").showModal()}function initSectionNavigation(){const links=$$(".section-nav a"),sections=links.map(a=>$(a.getAttribute("href"))).filter(Boolean);if(!("IntersectionObserver" in window))return;const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;links.forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+visible.target.id));},{rootMargin:"-22% 0px -62% 0px",threshold:[0,.25,.5]});sections.forEach(section=>observer.observe(section));links.forEach(link=>link.addEventListener("click",()=>links.forEach(a=>a.classList.toggle("active",a===link))));if(links[0])links[0].classList.add("active")}

let admissionCursor=null;
let admissionHasMore=false;
let admissionLoading=false;

function getWebsiteSessionToken(){
 try{
  const session=JSON.parse(localStorage.getItem("scms_web_session")||sessionStorage.getItem("scms_web_session")||"null");
  return typeof session?.session_token==="string"?session.session_token.trim():"";
 }catch(_){return ""}
}
async function websiteRpc(name,args){
 const config=window.SCMS_CONFIG||{};
 if(typeof config.SUPABASE_URL!=="string"||typeof config.SUPABASE_ANON!=="string")throw new Error("backend_unavailable");
 const token=getWebsiteSessionToken();
 if(!token)throw new Error("access_denied");
 const response=await fetch(config.SUPABASE_URL+"/rest/v1/rpc/"+encodeURIComponent(name),{
  method:"POST",
  headers:{apikey:config.SUPABASE_ANON,Authorization:"Bearer "+config.SUPABASE_ANON,"Content-Type":"application/json"},
  body:JSON.stringify({...args,p_session_token:token}),
  cache:"no-store",
  credentials:"omit"
 });
 if(!response.ok)throw new Error("backend_unavailable");
 const result=await response.json();
 if(!result||result.ok!==true)throw new Error(typeof result?.error==="string"?result.error:"backend_unavailable");
 return result;
}
function admissionStatusLabel(status){
 return ({pending:"Pending",reviewing:"Reviewing",accepted:"Accepted",rejected:"Rejected",withdrawn:"Withdrawn"})[status]||"Unknown";
}
function addAdmissionDetail(parent,label,value){
 const wrap=document.createElement("div");
 const strong=document.createElement("strong");
 strong.textContent=label;
 const p=document.createElement("p");
 p.textContent=value===null||value===undefined||value===""?"—":String(value);
 wrap.append(strong,p);
 parent.appendChild(wrap);
}
function renderAdmissionCard(item){
 const card=document.createElement("article");
 card.className="admission-review-card";
 card.dataset.applicationId=String(item.application_id||"");
 card.dataset.updatedAt=String(item.updated_at||"");
 const header=document.createElement("header");
 const h=document.createElement("h3");
 h.textContent=String(item.student_name||"Unnamed applicant");
 const status=document.createElement("span");
 status.className="admission-status";
 status.textContent=admissionStatusLabel(item.status);
 header.append(h,status);
 card.appendChild(header);
 const details=document.createElement("div");
 details.className="admission-review-details";
 addAdmissionDetail(details,"Applying for",item.applying_grade);
 addAdmissionDetail(details,"Date of birth",item.date_of_birth);
 addAdmissionDetail(details,"Parent / guardian",item.guardian_name);
 addAdmissionDetail(details,"Phone",item.guardian_phone);
 addAdmissionDetail(details,"Email",item.guardian_email);
 addAdmissionDetail(details,"Previous school",item.previous_school);
 addAdmissionDetail(details,"Preferred contact",item.preferred_contact);
 addAdmissionDetail(details,"Received",item.created_at?new Date(item.created_at).toLocaleString():"—");
 addAdmissionDetail(details,"Website",item.source_host);
 card.appendChild(details);
 if(item.message){
  const message=document.createElement("p");
  message.className="admission-review-message";
  message.textContent=String(item.message);
  card.appendChild(message);
 }
 const actions=document.createElement("div");
 actions.className="admission-review-actions";
 const select=document.createElement("select");
 select.setAttribute("aria-label","Update application status");
 const options=item.status==="pending"?["pending","reviewing","accepted","rejected","withdrawn"]:
  item.status==="reviewing"?["reviewing","accepted","rejected","withdrawn"]:[item.status];
 options.forEach(value=>{
  const option=document.createElement("option");
  option.value=value;
  option.textContent=admissionStatusLabel(value);
  option.selected=value===item.status;
  select.appendChild(option);
 });
 const closed=!["pending","reviewing"].includes(item.status);
 select.disabled=closed;
 select.addEventListener("change",()=>{save.disabled=select.value===item.status||closed});
 const save=document.createElement("button");
 save.type="button";
 save.className="button primary";
 save.textContent="Save status";
 save.dataset.admissionSave="true";
 save.disabled=closed;
 actions.append(select,save);
 card.appendChild(actions);
 return card;
}
function setAdmissionInboxStatus(message,kind){
 const status=$("#admissionInboxStatus");
 if(!status)return;
 status.textContent=message;
 status.dataset.state=kind||"info";
}
async function loadAdmissions(reset){
 if(admissionLoading)return;
 const list=$("#admissionInboxList"),older=$("#loadOlderAdmissions");
 if(!list)return;
 if(reset){admissionCursor=null;admissionHasMore=false;list.replaceChildren()}
 admissionLoading=true;
 if(older)older.disabled=true;
 setAdmissionInboxStatus("Loading admission applications…","pending");
 try{
  const result=await websiteRpc("rpc_school_website_list_admissions",{
   p_before_created_at:admissionCursor?.created_at||null,
   p_before_application_id:admissionCursor?.application_id||null,
   p_limit:25
  });
  const items=Array.isArray(result.items)?result.items:[];
  if(reset&&items.length===0){
   const empty=document.createElement("p");
   empty.className="admission-inbox-empty";
   empty.textContent="No admission applications have been submitted to this school yet.";
   list.appendChild(empty);
  }else{
   const empty=list.querySelector(".admission-inbox-empty");
   if(empty)empty.remove();
   items.forEach(item=>list.appendChild(renderAdmissionCard(item)));
  }
  admissionHasMore=result.has_more===true;
  admissionCursor=admissionHasMore&&result.next_cursor_created_at&&result.next_cursor_application_id
   ?{created_at:result.next_cursor_created_at,application_id:result.next_cursor_application_id}:null;
  if(older){older.hidden=!admissionHasMore;older.disabled=false}
  setAdmissionInboxStatus(items.length+" application"+(items.length===1?"":"s")+" loaded.","success");
 }catch(error){
  if(older)older.disabled=false;
  const reason=error instanceof Error?error.message:"";
  setAdmissionInboxStatus(reason==="access_denied"?"Your session or website-manager permission is no longer valid. Close this panel and sign in again.":"Admission applications could not be loaded. Please try again.","error");
 }finally{
  admissionLoading=false;
 }
}
async function saveAdmissionStatus(button){
 const card=button.closest(".admission-review-card");
 const select=card?.querySelector("select");
 if(!card||!select||button.disabled)return;
 const newStatus=select.value;
 const token=getWebsiteSessionToken();
 if(!token){setAdmissionInboxStatus("Your session has expired. Please sign in again.","error");return}
 button.disabled=true;
 select.disabled=true;
 button.textContent="Saving…";
 setAdmissionInboxStatus("Saving application status…","pending");
 try{
  const result=await websiteRpc("rpc_school_website_update_admission_status",{
   p_application_id:card.dataset.applicationId,
   p_new_status:newStatus,
   p_expected_updated_at:card.dataset.updatedAt
  });
  setAdmissionInboxStatus(result.unchanged?"Application status was already up to date.":"Application status updated.","success");
  await loadAdmissions(true);
 }catch(error){
  const reason=error instanceof Error?error.message:"";
  if(reason==="stale_application"){
   setAdmissionInboxStatus("This application changed in another session. Refreshing the latest status.","notice");
   await loadAdmissions(true);
  }else if(reason==="application_closed"){
   setAdmissionInboxStatus("This application is closed and cannot be changed again.","error");
   await loadAdmissions(true);
  }else{
   setAdmissionInboxStatus("Status could not be updated. Please refresh and try again.","error");
   button.disabled=false;
   select.disabled=false;
   button.textContent="Save status";
  }
 }
}

$("[data-field]").forEach(el=>el.addEventListener("click",()=>openField(el.dataset.field)));
document.addEventListener("click",e=>{const admissionSave=e.target.closest("[data-admission-save]");if(admissionSave){saveAdmissionStatus(admissionSave);return;}const sectionButton=e.target.closest("[data-section-action]");if(sectionButton){sectionAction(sectionButton.dataset.sectionId,sectionButton.dataset.sectionAction);return;}const add=e.target.closest("[data-add-item]");if(add)openItem(add.dataset.addItem);const remove=e.target.closest("[data-remove]");if(remove){state[remove.dataset.remove].splice(Number(remove.dataset.index),1);render();showToast("Removed from draft")}});
$$(".block-edit").forEach(el=>el.addEventListener("click",()=>{const b=el.dataset.edit;if(fieldMeta[b])openField(b);else if(["programs","facilities","news"].includes(b))openItem(b);else showToast("Choose the fields you need to update.")}));
$("#dialogSave").addEventListener("click",e=>{e.preventDefault();const value=input.value.trim();if(!value){input.setAttribute("aria-invalid","true");input.focus();hint.textContent="Please enter some information before saving.";return;}if(activeField)state[activeField]=value;if(activeCollection)state[activeCollection].push(value);dialog.close();render();showToast("Draft updated")});
$("#addSectionBottom").addEventListener("click",addSection);$("#closeSectionDialog").addEventListener("click",()=>$("#sectionDialog").close());
$$(".section-options button").forEach(b=>b.addEventListener("click",()=>{const c=b.dataset.section;$("#sectionDialog").close();if(["programs","facilities","news"].includes(c))openItem(c);else showToast(c+" will be available as a guided section in the next builder step.")}));
$("#admissionInboxButton").addEventListener("click",()=>{const d=$("#admissionInboxDialog");if(!d.open)d.showModal();loadAdmissions(true)});\n$("#closeAdmissionInbox").addEventListener("click",()=>$("#admissionInboxDialog").close());\n$("#refreshAdmissionInbox").addEventListener("click",()=>loadAdmissions(true));\n$("#loadOlderAdmissions").addEventListener("click",()=>loadAdmissions(false));\n$("#previewToggle").addEventListener("click",()=>{const p=$("#previewPanel");p.classList.toggle("open");$("#previewToggle").setAttribute("aria-expanded",String(p.classList.contains("open")))});
$("#closePreview").addEventListener("click",()=>$("#previewPanel").classList.remove("open"));
$("#publishButton").addEventListener("click",()=>showToast("Preview only — publishing requires authorized review and the secure publish workflow."));
const templateDialog=$("#templateDialog");
$("#changeTemplate").addEventListener("click",()=>templateDialog.showModal());$("#closeTemplateDialog").addEventListener("click",()=>templateDialog.close());
$$(".template-option").forEach(b=>b.addEventListener("click",()=>{state.template=b.dataset.template;$$(".template-option").forEach(x=>x.classList.toggle("selected",x===b));templateDialog.close();showToast(b.querySelector("b").textContent+" selected")}));
try{const saved=JSON.parse(localStorage.getItem(draftStorageKey())||"null");if(saved)Object.assign(state,saved)}catch(_){}normalizeSections();
render();
initSectionNavigation();
})();