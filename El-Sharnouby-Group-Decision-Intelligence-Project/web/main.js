/* ===== Dashboard shell: navigation, filters, router, command palette ===== */
const APPS = [
 {id:'exec',n:'01',t:'Control Room',g:'Overview',kicker:'Executive Control Room'},
 {id:'briefing',n:'★',t:'Insights & Actions',g:'Overview',kicker:'What happened · why it matters · who acts'},
 {id:'map',n:'··',t:'System Map',g:'Overview',kicker:'How the modules connect'},
 {id:'profit',n:'10',t:'Profitability',g:'Commercial',kicker:'Profitability & Margin Intelligence'},
 {id:'discount',n:'14',t:'Discount Discipline',g:'Commercial',kicker:'Hidden value · Wholesale pricing'},
 {id:'channels',n:'06',t:'Channels & Expansion',g:'Commercial',kicker:'Branch Intelligence & Expansion'},
 {id:'customers',n:'03',t:'Customer 360',g:'Commercial',kicker:'Customer 360 & Retention'},
 {id:'marketing',n:'05',t:'Marketing & Growth',g:'Commercial',kicker:'Marketing Attribution & Growth'},
 {id:'inventory',n:'02',t:'Inventory & Replenishment',g:'Supply & Operations',kicker:'Smart Inventory & Replenishment'},
 {id:'rebalance',n:'11',t:'Stock Rebalancing',g:'Supply & Operations',kicker:'Cross-Location Inventory Rebalancing'},
 {id:'factory',n:'04',t:'Factory & Production',g:'Supply & Operations',kicker:'Factory Production Control (historical)'},
 {id:'procurement',n:'07',t:'Procurement & Suppliers',g:'Supply & Operations',kicker:'Procurement, Cost & Supplier Risk'},
 {id:'quality',n:'12',t:'Quality & Returns',g:'Supply & Operations',kicker:'Quality, Returns & Cost of Poor Quality'},
 {id:'planner',n:'15',t:'Demand vs Capacity',g:'Supply & Operations',kicker:'Demand vs Capacity Planner'},
 {id:'whatif',n:'08',t:'What-If Simulator',g:'Decide',kicker:'What-If Simulator & Decision Optimizer'},
 {id:'warning',n:'09',t:'Early Warning',g:'Decide',kicker:'Early Warning & Root Cause'},
 {id:'decisions',n:'13',t:'Decision Log',g:'Decide',kicker:'Recommendation Impact & Learning Loop'},
 {id:'ask',n:'··',t:'Ask the data',g:'Foundation',kicker:'Prepared questions answered from the loaded data'},
 {id:'trust',n:'··',t:'Data Trust',g:'Foundation',kicker:'Data audit, definitions & model scorecards'},
];
const APPBYID = Object.fromEntries(APPS.map(a=>[a.id,a]));
const MODSEV = {}; D.alerts.forEach(a=>{ const m=a.module; MODSEV[m]=Math.max(MODSEV[m]||0,a.sev); });
const MODMAP = {exec:'exec',profit:'profit',discount:'discount',channels:'exec',customers:'customers',marketing:'marketing',inventory:'inventory',rebalance:'inventory',factory:'factory',procurement:'procurement',quality:'quality',planner:'procurement',ask:null,briefing:null,whatif:null,warning:null,decisions:null,trust:'data',map:null};
const VIEWS = {};
let current = 'exec', rail, main, pageEl;
function go(id){ location.hash = '#'+id; }
function pageHead(id, title, lede){ const a=APPBYID[id]; return h('header',{class:'ph'},h('div',{class:'eyebrow'},(a.n!=='··'?'App '+a.n+' · ':'')+a.kicker),h('h1',null,title),lede?h('p',{class:'lede',html:lede}):null); }
function four(o){ const cell=(k,l,t)=>h('div',null,h('div',{class:'q'},h('span',null,l),h('b',null,k)),h('p',{html:t})); return h('div',{class:'four'},cell('Now','What is happening',o.now),cell('Why','What explains it',o.why),cell('Next','What may happen',o.next),cell('Do','What to do',o.do)); }
function lineage(o){ const L=(ids)=>ids.map((i,k)=>h('span',null,h('a',{onclick:()=>go(i)},APPBYID[i].t),k<ids.length-1?' · ':'')); return h('footer',{class:'lineage'},o.tables?h('div',null,h('b',null,'Data'),o.tables):null,o.from?h('div',null,h('b',null,'Receives from'),L(o.from)):null,o.to?h('div',null,h('b',null,'Sends to'),L(o.to)):null,o.note?h('div',null,h('b',null,'Note'),o.note):null); }
function section(title,sub){ return h('div',{class:'section-h'},h('h2',null,title),sub?h('span',null,sub):null); }
function pill(text,cls){ return h('span',{class:'pill '+cls},text); }
function sevPill(s){ return pill({4:'Critical',3:'High',2:'Medium',1:'Low'}[s],'s'+s); }
function modChip(m){ const a=APPS.find(x=>MODMAP[x.id]===m)||APPBYID[m]; return h('button',{class:'btn sm',onclick:()=>a&&go(a.id)},a?a.t:m); }
function buildRail(){
  const groups=[...new Set(APPS.map(a=>a.g))];
  rail=h('aside',{class:'rail',id:'rail','aria-label':'Modules'});
  rail.append(h('button',{class:'brand',onclick:()=>go('exec'),'aria-label':'Home'},
    h('span',null,h('b',null,'El-Sharnouby Group'),h('span',{class:'sub2'},'Decision Intelligence'))));
  groups.forEach(g=>{ rail.append(h('div',{class:'nav-group'},g)); const ul=h('ul',{class:'nav'}); APPS.filter(a=>a.g===g).forEach(a=>{ const s=MODSEV[MODMAP[a.id]]||0; ul.append(h('li',null,h('button',{'data-id':a.id,onclick:()=>{go(a.id);rail.classList.remove('open');}},h('span',{class:'bead s'+(s>=3?s:s===0&&MODMAP[a.id]?0:s)}),h('span',{class:'n'},a.n),h('span',{class:'lbl'},a.t)))); }); rail.append(ul); });
  rail.append(h('div',{class:'rail-foot'},h('span',{class:'asof'},'Data to '+fmt.moFull(35)+' · 36 months'),h('span',null,'Bead colour = highest open alert in that module.'),
    h('button',{class:'themebtn',onclick:toggleTheme},'Light / dark'),langToggle()));
}
function toggleTheme(){ const r=document.documentElement; const cur=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'); r.dataset.theme=cur==='dark'?'light':'dark'; store.set('theme',r.dataset.theme); render(); }
const PRESETS={L12M:['Last 12 months',24,35],L6M:['Last 6 months',30,35],YTD:['2026 YTD',27,35],FY25:['2025',15,26],ALL:['All 36 months',0,35]};
function buildTop(){
  const top=h('div',{class:'topbar',id:'topbar'});
  top.append(h('button',{class:'btn menubtn',onclick:()=>rail.classList.toggle('open'),'aria-label':'Menu'},'☰ Menu'));
  top.append(h('span',{class:'tb-label'},'Period'));
  const seg=h('div',{class:'seg',role:'group','aria-label':'Period'}); Object.entries(PRESETS).forEach(([k,[l,a,b]])=>seg.append(h('button',{'aria-pressed':F.preset===k,onclick:()=>{F.preset=k;F.from=a;F.to=b;render();updateTop();}},l))); top.append(seg);
  top.append(h('span',{class:'tb-label'},'Channel')); const chips=h('div',{class:'chips'}); CH.forEach(c=>chips.append(h('button',{class:'chip','aria-pressed':F.ch.has(c),onclick:()=>{ if(F.ch.has(c)&&F.ch.size>1)F.ch.delete(c); else F.ch.add(c); render(); updateTop(); }},h('i',{style:{background:CHCOL[c]}}),c))); top.append(chips);
  const fam=h('select',{id:'famsel','aria-label':'Product family',onchange:e=>{F.family=e.target.value;render();}},h('option',{value:'All'},'All families'),[...new Set(FAMILY)].map(f=>h('option',{value:f},f))); top.append(fam);
  top.append(h('span',{class:'spacer'}));
  top.append(langToggle());
  top.append(h('button',{class:'btn sm noprint',onclick:()=>window.print(),'aria-label':'Print or save as PDF'},'Print / Save PDF'));
  top.append(h('button',{class:'kbd',onclick:openCmd},'⌘K  Search'));
  top.dataset.ready=1; return top;
}
function updateTop(){ const t=$('#topbar'); if(!t) return; $$('.seg button',t).forEach((b,i)=>{b.setAttribute('aria-pressed',Object.keys(PRESETS)[i]===F.preset);}); $$('.chip',t).forEach((b,i)=>b.setAttribute('aria-pressed',F.ch.has(CH[i]))); }
const FILTERED = new Set(['exec','profit','discount','channels','quality']);
function render(){
  const id=current; $$('.nav button',rail).forEach(b=>b.toggleAttribute('aria-current',b.dataset.id===id)); $$('.nav button',rail).forEach(b=>{ if(b.dataset.id===id) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  const tb=$('#topbar'); if(tb){ tb.style.display='flex'; $$('.seg,.chips,#famsel,.tb-label',tb).forEach(e=>e.style.display=FILTERED.has(id)?'':'none'); }
  const y=scrollY; pageEl.replaceChildren(); hideTip();
  try{ const pg=VIEWS[id](); if(typeof pageActions==='function'){ const pa=pageActions(id); if(pa){ const ln=pg.querySelector&&pg.querySelector('.lineage'); ln?pg.insertBefore(pa,ln):pg.append(pa); } } pageEl.append(pg); }catch(e){ console.error(e); pageEl.append(h('div',{class:'callout crit'},'This view failed to render: '+e.message)); }
  if(!render.first) scrollTo(0,0); render.first=false;
}
render.first=true;
function onHash(){ const id=location.hash.slice(1)||'exec'; if(!VIEWS[id]) return; current=id; render(); scrollTo(0,0); }
/* ---- command palette */
const cmdItems = ()=>[...APPS.map(a=>({t:a.t,s:'Open module '+a.n,run:()=>go(a.id)})),...D.actions.map(a=>({t:a.title,s:'Action · '+a.id,run:()=>go('decisions')})),...D.alerts.map(a=>({t:a.title,s:'Finding · '+a.id,run:()=>{store.set('focusAlert',a.id);go('warning');}})),...PRODUCTS.map((p,i)=>({t:p.name,s:'Product · '+p.sku,run:()=>{store.set('invProduct',i);go('inventory');}})),...D.procurement.suppliers.map(s=>({t:s.id+' · '+s.cat,s:'Supplier',run:()=>go('procurement')}))];
function openCmd(){
  if($('.cmdk')) return; const items=cmdItems(); let sel=0, list=items.slice(0,10);
  const inp=h('input',{type:'text',placeholder:'Jump to a module, finding, action, product or supplier…','aria-label':'Search'}); const ul=h('ul',{role:'listbox'}); const box=h('div',{class:'box'},inp,ul); const ov=h('div',{class:'cmdk',onclick:e=>{if(e.target===ov)close();}},box);
  const close=()=>{ov.remove();document.removeEventListener('keydown',kd,true);};
  const draw=()=>{ ul.replaceChildren(...list.map((it,i)=>h('li',{role:'option','aria-selected':i===sel,onclick:()=>{close();it.run();}},h('span',null,it.t),h('small',null,it.s)))); };
  inp.addEventListener('input',()=>{ const q=inp.value.toLowerCase().trim(); list=(q?items.filter(i=>(i.t+' '+i.s).toLowerCase().includes(q)):items).slice(0,10); sel=0; draw(); });
  const kd=e=>{ if(e.key==='Escape'){close();} else if(e.key==='ArrowDown'){sel=Math.min(list.length-1,sel+1);draw();e.preventDefault();} else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault();} else if(e.key==='Enter'&&list[sel]){close();list[sel].run();} };
  document.addEventListener('keydown',kd,true); document.body.append(ov); draw(); inp.focus();
}
document.addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCmd();} });
function boot(){
  const t=store.get('theme',null); if(t) document.documentElement.dataset.theme=t;
  buildRail(); main=h('main',{class:'main'}); pageEl=h('div',{class:'page',id:'page'}); main.append(buildTop(),pageEl);
  document.getElementById('root').replaceChildren(h('div',{class:'app'},rail,main));
  window.addEventListener('hashchange',onHash); onHash(); if(typeof initI18n==='function') initI18n();
}
