/* ===== i18n: Egyptian Arabic layer =====
   The English UI is the source. In Arabic mode every text unit in the DOM is looked up in window.ESG_AR
   (key = text with numbers masked as {1},{2}…). Numbers stay as they are, localised (EGP 2.4M → 2.4 مليون ج.م).
   Unknown strings fall back to English, so nothing breaks if a translation is missing. */
const AR_DICT = window.ESG_AR || {};
const isAR = () => store.get('lang','en') === 'ar';
const NUMRE = /(?<![A-Za-z0-9\-])(?:\d{4}-\d{2}-\d{2}|(?:EGP\s)?[−+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:K|M|B|pp|x|ms|d|h|s)(?![A-Za-z])|%)?)/g;
const MONTHS_AR = {Jan:'يناير',Feb:'فبراير',Mar:'مارس',Apr:'أبريل',May:'مايو',Jun:'يونيو',Jul:'يوليو',Aug:'أغسطس',Sep:'سبتمبر',Oct:'أكتوبر',Nov:'نوفمبر',Dec:'ديسمبر'};
const MONTH_RE = new RegExp('\\b('+Object.keys(MONTHS_AR).join('|')+')\\b','g');
const LRI='\u2066', PDI='\u2069';
function locNum(t){
  let m; const W=x=>LRI+x+PDI;
  if((m=t.match(/^EGP\s([−+]?)([\d,.]+)([KMB])?$/))){ const u={K:' ألف',M:' مليون',B:' مليار'}[m[3]]||''; return W((m[1]||'')+m[2])+u+' ج.م'; }
  if((m=t.match(/^([−+]?[\d,.]+)\s?d$/))) return W(m[1])+' يوم';
  if((m=t.match(/^([−+]?[\d,.]+)\s?h$/))) return W(m[1])+' ساعة';
  if((m=t.match(/^([−+]?[\d,.]+)\s?s$/))) return W(m[1])+' ث';
  if((m=t.match(/^([−+]?[\d,.]+)\s?pp$/))) return W(m[1])+' نقطة مئوية';
  return W(t);
}
function maskKey(raw){
  const nums=[]; let i=0;
  const key=raw.replace(NUMRE,t=>{nums.push(t);return '{'+(++i)+'}';});
  return {key,nums};
}
function fillTpl(tpl,nums){ return tpl.replace(/\{(\d+)\}/g,(_,k)=>locNum(nums[+k-1]??'')); }
function monthsAr(s){ return s.replace(MONTH_RE,m=>MONTHS_AR[m]); }
function trString(raw){
  // returns Arabic string or null when nothing to do
  if(!/[A-Za-z]/.test(raw)) return null;
  const lead=raw.match(/^\s*/)[0], trail=raw.match(/\s*$/)[0]; let core=raw.trim(); let suffix='';
  const sm=core.match(/\s[↓↑]$/); if(sm){ suffix=sm[0]; core=core.slice(0,-2); }
  const {key,nums}=maskKey(core);
  if(AR_DICT[key]!=null) return lead+fillTpl(AR_DICT[key],nums)+suffix+trail;
  // pure number / EGP value
  if(/^(\{\d+\}[\s·,/–\-—:()×]*)+$/.test(key)) return lead+nums.reduce((s,t,i)=>s.replace('{'+(i+1)+'}',locNum(t)),key)+suffix+trail;
  // month labels like "Oct '25" or "Apr–Sep 2025"
  if(MONTH_RE.test(core)){ MONTH_RE.lastIndex=0; const r=monthsAr(core); if(!/[A-Za-z]{3,}/.test(r.replace(/EGP|SKU|ACT|SUP|LOC|LINE|CUT|SEW|PR|M\d+/g,''))) return lead+r+suffix+trail; }
  MONTH_RE.lastIndex=0;
  return null;
}
const INLINE_OK = new Set(['STRONG','EM','B','CODE','BR','SMALL','MARK','SUP','SUB']);
const SKIP = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','SELECT_NOT','NOSCRIPT']);
function isInlineUnit(el){
  for(const n of el.childNodes){
    if(n.nodeType===3) continue;
    if(n.nodeType===1 && INLINE_OK.has(n.tagName) && isInlineUnit(n)) continue;
    return false;
  }
  return true;
}
function collectUnits(root,out=[]){
  const walk=el=>{
    if(el.nodeType!==1) return;
    if(SKIP.has(el.tagName)||el.classList.contains('nt')||el.hasAttribute('data-nt')) return;
    if(el.namespaceURI==='http://www.w3.org/2000/svg'){
      if(el.tagName==='text'){ const t=el.textContent; if(t&&/[A-Za-z]/.test(t)&&!el.children.length) out.push({el,kind:'text',raw:t}); else [...el.children].forEach(walk); }
      else [...el.children].forEach(walk);
      return;
    }
    if(el.childNodes.length && isInlineUnit(el)){
      if(el.tagName==='OPTION'||el.textContent.trim()) { const raw=el.innerHTML; if(/[A-Za-z]/.test(el.textContent)) out.push({el,kind:'html',raw}); }
      return;
    }
    for(const n of [...el.childNodes]){
      if(n.nodeType===3){ if(n.nodeValue.trim()&&/[A-Za-z]/.test(n.nodeValue)) out.push({el:n,kind:'node',raw:n.nodeValue}); }
      else if(n.nodeType===1) walk(n);
    }
    ['placeholder','title','aria-label'].forEach(a=>{ if(el.hasAttribute&&el.hasAttribute(a)){ const v=el.getAttribute(a); if(/[A-Za-z]/.test(v)) out.push({el,kind:'attr',attr:a,raw:v}); } });
  };
  if(root.nodeType===1) walk(root); else [...root.childNodes].forEach(walk);
  return out;
}
let _obs=null, _busy=false;
function translateTree(root){
  if(!isAR()) return;
  const units=collectUnits(root);
  for(const u of units){
    const r=trString(u.raw); if(r==null||r===u.raw) continue;
    if(u.kind==='html') u.el.innerHTML=r; else if(u.kind==='text') u.el.textContent=r; else if(u.kind==='node') u.el.nodeValue=r; else if(u.kind==='attr') u.el.setAttribute(u.attr,r);
  }
}
function trFragment(html){
  if(!isAR()) return html;
  const d=document.createElement('div'); d.innerHTML=html; translateTree(d); return d.innerHTML;
}
function applyLangAttrs(){
  const ar=isAR(); const r=document.documentElement; r.lang=ar?'ar':'en'; r.dir=ar?'rtl':'ltr';
  document.title=ar?'مشروع ذكاء القرار · مجموعة الشرنوبي':'El-Sharnouby Group Decision Intelligence Project';
}
function setLang(l){ store.set('lang',l); applyLangAttrs(); buildRail(); const app=document.querySelector('.app'); if(app){ app.replaceChild(rail,app.firstChild); } const tb=document.getElementById('topbar'); if(tb){ const nt=buildTop(); tb.replaceWith(nt);} render(); translateTree(document.getElementById('root')); }
function langToggle(){
  return h('div',{class:'lang nt',role:'group','aria-label':'Language'},
    h('button',{'aria-pressed':String(!isAR()),onclick:()=>setLang('en')},'EN'),
    h('button',{'aria-pressed':String(isAR()),onclick:()=>setLang('ar')},'عربي'));
}
function initI18n(){
  applyLangAttrs();
  const root=document.getElementById('root');
  let pend=false;
  _obs=new MutationObserver(()=>{ if(_busy||pend||!isAR()) return; pend=true; requestAnimationFrame(()=>{ pend=false; _busy=true; _obs.disconnect(); try{ translateTree(root); }catch(e){console.error(e);} _obs.observe(root,{childList:true,subtree:true,characterData:true}); _busy=false; }); });
  _obs.observe(root,{childList:true,subtree:true,characterData:true});
  if(isAR()){ _obs.disconnect(); translateTree(root); _obs.observe(root,{childList:true,subtree:true,characterData:true}); }
  window.__units=()=>collectUnits(document.getElementById('root')).map(u=>u.raw);
}
