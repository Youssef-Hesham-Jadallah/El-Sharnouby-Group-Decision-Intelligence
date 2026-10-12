/* ===== Views A: Control Room, System Map, Early Warning, Data Trust ===== */
const ltmAll = ()=>qsum({from:24,to:35,ch:new Set(CH),family:'All'});
function chanTable(f){
  const g=group(f,r=>CH[r[1]]), pf=prevOf(f), gp=pf?group(pf,r=>CH[r[1]]):null, tot=sumRows([...g.values()].length?CB.filter(r=>inF(r,f)):[]);
  return [...g.entries()].map(([c,v])=>({c,net:v.ne,share:v.ne/tot.ne,gp:v.gp,gpshare:v.gp/tot.gp,gm:v.gm,disc:v.disc,ret:v.ret,units:v.q,yoy:gp&&gp.get(c)?v.ne/gp.get(c).ne-1:null}));
}
function priorityList(n=6){
  return D.alerts.filter(a=>a.kind!=='resolved').slice().sort((a,b)=>b.sev-a.sev).slice(0,n).map(a=>{
    const act=D.actions.find(x=>x.id===a.action);
    return h('div',{class:'alert s'+a.sev,style:{gap:'6px',padding:'12px 14px'}},h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},sevPill(a.sev),modChip(a.module),act&&act.high?h('span',{class:'tag measured'},'modelled '+(act.kind==='cash'?'cash ':'')+fmt.egp(act.low||0,1).replace('EGP ','')+'–'+fmt.egp(act.high,1).replace('EGP ','')):null),
      h('h4',{style:{fontSize:'15px'}},a.title),h('p',{class:'sig',style:{fontSize:'13px'}},a.signal),h('div',null,h('button',{class:'btn sm',onclick:()=>{store.set('focusAlert',a.id);go('warning');}},'See evidence →')));
  });
}
VIEWS.exec=()=>{
  const cur=qsum(), pf=prevOf(), prv=pf?qsum(pf):null, mon=monthly(F), ms=[...Array(F.to-F.from+1).keys()].map(i=>F.from+i);
  const lab=ms.map(fmt.mo), whole=group(F,r=>CH[r[1]]);
  const wsh=(whole.get('Wholesale')?.ne||0)/cur.ne, wgp=(whole.get('Wholesale')?.gp||0)/cur.gp;
  const act1=D.actions.slice().sort((a,b)=>b.score-a.score)[0];
  // forecast Oct-Dec 2026
  const ltmCh=group({from:24,to:35,ch:new Set(CH),family:'All'},r=>CH[r[1]]);
  const fcUnits={},fcNet={}; let fcN=0,fcU=0; CH.forEach(c=>{ const u=sum(D.forecast.fut[c].slice(0,3)); const px=ltmCh.get(c).ne/ltmCh.get(c).q; fcUnits[c]=u; fcNet[c]=u*px; fcN+=u*px; fcU+=u; });
  const lyNet=sum([24,25,26].map(i=>monthly({...F,ch:new Set(CH),family:'All'})[i].ne));
  const lyU=sum([24,25,26].map(i=>monthly({...F,ch:new Set(CH),family:'All'})[i].q));
  const lede=`In ${periodLabel()} the company sold <strong>${fmt.egp(cur.ne)}</strong> net${prv?` (${fmt.sp(cur.ne/prv.ne-1)} vs same months a year earlier)`:''} at a <strong>${fmt.p(cur.gm)}</strong> gross margin. `+
    `Wholesale is ${fmt.p(wsh,0)} of sales but only ${fmt.p(wgp,0)} of gross profit, so margin management matters more than volume.`;
  const wrap=h('div',{class:'page'});
  wrap.append(exCover(cur,prv,lede)); wrap.append(chainStrip());
  wrap.append(four({
    now:`<strong>${fmt.egp(cur.ne)}</strong> net sales, <strong>${fmt.egp(cur.gp)}</strong> gross profit, margin <strong>${fmt.p(cur.gm)}</strong>${prv?` (${fmt.pp(cur.gm-prv.gm)} YoY)`:''}.`,
    why:`Margin is set by discount depth: COGS is a near-constant share of list price in every channel. Wholesale sits at ${fmt.p(whole.get('Wholesale')?.gm||0)} while store and online run well above it.`,
    next:`Forecast for Oct–Dec 2026: <strong>${fmt.c(fcU,0)} units</strong>, about <strong>${fmt.egp(fcN)}</strong> net (${fmt.sp(fcN/lyNet-1)} vs last year). Backtest error on channel totals is shown in the Forecast view.`,
    do:`Largest lever: <strong>${act1.title.toLowerCase()}</strong>, worth up to ${fmt.egp(act1.high)} gross profit a year.`}));
  // KPIs
  const mk=(l,v,fv,cv,pv,o={})=>h('div',{class:'kpi'},h('span',{class:'l'},l),h('span',{class:'v'},fv),h('span',{class:'d'},prv?[deltaEl(cv,pv,o),'vs LY']:'no comparator'),sparkSvg(ms.map(i=>o.sv(mon[i])),{color:o.color||'var(--accent)'}));
  wrap.append(h('div',{class:'kpis'},
    mk('Net sales',cur.ne,fmt.egp(cur.ne),cur.ne,prv?.ne,{sv:m=>m.ne}),
    mk('Gross profit',cur.gp,fmt.egp(cur.gp),cur.gp,prv?.gp,{sv:m=>m.gp}),
    mk('Gross margin',cur.gm,fmt.p(cur.gm),cur.gm,prv?.gm,{pp:true,sv:m=>m.gm,color:'var(--c4)'}),
    mk('Units sold',cur.q,fmt.n(cur.q),cur.q,prv?.q,{sv:m=>m.q}),
    mk('Avg discount',cur.disc,fmt.p(cur.disc),cur.disc,prv?.disc,{pp:true,inv:true,sv:m=>m.disc,color:'var(--c-retail)'}),
    mk('Return rate (lines)',cur.ret,fmt.p(cur.ret),cur.ret,prv?.ret,{pp:true,inv:true,sv:m=>m.ret,color:'var(--crit)'})));
  // trend charts
  const series=CH.filter(c=>F.ch.has(c)).map(c=>({name:c,color:CHCOL[c],values:ms.map(i=>monthly({...F,ch:new Set([c])})[i].ne)}));
  const gmSeries=CH.filter(c=>F.ch.has(c)).map(c=>({name:c,color:CHCOL[c],values:ms.map(i=>monthly({...F,ch:new Set([c])})[i].gm)}));
  wrap.append(h('div',{class:'grid g2'},
    card('Net sales by channel','Monthly, after discount and before refunds',h('div',null,legend(series.map(s=>({name:s.name,color:s.color}))),chartBox(el=>colChart(el,{x:lab,series,stack:true,fmt:byFmt.c,h:250}))),{tag:'measured',tagClass:'measured'}),
    card('Gross margin by channel','Wholesale runs a third of the store margin',chartBox(el=>lineChart(el,{x:lab,series:gmSeries,fmt:byFmt.pct,h:250})),{tag:'measured',tagClass:'measured'})));
  // channel economics + bridge
  const ct=chanTable(F);
  const bridge = prv ? (()=>{ const b=gpBridge(pf,F); return chartBox(el=>waterfall(el,{steps:[{label:'GP prior yr',value:b.gpa,total:true},{label:'Volume',value:b.vol},{label:'Mix',value:b.mix},{label:'Price / discount',value:b.price},{label:'Unit cost',value:b.cost},{label:'GP now',value:b.gpb,total:true}],fmt:v=>fmt.c(v)})); })() : h('p',{class:'note'},'Pick a period with a full year of history to see the bridge.');
  wrap.append(h('div',{class:'grid g2'},
    card('Channel economics','Share of sales vs share of profit',table([{k:'c',label:'Channel',render:r=>h('span',null,h('i',{style:{display:'inline-block',width:'9px',height:'9px',borderRadius:'50%',background:CHCOL[r.c],marginRight:'7px'}}),r.c)},{k:'net',label:'Net sales',num:true,fmt:v=>fmt.egp(v)},{k:'share',label:'% sales',num:true,fmt:v=>fmt.p(v,0)},{k:'gpshare',label:'% profit',num:true,fmt:v=>fmt.p(v,0)},{k:'gm',label:'Margin',num:true,fmt:v=>fmt.p(v)},{k:'disc',label:'Discount',num:true,fmt:v=>fmt.p(v)},{k:'yoy',label:'YoY',num:true,fmt:v=>v==null?'–':fmt.sp(v)}],ct,{sortable:false}),{tag:'measured',tagClass:'measured'}),
    card('What moved gross profit?','Volume, mix, price/discount and unit cost vs the same months last year',bridge,{tag:'arithmetic',tagClass:'measured'})));
  // forecast panel
  const fx=[...MONTHS.map((_,i)=>fmt.mo(i)),...D.forecast.meta.months_future.map(m=>{const [y,mm]=m.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mm-1]+" '"+y.slice(2)})];
  const mkF=(chs,title,sub)=>{ const ss=chs.filter(c=>F.ch.has(c)).flatMap(c=>[{name:c+' actual',color:CHCOL[c],values:[...D.forecast.hist[c],...Array(6).fill(null)]},{name:c+' forecast',color:CHCOL[c],dash:'5 4',values:[...Array(35).fill(null),D.forecast.hist[c][35],...D.forecast.fut[c]]}]); return card(title,sub,h('div',null,legend([...chs.map(c=>({name:c,color:CHCOL[c]})),{name:'forecast (dashed)',color:'var(--ink-3)'}]),chartBox(el=>lineChart(el,{x:fx,series:ss,fmt:byFmt.c,h:230,zero:true,xticks:8,marks:[{i:35.5,label:'forecast →'}]}))),{tag:'model',tagClass:'model'}); };
  wrap.append(h('div',{class:'grid g2'},mkF(['Wholesale'],'Wholesale demand, units per month','Dashed = forecast to Mar 2027'),mkF(['Online','Retail'],'Online and store demand, units per month','Seasonal pattern repeats; online grows faster')));
  const bt=D.forecast.meta.results; const best=D.forecast.meta.best;
  wrap.append(card('How reliable is the forecast?','Rolling-origin backtest, 10 origins × 3 months, product × channel',h('div',null,h('div',{class:'stat-row'},...CH.map(c=>h('div',null,h('b',null,fmt.p(bt[best[c]][c].wape_total,1)),h('span',null,c+' total error'))),h('div',null,h('b',null,fmt.p(bt.ma12.All.wape_total,0)),h('span',null,'flat-average baseline'))),h('p',{class:'note',style:{marginTop:'10px'}},`Method: ${D.forecast.meta.labels[best.Wholesale]}. Per-SKU error is higher (${fmt.p(bt[best.Online].Online.wape_sku,0)}–${fmt.p(bt[best.Wholesale].Wholesale.wape_sku,0)}), so channel totals are trusted more than single-SKU numbers. `),h('button',{class:'btn sm',onclick:()=>go('trust')},'Model scorecard →')),{tag:'model',tagClass:'model'}));
  // priority + pulse
  wrap.append(section('What needs attention','Ranked by severity; every item links to its evidence'));
  wrap.append(h('div',{class:'grid g2'},...[priorityList(6).slice(0,3),priorityList(6).slice(3,6)].map(col=>h('div',{style:{display:'flex',flexDirection:'column',gap:'12px'}},col))));
  const inv=D.inventory.summary, P=D.procurement.totals, Fa=D.factory, Q=D.quality.copq, Mk=D.marketing.recon, Cu=D.customers.head;
  const tile=(l,v,s,to,cls)=>h('button',{class:'kpi',style:{textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'},onclick:()=>go(to)},h('span',{class:'l'},l),h('span',{class:'v'},v),h('span',{class:'d'},s));
  wrap.append(section('Operations pulse','Latest snapshot from the connected modules'));
  wrap.append(h('div',{class:'kpis'},
    tile('Wholesale stock cover',fmt.n(inv.by_loc.Wholesale.cover_med,0)+' days',`Store ${fmt.n(inv.by_loc.Store.cover_med,0)} d · Online ${fmt.n(inv.by_loc.Online.cover_med,0)} d`,'inventory'),
    tile('Excess stock',fmt.egp(inv.excess_value),`${fmt.n(inv.excess_units)} units above 120 days`,'rebalance'),
    tile('Late production orders',fmt.p(Fa.ltm.late),`prior 12m ${fmt.p(Fa.prior.late)} · efficiency ${fmt.n(Fa.ltm.eff,1)}%`,'factory'),
    tile('Supplier on-time',fmt.p(P.ontime),'two suppliers well below peers','procurement'),
    tile('Cost of poor quality (LTM)',fmt.egp(Q.qc_loss+Q.print_rework+Q.quality_refunds,1),'measured; up to '+fmt.egp(Q.total,1)+' incl. rejects','quality'),
    tile('Marketing efficiency (MER)',fmt.x(Mk.mer),`platforms claim ${fmt.x(Mk.reported_roas)}`,'marketing'),
    tile('Repeat buyers (retail)',fmt.p(Cu.repeat_retail,0),`${fmt.n(Cu.retail_buyers)} buyers · ${fmt.p(Cu.consent,0)} opted in`,'customers'),
    tile('Open modelled upside',fmt.egp(sum(D.actions.filter(a=>a.kind==='profit').map(a=>a.high||0))),`profit actions, upper bound / yr`,'decisions')));
  // products
  const gp=group(F,r=>r[2]), gpP=pf?group(pf,r=>r[2]):null;
  const prow=[...gp.entries()].map(([i,v])=>({i,name:prodName(i),fam:FAMILY[i],net:v.ne,gp:v.gp,gm:v.gm,disc:v.disc,yoy:gpP&&gpP.get(i)?v.ne/gpP.get(i).ne-1:null}));
  const fam=group(F,r=>FAMILY[r[2]]);
  wrap.append(h('div',{class:'grid g12'},
    card('Product families','Net sales and margin',chartBox(el=>barChart(el,{items:[...fam.entries()].sort((a,b)=>b[1].ne-a[1].ne).map(([f,v])=>({label:f,value:v.ne,text:fmt.egp(v.ne,1)+' · '+fmt.p(v.gm,0),tip:tipRows(f,[['Net sales',fmt.egp(v.ne)],['Gross margin',fmt.p(v.gm)],['Units',fmt.n(v.q)]])})),fmt:v=>fmt.c(v),labelW:130,rightW:130}))),
    card('Products','Click a header to sort; catalogue products',table([{k:'name',label:'Product',wrap:true},{k:'fam',label:'Family'},{k:'net',label:'Net sales',num:true,bar:true,fmt:v=>fmt.egp(v,1)},{k:'gm',label:'Margin',num:true,fmt:v=>fmt.p(v),barColor:'var(--c4)'},{k:'disc',label:'Disc.',num:true,fmt:v=>fmt.p(v,0)},{k:'yoy',label:'YoY',num:true,fmt:v=>v==null?'–':fmt.sp(v,0)}],prow.sort((a,b)=>b.net-a.net),{max:10,onrow:r=>{store.set('invProduct',r.i);go('inventory');}}))));
  // governorates
  const gg=group(F,r=>r[2]*0+0); // placeholder to keep API simple
  const gvals={}; const gm={}; for(const r of D.gcube.rows){ if(r[0]<F.from||r[0]>F.to||!F.ch.has(CH[r[1]])||r[1]===2) continue; const g=M.governorates[r[2]]; gvals[g]=(gvals[g]||0)+r[3]; }
  wrap.append(card('Where D2C customers live','Retail + online net sales by customer governorate (schematic tile map, not to scale)',chartBox(el=>tileMap(el,{values:gvals,fmt:v=>fmt.c(v)})),{tag:'measured',tagClass:'measured'}));
  wrap.append(lineage({tables:'Sales · Inventory · Production · Purchasing · Quality · Marketing',from:['profit','inventory','customers','marketing','factory','procurement','quality'],to:['whatif','decisions'],note:'Net sales are after discount and before refunds.'}));
  return wrap;
};
/* ---------- System map */
VIEWS.map=()=>{
  const nodes=[
    {id:'customers',x:90,y:80},{id:'marketing',x:90,y:200},{id:'channels',x:90,y:320},
    {id:'inventory',x:330,y:80},{id:'rebalance',x:330,y:200},{id:'factory',x:330,y:320},
    {id:'procurement',x:570,y:320},{id:'quality',x:570,y:200},{id:'profit',x:570,y:80},{id:'discount',x:570,y:-10+0},
    {id:'whatif',x:810,y:140},{id:'warning',x:810,y:260},{id:'exec',x:1050,y:140},{id:'decisions',x:1050,y:260}];
  nodes.find(n=>n.id==='discount').y=10; nodes.find(n=>n.id==='profit').y=100;
  const edges=[['customers','marketing','segments → audiences'],['marketing','inventory','campaign demand lift'],['customers','inventory','repeat demand'],['channels','rebalance','channel demand'],['inventory','rebalance','stock by location'],['inventory','factory','replenishment need'],['factory','procurement','material need (BOM)'],['procurement','factory','lead time & risk'],['factory','quality','rejects'],['quality','profit','returns & cost'],['discount','profit','discount depth'],['channels','profit','channel margin'],['procurement','profit','material cost'],['profit','whatif','margin model'],['inventory','whatif','stock & forecast'],['procurement','whatif','supplier risk'],['marketing','whatif','response curves'],['factory','warning','delay signals'],['quality','warning','defect signals'],['inventory','warning','stock-outs'],['discount','warning','discount drift'],['whatif','decisions','scenario → decision'],['warning','decisions','finding → action'],['warning','exec','priority queue'],['decisions','exec','tracked impact']];
  const P=Object.fromEntries(nodes.map(n=>[n.id,n])); let g='';
  edges.forEach(([a,b,l],i)=>{ const A=P[a],B=P[b],x1=A.x+80,y1=A.y+22,x2=B.x,y2=B.y+22, mx=(x1+x2)/2; const bw=x2<x1; g+=`<path class="ed" data-i="${i}" d="M${bw?A.x:x1} ${y1} C${bw?A.x-60:mx} ${y1}, ${bw?B.x+140:mx} ${y2}, ${bw?B.x+80:x2} ${y2}" fill="none" stroke="var(--line)" stroke-width="1.6"/><path d="M${bw?A.x:x1} ${y1} C${bw?A.x-60:mx} ${y1}, ${bw?B.x+140:mx} ${y2}, ${bw?B.x+80:x2} ${y2}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="2 7" opacity=".7"/>`; });
  nodes.forEach(n=>{ const a=APPBYID[n.id], s=MODSEV[MODMAP[n.id]]||0, col=s>=4?'var(--crit)':s>=3?'var(--warn)':s>=2?'var(--info)':'var(--good)';
    g+=`<g class="nd" data-id="${n.id}" style="cursor:pointer"><rect x="${n.x}" y="${n.y}" width="160" height="44" rx="12" fill="var(--surface)" stroke="var(--line)"/><circle cx="${n.x+16}" cy="${n.y+22}" r="6" fill="${col}"/><text x="${n.x+30}" y="${n.y+19}" style="fill:var(--ink);font-weight:600;font-size:12px">${esc(a.t.length>21?a.t.slice(0,20)+'…':a.t)}</text><text x="${n.x+30}" y="${n.y+34}" class="mono" style="font-size:9.5px">APP ${a.n}</text></g>`; });
  const cols=[['SENSE',90],['CONNECT',330],['EXPLAIN',570],['DECIDE',810],['LEARN',1050]]; cols.forEach(([t,x])=>g+=`<text x="${x}" y="-16" class="mono" style="letter-spacing:.14em;font-size:10px">${t}</text>`);
  const wrap=h('div',{class:'page'}); wrap.append(pageHead('map','One decision cycle, fourteen modules','Each module reads what the others publish and passes on its own result. Hover a thread to see what travels along it.'));
  const box=h('div',{class:'chart scroll-x'}); box.innerHTML=`<svg viewBox="-10 -30 1240 410" style="min-width:880px">${g}</svg>`; 
  $$('.nd',box).forEach(n=>n.addEventListener('click',()=>go(n.dataset.id))); $$('.ed',box).forEach(e=>{const [a,b,l]=edges[+e.dataset.i]; e.style.cursor='help'; e.setAttribute('stroke-width',8); e.setAttribute('stroke','transparent'); e.addEventListener('mousemove',ev=>showTip(ev,`<b>${APPBYID[a].t} → ${APPBYID[b].t}</b><div>${l}</div>`)); e.addEventListener('mouseleave',hideTip);});
  wrap.append(card('Signal flow','Dot colour = highest open finding in the module. Click a node to open it.',box));
  wrap.append(h('div',{class:'grid g2'},
    card('Worked example: demand rises on one product','The same event passes through four checks before a recommendation is made (see What-If → Decision Chain).',h('ol',{class:'hyp',style:{listStyle:'decimal',paddingLeft:'18px',display:'block'}},
      ...['Marketing or customers show a demand lift for a product.','Inventory compares the lift with stock in each location and its forecast.','Rebalancing checks whether another location holds surplus of the same product.','Factory and Procurement check capacity, bill of materials, lead time and supplier lateness.','The simulator compares four policies and the Decision Log records the choice and the outcome.'].map(t=>h('li',{style:{display:'list-item',marginBottom:'6px'}},t)))),
    card('What the modules share','Every number comes from one cube so apps never disagree',h('ul',{class:'hyp'},...[['Sales cube','month × channel × product cube. Drives apps 01, 06, 10, 12, 14.'],['Forecast','product × channel, 6 months ahead. Drives apps 02, 07, 08, 11.'],['Inventory snapshot','products × locations, latest month. Drives 02, 11, 08.'],['Findings and actions','13 findings, 10 actions. Drive 01, 09, 13.']].map(([a,b])=>h('li',null,h('span',{class:'cls arith'},a),h('span',null,b)))))));
  return wrap;
};
/* ---------- Early warning & RCA */
VIEWS.warning=()=>{
  const wrap=h('div',{class:'page'}); const foc=store.get('focusAlert',null);
  const al=D.alerts.slice().sort((a,b)=>b.sev-a.sev); const sig=D.signals;
  const open=al.filter(a=>a.kind!=='resolved').length;
  wrap.append(pageHead('warning','What changed, and what might explain it',`${open} open findings and ${sig.length} statistical signals. Each one separates <strong>arithmetic</strong> (an identity), <strong>correlation</strong> (moves together), <strong>plausible cause</strong> (needs checking) and <strong>unknown</strong>. Nothing here is marked as a proven cause unless it is arithmetic.`));
  wrap.append(four({now:`<strong>${al.filter(a=>a.sev>=3).length}</strong> high or critical findings; the statistical detector flags online discounting and margin.`,why:'Each finding lists its measured evidence and ranks its explanations by how strong the support is.',next:'Unresolved findings carry on until an owner acts; the Decision Log tracks each one to an outcome.',do:'Open a finding, check the investigation steps, then send it to the Decision Log.'}));
  const clsName={arith:'Arithmetic',plaus:'Plausible',corr:'Correlated',unk:'Unknown',ruled:'Ruled out'};
  const sparkOf=a=>{ if(!a.spark) return null; const v=D.series[a.spark.key]; if(!v) return null; const x=MONTHS.map((_,i)=>fmt.mo(i)); return chartBox(el=>lineChart(el,{x,series:[{name:a.spark.label,values:v,color:'var(--accent)',area:true}],fmt:byFmt[a.spark.fmt]||byFmt.num,h:150,xticks:6})); };
  const list=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  al.forEach(a=>{ const act=D.actions.find(x=>x.id===a.action);
    const el=h('article',{class:'alert s'+a.sev,id:'al-'+a.id},
      h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},sevPill(a.sev),h('span',{class:'tag'},a.id),modChip(a.module),h('span',{class:'tag '+(a.kind==='structural'?'measured':'model')},a.kind),h('span',{class:'tag'},'confidence '+a.conf)),
      h('h4',null,a.title),h('p',{class:'sig'},a.signal),
      h('div',{class:'grid g2'},h('div',{style:{display:'flex',flexDirection:'column',gap:'10px'}},h('div',{class:'lab',style:{fontFamily:'var(--f-mono)',fontSize:'10.5px',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)'}},'Evidence'),h('dl',{class:'ev'},a.evidence.map(e=>[h('dt',null,e.k),h('dd',null,e.v)]))),sparkOf(a)||h('div')),
      h('div',null,h('div',{class:'lab',style:{fontFamily:'var(--f-mono)',fontSize:'10.5px',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',marginBottom:'6px'}},'Possible explanations, strongest first'),h('ul',{class:'hyp'},a.hyp.map(x=>h('li',null,h('span',{class:'cls '+x.cls},clsName[x.cls]),h('span',null,x.t))))),
      h('details',null,h('summary',{style:{cursor:'pointer',fontSize:'13px',color:'var(--accent)'}},'Investigation steps'),h('ol',{style:{margin:'8px 0 0',paddingLeft:'20px',fontSize:'13px'}},a.steps.map(s=>h('li',null,s)))),
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},act?h('button',{class:'btn primary sm',onclick:()=>{store.set('focusAct',act.id);go('decisions');}},'Open action '+act.id+' →'):null,
        a.module==='discount'?h('button',{class:'btn sm',onclick:()=>go('discount')},'Open Discount Discipline'):null,a.module==='inventory'?h('button',{class:'btn sm',onclick:()=>go('rebalance')},'Open Rebalancing'):null));
    list.append(el); });
  // statistical signals
  const sg=card('Statistical signals','Robust z-score of the last 3 months vs the prior 12, plus a 6-month level-shift test. Seasonal sales use year-on-year change.',
    table([{k:'name',label:'Metric',wrap:true},{k:'sev',label:'Severity',render:r=>sevPill(r.sev)},{k:'base',label:'Baseline',num:true,fmt:(v,r)=>r.unit==='pct'?fmt.p(v,1):fmt.n(v,2)},{k:'recent',label:'Last 3 mo',num:true,fmt:(v,r)=>r.unit==='pct'?fmt.p(v,1):fmt.n(v,2)},{k:'z3',label:'z',num:true,fmt:v=>fmt.n(v,1)},{k:'sp',label:'Trend',render:r=>sparkSvg(r.series.slice(-24),{w:110,h:26,color:'var(--warn)'})}],sig.map(s=>({...s,sp:1})),{sortable:false}),{tag:'model',tagClass:'model'});
  wrap.append(sg,section('Findings','Structural findings are always-on conditions; statistical findings are changes against recent history'),list);
  wrap.append(lineage({tables:'Sales · Inventory · Production · Downtime · Purchasing · Quality · Marketing · Web traffic',from:['exec','inventory','factory','procurement','quality','marketing','discount'],to:['decisions','exec']}));
  if(foc) setTimeout(()=>{ const e=document.getElementById('al-'+foc); if(e){e.scrollIntoView({block:'start'}); e.style.outline='2px solid var(--accent)';} store.set('focusAlert',null); },60);
  return wrap;
};
/* ---------- Data trust */
VIEWS.trust=()=>{
  const dq=D.dq, wrap=h('div',{class:'page'}); const fc=D.forecast.meta, ch=D.customers.churn, el=D.discount_gov.elasticity;
  wrap.append(pageHead('trust','What the data can and cannot support',`Coverage, reconciliation checks and known gaps. <strong>Absolute EGP figures should be validated against the ledger</strong> before anyone acts on them.`));
  wrap.append(four({now:`${dq.checks.filter(c=>c.s==='pass').length} checks pass, ${dq.checks.filter(c=>c.s==='warn').length} need care, ${dq.checks.filter(c=>c.s==='fail').length} fails (marketing attribution).`,why:'Tables were generated separately, so some do not reconcile (production vs sales, purchases vs BOM, attributed vs actual revenue).',next:'Conclusions that depend on a failed or warned check are marked provisional inside each module.',do:'Close the reconciliation gaps listed here before using any module for budgeting.'}));
  wrap.append(card('Integrity checks','Run on every build of the data',h('div',{style:{display:'flex',flexDirection:'column',gap:'10px'}},dq.checks.map(c=>h('div',{style:{display:'grid',gridTemplateColumns:'74px 1fr',gap:'12px',alignItems:'start'}},pill({pass:'Pass',warn:'Check',fail:'Fail'}[c.s],{pass:'good',warn:'warn',fail:'crit'}[c.s]),h('div',null,h('b',null,c.t),h('div',{style:{color:'var(--ink-2)',fontSize:'13px'}},c.d)))))));
  wrap.append(card('Data tables','Rows and columns',table([{k:'t',label:'Table'},{k:'rows',label:'Rows',num:true,fmt:v=>fmt.n(v)},{k:'cols',label:'Cols',num:true}],dq.tables,{max:20})));
  const rs=fc.results;
  wrap.append(section('Model scorecards','Every model reports error against a naive baseline and says whether it is deployed'));
  wrap.append(h('div',{class:'grid g3'},
    card('Demand forecast','Rolling-origin backtest, 3-month horizon',h('div',null,table([{k:'m',label:'Method'},{k:'sku',label:'Per-SKU error',num:true,fmt:v=>fmt.p(v,0)},{k:'tot',label:'Channel-total error',num:true,fmt:v=>fmt.p(v,1)},{k:'bias',label:'Bias',num:true,fmt:v=>fmt.sp(v,1)}],Object.keys(rs).map(k=>({m:fc.labels[k]+(k===fc.best.Wholesale?' ✓':''),sku:rs[k].All.wape_sku,tot:rs[k].All.wape_total,bias:rs[k].All.bias})),{sortable:false}),h('p',{class:'note',style:{marginTop:'10px'}},'Deployed: seasonal-naive × growth, because it beats a flat average by a wide margin. Intervals come from pooled backtest ratios.')),{tag:'deployed',tagClass:'model'}),
    card('Customer churn model','Gradient boosting, trained on Sep-2025 data, tested on Mar-2026',h('div',null,h('div',{class:'stat-row'},h('div',null,h('b',null,ch.auc),h('span',null,'AUC overall')),h('div',null,h('b',null,ch.auc_retail),h('span',null,'AUC retail')),h('div',null,h('b',null,ch.auc_recency),h('span',null,'recency alone'))),h('p',{class:'note warn',style:{marginTop:'10px'}},ch.verdict)),{tag:'not deployed',tagClass:'inferred'}),
    card('Price response','Fixed-effects regression of units on discount depth (product & month effects)',h('div',null,table([{k:'channel',label:'Channel'},{k:'b',label:'Per 1 pp',num:true,fmt:v=>fmt.sp(v,2)},{k:'ci',label:'95% interval',num:true}],el.map(e=>({channel:e.channel,b:e.beta,ci:fmt.sp(e.lo,1)+' to '+fmt.sp(e.hi,1)})),{sortable:false}),h('p',{class:'note',style:{marginTop:'10px'}},'Units do not respond measurably to deeper discounts in any channel. Used as an assumption range, not as a promise.')),{tag:'used',tagClass:'model'})));
  wrap.append(card('Definitions used everywhere','One definition per metric so modules never disagree',h('dl',{class:'ev',style:{gridTemplateColumns:'220px 1fr'}},...[['Net sales','Gross sales × (1 − discount). Before refunds.'],['Gross profit','Net sales − estimated COGS (as provided). Before refunds.'],['Gross margin','Gross profit ÷ net sales.'],['Refund-adjusted view','Shown only as a sensitivity: refunds deducted, goods assumed not resold.'],['LTM','Last twelve months: Oct 2025 – Sep 2026. Prior = Oct 2024 – Sep 2025.'],['On-time (supplier)','Actual receipt on or before promised date.'],['Days of cover','Stock ÷ forecast daily demand (Oct–Dec 2026), not the 90-day trailing average.'],['MER','D2C net sales ÷ total marketing spend. Does not depend on attribution.'],['COPQ','QC loss + print rework + quality-related refunds; production rejects shown separately because they may overlap QC loss.']].flatMap(([a,b])=>[h('dt',null,a),h('dd',{style:{fontWeight:400}},b)]))));
  wrap.append(lineage({tables:'All tables',from:[],to:['exec'],note:'Where the data cannot support a conclusion, the module says so rather than estimating it.'}));
  return wrap;
};
