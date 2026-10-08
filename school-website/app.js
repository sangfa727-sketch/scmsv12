(function(){
  "use strict";

  // Foundation only: hostname resolution is local and deterministic.
  // Production content loading will be added behind a published-content API.
  const host = window.location.hostname.toLowerCase();
  const reserved = new Set(["www","school","scms","localhost"]);
  const firstLabel = host.split(".")[0] || "";
  const schoolSlug = reserved.has(firstLabel) ? "" : firstLabel;

  const demo = {
    name: schoolSlug ? schoolSlug.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()) : "School",
    programs: [
      {title:"Academic Programs",text:"Published curriculum and learning programs."},
      {title:"Student Activities",text:"Published clubs, activities, and school life."},
      {title:"Admissions",text:"Published enrollment information and requirements."}
    ],
    news: [
      {title:"School News",text:"Published announcements and events will appear here."},
      {title:"Upcoming Events",text:"Event information will be published by the school."}
    ]
  };

  document.getElementById("schoolName").textContent = demo.name;

  function renderItems(id, items){
    document.getElementById(id).innerHTML = items.map(item =>
      '<article class="item"><h3>'+escapeHtml(item.title)+'</h3><p>'+escapeHtml(item.text)+'</p></article>'
    ).join("");
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  renderItems("programList", demo.programs);
  renderItems("newsList", demo.news);
})();
