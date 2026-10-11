(function(){
  "use strict";
  const $=(selector)=>document.querySelector(selector);
  const host=window.location.hostname.toLowerCase().replace(/\.$/,"");
  const apiMeta=$('meta[name="scms-public-website-api-base"]');
  const keyMeta=$('meta[name="scms-public-website-anon-key"]');

  function apiOrigin(value){
    if(typeof value!=="string"||!value.trim())return "";
    try{
      const url=new URL(value.trim());
      if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||url.port)return "";
      return url.origin;
    }catch(_){return ""}
  }
  function clearList(id){
    const target=$("#"+id);
    if(target)target.replaceChildren();
  }
  function renderItems(id,items){
    const target=$("#"+id);
    if(!target)return;
    target.replaceChildren();
    (Array.isArray(items)?items:[]).forEach(value=>{
      if(typeof value!=="string"||!value.trim())return;
      const article=document.createElement("article");
      article.className="item";
      const title=document.createElement("h3");
      title.textContent=value;
      article.appendChild(title);
      target.appendChild(article);
    });
  }
  function showUnavailable(message){
    $("#schoolName").textContent="School website";
    $("#heroTitle").textContent="This school website is not published yet.";
    $("#heroText").textContent=message||"School information will appear here after the school publishes its website.";
    const nav=$('nav[aria-label="Primary"]');
    if(nav)nav.hidden=true;
    ["about","programs","facilities","news","admissions","contact"].forEach(id=>{
      const section=$("#"+id);
      if(section)section.hidden=true;
    });
    document.title="School Website";
  }
  function applySectionVisibility(content){
    const sections=Array.isArray(content.sections)?content.sections:[];
    const visibility=new Map(sections.filter(item=>item&&typeof item.id==="string").map(item=>[item.id,item.visible!==false]));
    ["hero","about","programs","facilities","news","contact"].forEach(id=>{
      const section=$("#"+id);
      if(section&&visibility.has(id))section.hidden=!visibility.get(id);
    });
    const nav=$('nav[aria-label="Primary"]');
    if(nav){
      nav.hidden=false;
      nav.querySelectorAll('a[href^="#"]').forEach(link=>{
        const section=$(link.getAttribute("href"));
        link.hidden=!!section&&section.hidden;
      });
    }
  }
  function renderPublished(result){
    const content=result.content&&typeof result.content==="object"?result.content:null;
    if(!content){showUnavailable();return}
    document.body.dataset.template=["modern","classic","premium"].includes(result.template)?result.template:"modern";
    const schoolName=typeof content.schoolName==="string"&&content.schoolName.trim()?content.schoolName.trim():"School";
    $("#schoolName").textContent=schoolName;
    $("#heroTitle").textContent=typeof content.tagline==="string"&&content.tagline.trim()?content.tagline:"Welcome to "+schoolName;
    $("#heroText").textContent=typeof content.aboutText==="string"&&content.aboutText.trim()?content.aboutText:"Welcome to our school website.";
    $("#aboutTitle").textContent=content.aboutTitle||"About";
    $("#aboutText").textContent=content.aboutText||"";
    $("#contactTitle").textContent=content.contactTitle||"Contact";
    $("#contactText").textContent=content.contactText||"Please contact the school for more information.";
    $("#newsTitle").textContent="News & Events";
    $("#facilitiesTitle").textContent="Facilities";
    renderItems("programList",content.programs);
    renderItems("facilityList",content.facilities);
    renderItems("newsList",content.news);
    const sections=Array.isArray(content.sections)?content.sections:[];
    const admissionsSection=sections.find(item=>item&&item.id==="admissions");
    $("#admissions").hidden=!!admissionsSection&&admissionsSection.visible===false;
    applySectionVisibility(content);
    if(!Array.isArray(content.programs)||content.programs.length===0)$("#programs").hidden=true;
    if(!Array.isArray(content.facilities)||content.facilities.length===0)$("#facilities").hidden=true;
    if(!Array.isArray(content.news)||content.news.length===0)$("#news").hidden=true;
    document.title=schoolName+" | School Website";
  }
  async function boot(){
    const origin=apiOrigin(apiMeta?.content||"");
    const anonKey=(keyMeta?.content||"").trim();
    if(!origin||!anonKey){
      showUnavailable("This website has not been connected to its public content service yet.");
      return;
    }
    try{
      const response=await fetch(origin+"/rest/v1/rpc/rpc_school_website_get_published",{
        method:"POST",
        headers:{apikey:anonKey,Authorization:"Bearer "+anonKey,"Content-Type":"application/json"},
        body:JSON.stringify({p_hostname:host}),
        cache:"no-store",
        credentials:"omit",
        redirect:"error"
      });
      if(!response.ok){showUnavailable();return}
      const result=await response.json();
      if(!result||result.ok!==true||result.found!==true){showUnavailable();return}
      renderPublished(result);
    }catch(_){
      showUnavailable("School information is temporarily unavailable. Please try again later.");
    }
  }
  boot();
})();
