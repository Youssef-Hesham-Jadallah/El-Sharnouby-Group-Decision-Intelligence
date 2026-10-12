/* ===== Views H: cover, business chain, decision chain & board (project identity) ===== */
function exCover(cur,prv,lede){
  const log=store.get('actionLog',{}); const prof=D.actions.filter(a=>a.kind==='profit');
  const g=prv?cur.ne/prv.ne-1:null; const open=D.actions.filter(a=>!['Done','Rejected'].includes((log[a.id]||{}).status||'Proposed')).length;
  const hi=D.alerts.filter(a=>a.sev>=3).length;
  const head=g!=null?`Sales ${g>=0?'grew':'fell'} ${fmt.p(Math.abs(g),1)}, margin held at ${fmt.p(cur.gm,1)} — and the biggest profit lever is the wholesale <em>discount grid</em>.`:`Margin sits at ${fmt.p(cur.gm,1)} — and the biggest profit lever is the wholesale <em>discount grid</em>.`;
  const stat=(l,v,d,hot)=>h('div',{class:'stat'+(hot?' hot':'')},h('span',{class:'l'},l),h('span',{class:'v'},v),h('span',{class:'d'},d));
  return h('section',{class:'cover'},
    h('div',null,
      h('div',{class:'seal'},h('div',null,h('div',{class:'eyebrow'},'Control Room · data to '+fmt.moFull(35)),h('div',{style:{fontSize:'13px',color:'#BFAFCB'}},'El-Sharnouby Group · '+periodLabel()))),
      h('h1',{html:head}),
      h('p',{class:'lede',html:lede}),
      h('div',{class:'ctas'},h('button',{class:'btn primary',onclick:()=>go('briefing')},'See insights & decisions'),h('button',{class:'btn',onclick:()=>go('whatif')},'Test a decision'),h('button',{class:'btn',onclick:()=>go('warning')},'Why it is happening'))),
    h('div',{class:'stats'},
      stat('Net sales',fmt.egp(cur.ne),prv?[deltaEl(cur.ne,prv.ne),' vs last year']:'selected period'),
      stat('Gross profit',fmt.egp(cur.gp),fmt.p(cur.gm,1)+' margin'+(prv?' · '+fmt.pp(cur.gm-prv.gm):'')),
      stat('Profit in play',h('span',{class:'nt',dir:'ltr'},(isAR()?'':'EGP ')+(sum(prof.map(a=>a.low))/1e6).toFixed(1)+'–'+(sum(prof.map(a=>a.high))/1e6).toFixed(1)+(isAR()?' مليون ج.م':'M')),prof.length+' profit actions, per year',true),
      stat('Decisions open',String(open),hi+' high-severity findings behind them')));
}
function chainStrip(){
  const Pr=D.procurement.totals, Fa=D.factory.ltm, Q=D.quality.copq, I=D.inventory.rows, M=D.marketing.recon, C=D.customers, T=qsum({from:24,to:35,ch:new Set(CH),family:'All'});
  const risk=I.filter(x=>x.status==='Stockout risk').length; const whole=group({from:24,to:35,ch:new Set(CH),family:'All'},r=>CH[r[1]]).get('Wholesale');
  const nodes=[
    {id:'procurement',m:'procurement',nm:'Suppliers',mv:fmt.p(Pr.ontime,0),ds:'orders arrive on time'},
    {id:'factory',m:'factory',nm:'Factory',mv:fmt.p(Fa.late,0),ds:'orders finish late'},
    {id:'quality',m:'quality',nm:'Quality',mv:fmt.p(Q.total/Q.ltm_net,1),ds:'of sales lost to poor quality'},
    {id:'inventory',m:'inventory',nm:'Stock',mv:fmt.n(risk),ds:'SKU-locations near stock-out'},
    {id:'channels',m:'exec',nm:'Channels',mv:fmt.p(whole.ne/T.ne,0),ds:'of sales are wholesale'},
    {id:'marketing',m:'marketing',nm:'Marketing',mv:fmt.x(M.ratio_rev,1),ds:'claimed vs actual sales'},
    {id:'customers',m:'customers',nm:'Customers',mv:fmt.n(C.lapse_tot.Wholesale.n),ds:'lapsed wholesale accounts'},
    {id:'discount',m:'discount',nm:'Profit',mv:fmt.p(T.gp/T.ne,1),ds:'gross margin'}];
  return h('section',{class:'chainstrip','aria-label':'Business chain'},
    h('div',{class:'ch',style:{marginBottom:'14px'}},h('div',null,h('h3',null,'The chain, from suppliers to profit'),h('div',{class:'sub'},'One health reading per link. The colour is the highest open finding on that link; click to open its evidence.')),h('span',{class:'tag measured'},'live from data')),
    h('div',{class:'chain'},...nodes.map(n=>{ const s=MODSEV[n.m]||0; return h('button',{class:'cnode s'+s,onclick:()=>go(n.id)},h('span',{class:'bd'}),h('span',{class:'nm'},n.nm),h('span',{class:'mv'},n.mv),h('span',{class:'ds'},n.ds)); })));
}
/* decision chain: Signal -> Why -> Action -> Owner/Due -> KPI target */
function decisionChain(f,a,lg){
  const st=lg.status||'Proposed'; const k=a.kpi; const fv=v=>k.fmt==='pct'?fmt.p(v,1):k.fmt==='egp'?fmt.egp(v):fmt.n(v,1);
  const stage={Proposed:1,Approved:2,'In progress':3,Done:5,Rejected:0}[st]??1;
  const step=(i,kk,t)=>h('div',{class:'dstep'+(stage>i?' done':stage===i?' on':'')},h('span',{class:'bd'}),h('span',{class:'k'},kk),h('span',{class:'t'},t));
  return h('div',{class:'dchain'},
    step(0,'Signal',f.signal.length>70?f.signal.slice(0,68)+'…':f.signal),
    step(1,'Decision',a.title.length>64?a.title.slice(0,62)+'…':a.title),
    step(2,'Owner',(lg.owner||a.owner)),
    step(3,'Due',dueOf(a,lg)+' · '+a.horizon),
    step(4,'KPI',k.name+': '+fv(k.base)+' → '+fv(k.target)));
}
/* Kanban board of actions */
function decisionBoard(onChange){
  const log=store.get('actionLog',{}); const cols=['Proposed','Approved','In progress','Done'];
  const byCol=Object.fromEntries(cols.map(c=>[c,[]])); D.actions.forEach(a=>{ const st=(log[a.id]||{}).status||'Proposed'; if(byCol[st]) byCol[st].push(a); });
  return h('div',{class:'board'},...cols.map(c=>h('div',{class:'bcol'},h('h4',null,h('span',null,c),h('b',null,String(byCol[c].length))),
    ...byCol[c].sort((x,y)=>y.score-x.score).map(a=>{ const f=D.alerts.find(x=>x.id===a.finding); const lg=log[a.id]=log[a.id]||{status:'Proposed'};
      const sel=h('select',{'aria-label':'Move '+a.id,onchange:e=>{ lg.status=e.target.value; store.set('actionLog',log); onChange&&onChange(); }},['Proposed','Approved','In progress','Done','Rejected'].map(x=>h('option',{value:x,selected:x===c},x)));
      return h('div',{class:'bcard s'+f.sev},h('b',null,a.id+' · '+a.title),h('div',{class:'m'},h('span',null,a.owner),h('span',null,valueText(a))),h('div',{class:'m'},h('span',null,'Due '+dueOf(a,lg)),sel)); }),
    byCol[c].length?null:h('p',{class:'sub',style:{margin:0,textAlign:'center'}},'Nothing here yet'))));
}
