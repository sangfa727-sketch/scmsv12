(function(){
  "use strict";
  const host=window.location.hostname.toLowerCase();
  const reserved=new Set(["www","school","scms","localhost"]);
  const label=host.split(".")[0]||"";
  const slug=reserved.has(label)?"":label;
  const name=slug?slug.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()):"School";
  document.getElementById("schoolName").textContent=name;

  const form=document.getElementById("admissionForm");
  const status=document.getElementById("formStatus");
  const submitButton=document.getElementById("submitAdmissionButton");
  const apiMeta=document.querySelector('meta[name="scms-public-website-api-base"]');
  const apiBase=normalizeApiBase(apiMeta?.content||"");
  // No private SCMS write occurs in this browser; only the isolated public intake endpoint may receive the form.
  let idempotencyKey=createIdempotencyKey();

  function normalizeApiBase(value){
    if(typeof value!=="string"||!value.trim()) return "";
    try{
      const url=new URL(value.trim());
      if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||url.port) return "";
      return url.origin;
    }catch(_){return "";}
  }
  function createIdempotencyKey(){
    if(window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes=new Uint8Array(24);
    if(!window.crypto?.getRandomValues) return "";
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  }
  function value(name){return String(form.elements.namedItem(name)?.value||"").trim()}
  function setStatus(message,kind){
    status.textContent=message;
    status.dataset.state=kind||"info";
  }
  function payload(){
    return {
      student_name:value("student_name"),
      date_of_birth:value("date_of_birth"),
      applying_grade:value("applying_grade"),
      guardian_name:value("guardian_name"),
      guardian_phone:value("guardian_phone"),
      guardian_email:value("guardian_email"),
      previous_school:value("previous_school"),
      preferred_contact:value("preferred_contact")||"phone",
      message:value("message"),
      website:value("website"),
      idempotencyKey
    };
  }
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    setStatus("");
    if(value("website")) return;
    if(!form.reportValidity()) return;
    if(!apiBase){
      setStatus("Your form is valid, but online submission is not enabled yet. Please contact the school directly.", "notice");
      return;
    }
    if(!idempotencyKey){
      setStatus("Secure submission could not be initialized. Please reload and try again.", "error");
      return;
    }
    submitButton.disabled=true;
    submitButton.setAttribute("aria-busy","true");
    setStatus("Submitting your application securely…","pending");
    try{
      const response=await fetch(apiBase+"/functions/v1/public-admission-submit",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload()),
        cache:"no-store",
        credentials:"omit",
        redirect:"error"
      });
      let result={};
      try{result=await response.json()}catch(_){}
      if(response.status===201&&result.ok===true){
        form.reset();
        idempotencyKey=createIdempotencyKey();
        setStatus("Your application has been sent to the school for review. It is not yet a student registration.","success");
        return;
      }
      const messages={
        400:"Please check the information and try again.",
        403:"This website origin is not enabled for online admission yet.",
        404:"The school website is not configured for online admission yet.",
        409:"This application was already submitted. Please contact the school if you need to make a change.",
        413:"Your submission is too large. Please shorten the message and try again.",
        415:"The form could not be submitted in this format.",
        429:"Too many attempts. Please wait a while before trying again.",
        503:"Online admission is temporarily unavailable. Please try again later or contact the school."
      };
      setStatus(messages[response.status]||"We could not submit your application. Please try again later.","error");
    }catch(_){
      setStatus("The connection failed. Your information has not been confirmed as submitted; you can safely retry.","error");
    }finally{
      submitButton.disabled=false;
      submitButton.removeAttribute("aria-busy");
    }
  });
})();
