(function(){
  "use strict";
  const state={schoolName:"",tagline:"",aboutTitle:"",aboutText:"",contactTitle:"",contactText:"",programs:[],facilities:[],news:[]};
  const fieldMeta={
    schoolName:["School name","Give families the name they should remember.","Example: Bright Future International School"],
    tagline:["Welcome message","One short sentence that captures your school.","Example: Growing curious minds with care and confidence."],
    aboutTitle:["School introduction","A simple heading for your introduction.","Example: A place to learn, grow and belong."],
    aboutText:["About your school","Tell families what makes your school special.","Keep this clear and welcoming."],
    contactTitle:["Contact heading","A short heading for your contact area.","Example: We would love to hear from you."],
    contactText:["Contact details","Add the information families need to reach your school.","Example: +95 9... · hello@school.com · Mandalay"]
  };
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const dialog=$("#editorDialog"), input=$("#dialogInput"), title=$("#dialogTitle"), label=$("#dialogLabel"), hint=$("#dialogHint"), toast=$("#toast");
  let activeField=null, activeCollection=null;

  function showToast(message){toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),1800)}
  function openField(field){activeField=field;activeCollection=null;const m=fieldMeta[field];title.textContent=m[0];label.textContent=m[0];input.value=state[field];hint.textContent=m[2];input.placeholder=m[1];dialog.showModal();setTimeout(()=>input.focus(),30)}
  function openItem(collection){activeCollection=collection;activeField=null;const names={programs:["Add a program","Example: Primary Education"],facilities:["Add a facility","Example: Science & Innovation Lab"],news:["Add news or event","Example: Open Day 2026"]};const m=names[collection];title.textContent=m[0];label.textContent="Title";input.value="";hint.textContent=m[1];input.placeholder=m[1];dialog.showModal();setTimeout(()=>input.focus(),30)}
  function render(){
    $$("[data-field]").forEach(el=>{const f=el.dataset.field;el.textContent=state[f]||({schoolName:"Click here to add your school name",tagline:"Click here to add a short welcome message",aboutTitle:"Click here to add your school introduction",aboutText:"Tell families what makes your school special. A short, clear introduction works best.",contactTitle:"Click here to add your contact details",contactText:"Phone · Email · Address · Location"}[f]);el.classList.toggle("filled",!!state[f])});
    renderCollection("programs");renderCollection("facilities");renderCollection("news");renderPreview();
    localStorage.setItem("scms-website-draft",JSON.stringify(state));$("#saveState").textContent="Saved locally";
  }
  function renderCollection(c){
    const target=$("#"+(c==="programs"?"programItems":c==="facilities"?"facilityItems":"newsItems"));
    const items=state[c];
    target.innerHTML=items.length?items.map((x,i)=>'<article class="added-card"><button class="remove-card" data-remove="'+c+'" data-index="'+i+'" aria-label="Remove">×</button><b>'+escapeHtml(x)+'</b><span>Published on your website after review</span></article>').join(""):'<button class="add-card" data-add-item="'+c+'" type="button">＋<span>'+({programs:"Add your first program",facilities:"Show families your school",news:"Add your first news item"}[c])+'</span></button>';
  }
  function renderPreview(){
    const name=escapeHtml(state.schoolName||"Your School"),tag=escapeHtml(state.tagline||"A welcoming place to learn, grow and belong.");
    const sections=[["About",state.aboutText],["Programs",state.programs.join(" · ")],["School life",state.facilities.join(" · ")],["News & events",state.news.join(" · ")],["Contact",state.contactText]];
    $("#previewCanvas").innerHTML='<div class="mini-hero"><div class="mini-logo">'+(state.schoolName?escapeHtml(state.schoolName[0].toUpperCase()):"S")+'</div><h1>'+name+'</h1><p>'+tag+'</p></div>'+sections.map(x=>'<section class="mini-section"><h2>'+escapeHtml(x[0])+'</h2><p>'+escapeHtml(x[1]||"Content will appear here when you add it.")+'</p></section>').join("");
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]||c))}
  function addSection(){ $("#sectionDialog").showModal() }
  function openPreview(){const p=$("#previewPanel");p.classList.add("open");$("#previewToggle").setAttribute("aria-expanded","true")}
  $$("[data-field]").forEach(el=>el.addEventListener("click",()=>openField(el.dataset.field)));
  $$("[data-add-item]").forEach(el=>el.addEventListener("click",()=>openItem(el.dataset.addItem)));
  $$(".block-edit").forEach(el=>el.addEventListener("click",()=>{const b=el.dataset.edit; if(fieldMeta[b])openField(b); else if(["programs","facilities","news"].includes(b))openItem(b); else showToast("This section is ready for editing.")}));
  $("#dialogSave").addEventListener("click",e=>{e.preventDefault();const value=input.value.trim();if(!value)return; if(activeField)state[activeField]=value; if(activeCollection)state[activeCollection].push(value);dialog.close();render();showToast("Draft updated")});
  $("#addSectionTop").addEventListener("click",addSection);$("#addSectionBottom").addEventListener("click",addSection);
  $("#closeSectionDialog").addEventListener("click",()=>$("#sectionDialog").close());
  $$(".section-options button").forEach(b=>b.addEventListener("click",()=>{const c=b.dataset.section;$("#sectionDialog").close();if(c==="programs"||c==="facilities"||c==="news")openItem(c);else showToast(c+" section added to the design in the next builder step.")}));
  document.addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(b){state[b.dataset.remove].splice(Number(b.dataset.index),1);render();showToast("Removed from draft") }});
  $("#previewToggle").addEventListener("click",()=>{const p=$("#previewPanel");p.classList.toggle("open");$("#previewToggle").setAttribute("aria-expanded",String(p.classList.contains("open")))});
  $("#closePreview").addEventListener("click",()=>$("#previewPanel").classList.remove("open"));
  $("#publishButton").addEventListener("click",()=>showToast("Preview only — publishing will require authorized review and the secure publish workflow."));
  try{const saved=JSON.parse(localStorage.getItem("scms-website-draft")||"null");if(saved)Object.assign(state,saved)}catch(_){}
  render();
})();