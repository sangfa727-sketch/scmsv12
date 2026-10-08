'use strict';

let _insightsClass = 'All';
let _insightsSearch = '';
let _insightsReportCard = { students: [] };
let _insightsTerms = [];
let _insightsTermId = null;

function _insightsText(k) {
  const lang = window.I18N && window.I18N.current || 'en';
  const d = {
    en:{title:'Class Insights',sub:'One calm view of student performance signals',all:'All classes',students:'Students',strong:'Strengths',attention:'Needs attention',grade:'Overall',attendance:'Attendance',nodata:'No graded data yet',view:'View student',note:'Data signals only — not a diagnosis.',refresh:'Refresh'},
    my:{title:'အတန်းအလိုက် အနှစ်ချုပ်',sub:'ကျောင်းသားများ၏ စွမ်းဆောင်ရည်ကို တစ်နေရာတည်းမှာ ကြည့်ရန်',all:'အတန်းအားလုံး',students:'ကျောင်းသား',strong:'အားသာချက်',attention:'အာရုံစိုက်ရန်',grade:'စုစုပေါင်း',attendance:'တက်ရောက်မှု',nodata:'အမှတ်ဒေတာ မရှိသေးပါ',view:'ကျောင်းသားကြည့်ရန်',note:'Data signal များသာဖြစ်ပြီး diagnosis မဟုတ်ပါ။',refresh:'ပြန်တင်ရန်'},
    th:{title:'ภาพรวมชั้นเรียน',sub:'ดูสัญญาณผลการเรียนของนักเรียนในที่เดียว',all:'ทุกชั้นเรียน',students:'นักเรียน',strong:'จุดแข็ง',attention:'ควรใส่ใจ',grade:'รวม',attendance:'การเข้าเรียน',nodata:'ยังไม่มีข้อมูลคะแนน',view:'ดูนักเรียน',note:'เป็นสัญญาณจากข้อมูล ไม่ใช่การวินิจฉัย',refresh:'รีเฟรช'},
    jp:{title:'クラス・インサイト',sub:'生徒の学習状況をひとつの画面で確認',all:'すべてのクラス',students:'生徒',strong:'強み',attention:'要注意',grade:'総合',attendance:'出席',nodata:'成績データなし',view:'生徒を見る',note:'データ上の傾向であり診断ではありません。',refresh:'更新'},
    ms:{title:'Class Insights',sub:'Ringkasan prestasi murid dalam satu paparan',all:'Semua kelas',students:'Murid',strong:'Kekuatan',attention:'Perlu perhatian',grade:'Keseluruhan',attendance:'Kehadiran',nodata:'Tiada data markah',view:'Lihat murid',note:'Isyarat data sahaja — bukan diagnosis.',refresh:'Muat semula'},
    km:{title:'ព័ត៌មានថ្នាក់រៀន',sub:'មើលសញ្ញាលទ្ធផលសិស្សនៅកន្លែងតែមួយ',all:'គ្រប់ថ្នាក់',students:'សិស្ស',strong:'ចំណុចខ្លាំង',attention:'ត្រូវយកចិត្តទុកដាក់',grade:'សរុប',attendance:'វត្តមាន',nodata:'មិនទាន់មានទិន្នន័យពិន្ទុ',view:'មើលសិស្ស',note:'ជាសញ្ញាពីទិន្នន័យ មិនមែនការវិនិច្ឆ័យទេ។',refresh:'ធ្វើបច្ចុប្បន្នភាព'},
    zh:{title:'班级洞察',sub:'在一个视图中查看学生表现趋势',all:'全部班级',students:'学生',strong:'优势',attention:'需要关注',grade:'总评',attendance:'出勤',nodata:'暂无成绩数据',view:'查看学生',note:'这些是数据趋势，不是诊断。',refresh:'刷新'}
  };
  return (d[lang] || d.en)[k] || d.en[k] || k;
}
function _ie(v){ return typeof esc === 'function' ? esc(v) : String(v == null ? '' : v); }
function _stats(r){
  const ss = (r && r.subjects || []).filter(function(s){return s && s.pct != null;});
  return {subjects:ss,strong:ss.filter(function(s){return Number(s.pct)>=80;}).sort(function(a,b){return Number(b.pct)-Number(a.pct);}),attention:ss.filter(function(s){return Number(s.pct)<60;}).sort(function(a,b){return Number(a.pct)-Number(b.pct);})};
}
function _reportMap(){
  const m=new Map();
  (_insightsReportCard.students||[]).forEach(function(s){if(s.student_id!=null)m.set(String(s.student_id),s);if(s.name_en)m.set('name:'+String(s.name_en).toLowerCase(),s);});
  return m;
}
function _findReport(s,m){return m.get(String(s.student_id))||m.get('name:'+String(s.name_en||s.name_local||'').toLowerCase())||null;}
function _shell(){
  return '<section class="insights-shell">'+
    '<div class="insights-hero"><div><div class="insights-eyebrow">SCMS • '+_ie(_insightsText('students'))+'</div><h1>'+_ie(_insightsText('title'))+'</h1><p>'+_ie(_insightsText('sub'))+'</p></div><button type="button" class="insights-refresh" id="insightsRefresh" title="'+_ie(_insightsText('refresh'))+'">↻</button></div>'+
    '<div class="insights-toolbar"><div id="insightsClassChips" class="insights-chips"></div><label class="insights-search"><span>⌕</span><input id="insightsSearch" type="search" placeholder="'+_ie(_insightsText('students'))+'"></label></div>'+
    '<div id="insightsMetrics" class="insights-metrics"></div><div class="insights-section-head"><div><h2>'+_ie(_insightsText('title'))+'</h2><span>'+_ie(_insightsText('note'))+'</span></div></div><div id="insightsList" class="insights-list"></div></section>';
}
async function _loadReport(){
  _insightsReportCard={students:[]};
  try{
    _insightsTerms=await API.getTerms();
    if(!_insightsTerms.length)return;
    if(!_insightsTermId||!_insightsTerms.some(function(t){return Number(t.id)===Number(_insightsTermId);}))_insightsTermId=(_insightsTerms.find(function(t){return t.is_current;})||_insightsTerms[0]).id;
    const students=(window.APP&&window.APP.students||[]).filter(function(s){return s.status==='Active';});
    const classes=_insightsClass==='All'?[...new Set(students.map(function(s){return s.class;}).filter(Boolean))]:[_insightsClass];
    const results=await Promise.all(classes.map(function(cls){return API.getReportCard(_insightsTermId,cls).catch(function(){return {ok:false,students:[]};});}));
    const merged=[];results.forEach(function(r){if(r&&Array.isArray(r.students))merged.push.apply(merged,r.students);});
    _insightsReportCard={students:merged};
  }catch(e){_insightsReportCard={students:[]};}
}
function renderInsights(opts){
  opts=opts||{}; const root=document.getElementById('page-insights'); if(!root)return;
  root.innerHTML=_shell();
  const list=root.querySelector('#insightsList'); if(list)list.innerHTML=typeof skeletonCards==='function'?skeletonCards(3):'';
  try{
    if(window.SCMSDataLoader){if(opts.force)window.SCMSDataLoader.invalidate(['students','monthlySummary']);await Promise.all([window.SCMSDataLoader.load('students',{force:!!opts.force}),window.SCMSDataLoader.load('monthlySummary',{force:!!opts.force})]);}
    await _loadReport(); _renderInsights();
  }catch(e){if(list)list.innerHTML='<div class="insights-error">'+_ie(e.message||'Unable to load insights')+'</div>';}
}
function _renderInsights(){
  const root=document.getElementById('page-insights'); if(!root)return;
  const students=(window.APP&&window.APP.students||[]).filter(function(s){return s.status==='Active';});
  const classes=[...new Set(students.map(function(s){return s.class;}).filter(Boolean))].sort();
  if(_insightsClass!=='All'&&!classes.includes(_insightsClass))_insightsClass='All';
  const chips=root.querySelector('#insightsClassChips');
  if(chips){chips.innerHTML='<button class="insights-chip '+(_insightsClass==='All'?'active':'')+'" data-class="All">'+_ie(_insightsText('all'))+'</button>'+classes.map(function(c){return '<button class="insights-chip '+(_insightsClass===c?'active':'')+'" data-class="'+_ie(c)+'">'+_ie(c)+'</button>';}).join('');chips.querySelectorAll('.insights-chip').forEach(function(b){b.onclick=async function(){_insightsClass=b.dataset.class;_insightsSearch='';await _loadReport();_renderInsights();};});}
  const search=root.querySelector('#insightsSearch'); if(search&&!search.dataset.bound){search.dataset.bound='1';search.value=_insightsSearch;search.oninput=function(){_insightsSearch=search.value.trim().toLowerCase();_renderList();};}
  const refresh=root.querySelector('#insightsRefresh');if(refresh)refresh.onclick=function(){renderInsights({force:true});};
  _renderMetrics(students);_renderList();
}
function _renderMetrics(students){
  const el=document.getElementById('insightsMetrics');if(!el)return;const visible=students.filter(function(s){return _insightsClass==='All'||s.class===_insightsClass;});const m=_reportMap();const graded=visible.map(function(s){return _findReport(s,m);}).filter(Boolean);const strong=graded.reduce(function(n,r){return n+_stats(r).strong.length;},0);const attention=graded.reduce(function(n,r){return n+_stats(r).attention.length;},0);const avg=graded.length?Math.round(graded.reduce(function(n,r){return n+Number(r.overall_pct||0);},0)/graded.length):null;el.innerHTML='<div class="insight-metric"><span>'+_ie(_insightsText('students'))+'</span><strong>'+visible.length+'</strong></div><div class="insight-metric"><span>'+_ie(_insightsText('grade'))+'</span><strong>'+ (avg==null?'—':avg+'%')+'</strong></div><div class="insight-metric positive"><span>'+_ie(_insightsText('strong'))+'</span><strong>'+strong+'</strong></div><div class="insight-metric attention"><span>'+_ie(_insightsText('attention'))+'</span><strong>'+attention+'</strong></div>';
}
function _renderList(){
  const el=document.getElementById('insightsList');if(!el)return;const students=(window.APP&&window.APP.students||[]).filter(function(s){return s.status==='Active';}).filter(function(s){return _insightsClass==='All'||s.class===_insightsClass;}).filter(function(s){const q=_insightsSearch;return !q||String(s.name_en||s.name_local||'').toLowerCase().includes(q)||String(s.student_id||'').toLowerCase().includes(q);});
  const m=_reportMap();const monthly=window.APP&&window.APP.monthlySummary||[];
  if(!students.length){el.innerHTML='<div class="insights-empty">'+_ie(_insightsText('nodata'))+'</div>';return;}
  el.innerHTML=students.map(function(s){const r=_findReport(s,m),st=_stats(r),mon=monthly.find(function(x){return String(x.student_id)===String(s.student_id);}),overall=r&&r.overall_pct!=null?Number(r.overall_pct):null;return '<article class="insight-student-card"><div class="insight-card-top"><div class="insight-avatar">'+_ie(String(s.name_en||s.name_local||'?').trim().charAt(0).toUpperCase())+'</div><div class="insight-student-main"><h3>'+_ie(s.name_en||s.name_local||s.student_id)+'</h3><span>'+_ie(s.class||'—')+' · '+_ie(s.student_id||'')+'</span></div><div class="insight-overall">'+(overall==null?'—':overall+'%')+'<small>'+_ie(_insightsText('grade'))+'</small></div></div><div class="insight-columns"><div class="insight-block positive"><div class="insight-block-title">↑ '+_ie(_insightsText('strong'))+'</div><div class="insight-tags">'+(st.strong.slice(0,3).map(function(x){return '<span>'+_ie(tv('subject',x.subject_name))+' · '+Number(x.pct)+'%</span>';}).join('')||'<em>'+_ie(_insightsText('nodata'))+'</em>')+'</div></div><div class="insight-block attention"><div class="insight-block-title">! '+_ie(_insightsText('attention'))+'</div><div class="insight-tags">'+(st.attention.slice(0,3).map(function(x){return '<span>'+_ie(tv('subject',x.subject_name))+' · '+Number(x.pct)+'%</span>';}).join('')||'<em>—</em>')+'</div></div></div><div class="insight-foot"><span>'+_ie(_insightsText('attendance'))+': '+(mon&&mon.absent_days!=null?String(mon.absent_days)+' absent':'—')+'</span><span>'+st.subjects.length+' subject'+(st.subjects.length===1?'':'s')+'</span><button type="button" data-student="'+_ie(s.student_id)+'">'+_ie(_insightsText('view'))+' →</button></div></article>';}).join('');
  el.querySelectorAll('[data-student]').forEach(function(b){b.onclick=function(){openInsightStudent(b.dataset.student);};});
}
window.openInsightStudent=function(id){
  const s=(window.APP&&window.APP.students||[]).find(function(x){return String(x.student_id)===String(id);});if(!s)return;const r=_findReport(s,_reportMap()),st=_stats(r);let rows=st.subjects.map(function(x){return '<div><span>'+_ie(tv('subject',x.subject_name))+'</span><strong>'+Number(x.pct)+'% · '+_ie(x.letter||'')+'</strong></div>';}).join('');openModal('<div class="modal-sheet insight-detail-sheet" onclick="event.stopPropagation()"><div class="modal-handle"></div><div class="insight-detail-head"><div class="insight-avatar large">'+_ie(String(s.name_en||s.name_local||'?').charAt(0).toUpperCase())+'</div><div><h3 class="modal-title">'+_ie(s.name_en||s.name_local)+'</h3><p class="modal-subtitle">'+_ie(s.class||'—')+' · '+_ie(s.student_id||'')+'</p></div></div><div class="insight-detail-grid"><div class="insight-detail-panel"><b>'+_ie(_insightsText('strong'))+'</b>'+(st.strong.map(function(x){return '<div>'+_ie(tv('subject',x.subject_name))+'<strong>'+Number(x.pct)+'%</strong></div>';}).join('')||'<span>—</span>')+'</div><div class="insight-detail-panel"><b>'+_ie(_insightsText('attention'))+'</b>'+(st.attention.map(function(x){return '<div>'+_ie(tv('subject',x.subject_name))+'<strong>'+Number(x.pct)+'%</strong></div>';}).join('')||'<span>—</span>')+'</div></div><div class="insight-subject-list">'+(rows||'<div>'+_ie(_insightsText('nodata'))+'</div>')+'</div><div class="insight-detail-note">'+_ie(_insightsText('note'))+'</div><button class="btn-secondary mt16" onclick="closeModal()">'+_ie(t('common.close'))+'</button></div>');
};
window.renderInsights=renderInsights;
