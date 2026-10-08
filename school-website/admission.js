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

  form.addEventListener("submit",function(event){
    event.preventDefault();
    status.textContent="";
    if(form.website.value) return;
    if(!form.reportValidity()) return;

    // Deliberately no private SCMS write occurs here.
    // Secure backend submission is a later gate.
    status.textContent="Your form is validated locally. Online submission is not enabled until the secure admission backend is deployed.";
  });
})();
