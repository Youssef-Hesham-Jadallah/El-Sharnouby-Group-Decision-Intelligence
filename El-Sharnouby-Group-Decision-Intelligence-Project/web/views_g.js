/* ===== Views G: Demand vs Capacity Planner (app 15) and Ask the data =====
   Both pages are computed from the loaded data (D). Nothing here is typed-in or simulated.
   Built on the project's own forecast, BOM and supplier tables. */
const MN_ = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mlab_ = ym => { const [y,m]=ym.split('-'); return MN_[+m-1]+' '+y; };
const FUTM_ = D.forecast.meta.months_future;
const fcTot_ = () => FUTM_.map((_,i)=>sum(CH.map(c=>D.forecast.fut[c][i])));
const lyTot_ = ym => { const [y,m]=ym.split('-'); const k=MONTHS.indexOf((+y-1)+'-'+m); return k<0?null:sum(CH.map(c=>D.forecast.hist[c][k])); };
function plannerFacts_(){
  const fc=fcTot_(), f3=sum(fc.slice(0,3)), ly3=sum(FUTM_.slice(0,3).map(lyTot_)); const pk=fc.indexOf(Math.max(...fc.slice(0,3)));
  const np=D.factory.nameplate.hub_per_day*30, ratio=D.factory.good_total/D.factory.sold_total;
  const mats=D.procurement.materials, ltMax=Math.max(...mats.map(m=>m.lt_p90));
  return {fc,f3,ly3,pk,np,ratio,ltMax,late:D.factory.ltm.late,peak:fc[pk],peakLy:lyTot_(FUTM_[pk]),mats};
}
function orderBy_(m,basis,needYM){
  const lead=Math.ceil(basis==='std'?m.std_lt:basis==='avg'?m.lt:m.lt_p90); const nd=new Date(needYM+'-01T00:00:00'); const ob=new Date(nd); ob.setDate(ob.getDate()-lead);
  const asOf=new Date(D.meta.as_of+'T00:00:00'); return {lead,date:ob.toISOString().slice(0,10),left:Math.round((ob-asOf)/864e5)};
}

VIEWS.planner=()=>{
  const wrap=h('div',{class:'page'}); const X=plannerFacts_();
  const st=Object.assign({need:X.pk,basis:'p90'},store.get('plannerP',{})); if(!(st.need>=0&&st.need<FUTM_.length)) st.need=X.pk;
  const save=()=>store.set('plannerP',st);
  wrap.append(pageHead('planner','Can we make, and get materials for, what we expect to sell?',`A demand forecast turned into bill-of-material needs and compared with supplier lead times. <strong>Forecast</strong> comes from the 36-month sales history; <strong>lead times</strong> come from past purchase orders; the hub capacity is the <strong>published</strong> figure, not a measurement.`));
  wrap.append(four({
    now:`Forecast demand for the next three months is <strong>${fmt.n(X.f3)} units</strong> (${fmt.sp(X.f3/X.ly3-1)} vs the same months last year), peaking in <strong>${mlab_(FUTM_[X.pk])}</strong> at ${fmt.n(X.peak)} units.`,
    why:`Peak-month demand uses <strong>${fmt.p(X.peak/X.np,0)}</strong> of the published hub capacity, so machine hours are not what limits the peak. What limits it is timing: materials take up to <strong>${X.ltMax} days</strong> at the 90th percentile and <strong>${fmt.p(X.late,0)}</strong> of production orders already finish late.`,
    next:`Each material has an order-by date that depends on the month you need it and the lead-time basis you trust. Pick them below; the table sorts by urgency.`,
    do:`Check open purchase orders first (they are not in the data), then order the slowest materials. See ACT-13.`}));
  const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  const needSel=h('select',{id:'pl-need','aria-label':'Need-by month',onchange:e=>{st.need=+e.target.value;save();draw();}},FUTM_.slice(0,6).map((ym,i)=>h('option',{value:i,selected:i===st.need},mlab_(ym))));
  const basisSel=h('select',{id:'pl-basis','aria-label':'Lead-time basis',onchange:e=>{st.basis=e.target.value;save();draw();}},[['std','Standard lead time (supplier terms)'],['avg','Average observed lead time'],['p90','90th percentile observed (plan to this)']].map(([v,l])=>h('option',{value:v,selected:v===st.basis},l)));
  wrap.append(card('Controls','Which month the materials are needed, and which lead time to plan to',h('div',{class:'grid g3'},h('div',{class:'field'},h('label',{for:'pl-need'},'Need materials by'),needSel),h('div',{class:'field'},h('label',{for:'pl-basis'},'Lead-time basis'),basisSel)),{tag:'assumptions',tagClass:'assump'}),out);
  function draw(){
    const rows=X.mats.map(m=>{ const o=orderBy_(m,st.basis,FUTM_[st.need]); const noBom=m.need90==null;
      return {id:m.id,name:m.name,unit:m.unit,need:m.need90,lead:o.lead,date:o.date,left:o.left,noBom,sup:m.suppliers,ont:m.ontime}; }).sort((a,b)=>a.left-b.left);
    const passed=rows.filter(r=>r.left<0).length;
    const stat=r=>r.left<0?pill(`${-r.left} d past due`,'s4'):r.left<14?pill(`in ${r.left} d`,'s3'):pill(`in ${r.left} d`,'s1');
    out.replaceChildren(
      h('div',{class:'kpis'},
        K('Forecast, next 3 months',fmt.n(X.f3)+' units',fmt.sp(X.f3/X.ly3-1)+' vs same months last year'),
        K('Peak month',mlab_(FUTM_[X.pk]),fmt.n(X.peak)+' units · '+fmt.sp(X.peak/X.peakLy-1)+' vs last year'),
        K('Published hub capacity used at peak',fmt.p(X.peak/X.np,0),'published daily capacity; relative, see note'),
        K('Past order-by date',passed+' of '+rows.length,'materials, at the latest data date '+D.meta.as_of)),
      card('Forecast demand against published capacity','All channels, units per month. The dashed line is the published hub capacity (published daily capacity × 30).',chartBox(el=>colChart(el,{x:FUTM_.map(mlab_),series:[{name:'Forecast units',color:'var(--c-online)',values:X.fc}],ref:{v:X.np,label:'Hub capacity (published)'},fmt:byFmt.num,h:240})),{tag:'forecast',tagClass:'inferred'}),
      card('Order-by dates by material',`For materials needed by ${mlab_(FUTM_[st.need])}. Order-by = need date − lead time. Need is the bill-of-material requirement of the next 90 days of forecast.`,
        table([{k:'name',label:'Material',wrap:true},{k:'unit',label:'Unit'},{k:'need',label:'Needed, next 90 days',num:true,fmt:(v,r)=>r.noBom?'No BOM line':fmt.n(v)},{k:'lead',label:'Lead time',num:true,fmt:v=>v+' d'},{k:'date',label:'Order by'},{k:'left',label:'Status',render:stat,sortv:r=>r.left}],rows,{max:12}),{tag:'modelled',tagClass:'inferred'}),
      h('p',{class:'note warn'},h('b',null,'Read with care. '),'Open purchase orders and material stock balances are not in the data, so an order may already be on its way. Capacity and production volume do not reconcile with sales (recorded output is '+fmt.x(X.ratio,1)+' units sold), so capacity here is relative. Lead times are historical, not supplier commitments.'),
      h('p',{class:'note'},'Everything on this page is historical data and a forecast. There is no live machine or supplier feed.'));
  } draw();
  wrap.append(lineage({tables:'BOM · Materials · Purchasing · Production · Sales (forecast)',from:['inventory','procurement','factory'],to:['whatif','decisions'],note:'Forecast demand comes from the same model as Inventory; lead times come from Procurement.'}));
  return wrap;
};

/* ---- Ask the data: prepared questions, each answered from the loaded data ---- */
const ASKQ_=[
 {q:'Why did gross margin stay flat while sales grew?',to:'profit',kw:'margin flat sales grew growth gross mix',a:()=>{ const L=D.kpi.ltm,P=D.kpi.prior,c=k=>L.by_ch[k],p=k=>P.by_ch[k]; const g=L.net/P.net-1, m1=L.gp/L.net, m0=P.gp/P.net;
   return `Net sales grew <strong>${fmt.sp(g)}</strong> and gross margin moved <strong>${fmt.pp(m1-m0)}</strong> to ${fmt.p(m1)}. Wholesale is ${fmt.p(c('Wholesale').net/L.net,0)} of sales at a ${fmt.p(c('Wholesale').gp/c('Wholesale').net)} margin, against ${fmt.p(c('Online').gp/c('Online').net)} online and ${fmt.p(c('Retail').gp/c('Retail').net)} in store. Online grew ${fmt.sp(c('Online').net/p('Online').net-1)} and the store ${fmt.sp(c('Retail').net/p('Retail').net-1)}. Wholesale dominates the mix, so its margin sets the group margin.`; }},
 {q:'Which suppliers are a risk?',to:'procurement',kw:'supplier suppliers risk late delivery on-time',a:()=>{ const s=D.procurement.suppliers.slice().sort((x,y)=>x.ontime-y.ontime), w=s.slice(0,2), rest=s.slice(2); const avg=sum(rest.map(x=>x.ontime))/rest.length;
   return `<strong>${w[0].id}</strong> and <strong>${w[1].id}</strong> deliver on time ${fmt.p(w[0].ontime,0)} and ${fmt.p(w[1].ontime,0)} of the time, against ${fmt.p(avg,0)} on average for the other ${rest.length}. Together they carry ${fmt.p(w[0].share+w[1].share,0)} of purchase spend. This is measured from past purchase orders (promised vs actual receipt), not a rating.`; }},
 {q:'What will sales look like next quarter?',to:'exec',kw:'sales next quarter forecast demand',a:()=>{ const X=plannerFacts_(); const by=CH.map(c=>`${c} ${fmt.n(sum(D.forecast.fut[c].slice(0,3)))}`).join(', ');
   return `The forecast for ${mlab_(FUTM_[0])} to ${mlab_(FUTM_[2])} is <strong>${fmt.n(X.f3)} units</strong> (${fmt.sp(X.f3/X.ly3-1)} vs the same months last year): ${by}. It is a statistical forecast checked with a rolling backtest (see the Control Room), not a commitment.`; }},
 {q:'Which customers should we call first?',to:'customers',kw:'customers call wholesale overdue lapsed at-risk reorder',a:()=>{ const w=D.customers.lapse.filter(x=>x.t==='W').slice(0,3), t=D.customers.lapse_tot.Wholesale;
   return `${fmt.n(t.n)} wholesale accounts are in the At-risk segment (historic net sales ${fmt.egp(t.hist_net,1)}), ${fmt.n(t.consented)} of them opted in. The three largest by historic sales are <strong>${w.map(x=>x.id).join(', ')}</strong>, last ordering ${w.map(x=>x.last).join(', ')}.`; }},
 {q:'Is the factory the bottleneck for the Q4 peak?',to:'planner',kw:'factory bottleneck peak capacity q4 december',a:()=>{ const X=plannerFacts_();
   return `Peak-month demand (${mlab_(FUTM_[X.pk])}, ${fmt.n(X.peak)} units) is <strong>${fmt.p(X.peak/X.np,0)}</strong> of the published hub capacity, so the risk is timing, not machine hours: the slowest materials take up to ${X.ltMax} days and ${fmt.p(X.late,0)} of production orders already finish late. Capacity figures here are relative (recorded output is ${fmt.x(X.ratio,1)} units sold).`; }},
 {q:'Which marketing platform deserves more budget?',to:'marketing',kw:'marketing platform budget roas spend',a:()=>{ const pl=D.marketing.platforms.slice().sort((a,b)=>b.roas-a.roas), r=D.marketing.recon;
   return `Platform-reported ROAS ranks <strong>${pl[0].p}</strong> first (${fmt.x(pl[0].roas,1)}) and <strong>${pl[pl.length-1].p}</strong> last (${fmt.x(pl[pl.length-1].roas,1)}). But platforms together claim ${fmt.x(r.ratio_rev,1)} the revenue the business actually sold online and direct, so these ratios should not move budgets on their own. Fix attribution and run a holdout test first (ACT-06).`; }},
 {q:'What does poor quality cost?',to:'quality',kw:'quality defects returns rework cost poor',a:()=>{ const c=D.quality.copq, m=c.qc_loss+c.print_rework+c.quality_refunds;
   return `Measured cost of poor quality over the last 12 months is <strong>${fmt.egp(m,1)}</strong> (${fmt.p(m/c.ltm_net)} of net sales): QC loss ${fmt.egp(c.qc_loss,1)}, print rework ${fmt.egp(c.print_rework,2)}, quality-related refunds ${fmt.egp(c.quality_refunds,2)}. Production rejects (${fmt.egp(c.production_rejects,1)}) are shown separately because they may be reused or sold as seconds.`; }},
 {q:'Where is stock in the wrong place?',to:'inventory',kw:'stock inventory wrong place wholesale store online cover',a:()=>{ const b=D.inventory.summary.by_loc;
   return `Wholesale holds a median <strong>${fmt.n(b.Wholesale.cover_med,0)} days</strong> of cover while store holds ${fmt.n(b.Store.cover_med,0)} and online ${fmt.n(b.Online.cover_med,0)}. Stock-outs and surplus exist together: ${fmt.n(D.inventory.summary.excess_units)} units (${fmt.egp(D.inventory.summary.excess_value,1)}) sit above 120 days of demand while wholesale runs short.`; }},
 {q:'What happens if we cap wholesale discounts at 32%?',to:'discount',kw:'discount cap wholesale 32 price',a:()=>{ const a=D.actions.find(x=>x.id==='ACT-01'), s=D.discount_gov.scenarios.find(x=>x.cap===32);
   return `Modelled gross profit gain is <strong>${fmt.egp(a.low,1)} to ${fmt.egp(a.high,1)} a year</strong> on ${fmt.n(s.lines_aff)} affected invoice lines. The cap stays profitable until ${fmt.p(s.breakeven_loss,0)} of the affected volume is lost. Measured volume response to discount depth is close to zero, but a cap itself has not been tested.`; }},
 {q:'What should we fix first?',to:'briefing',kw:'first priority fix action decide',a:()=>{ const t=D.actions.slice().sort((a,b)=>b.score-a.score).slice(0,3);
   return `Top actions by value, confidence and effort: ${t.map(x=>`<strong>${x.id}</strong> ${x.title}`).join('; ')}. Ranges are modelled bounds, not promises.`; }},
 {q:'How reliable is the data?',to:'trust',kw:'data reliable quality trust reconcile',a:()=>{ const c=D.dq.checks, n=s=>c.filter(x=>x.s===s).length;
   return `Of ${c.length} data checks, ${n('pass')} pass, ${n('warn')} warn and ${n('fail')} fail. Sales, discounts and inventory units reconcile; production, purchasing and marketing do not reconcile with sales and are used for ratios and rankings only. Confirm EGP amounts against the ledger before acting.`; }},
];
VIEWS.ask=()=>{
  const wrap=h('div',{class:'page'}); const st=Object.assign({i:0,text:''},store.get('askP',{}));
  wrap.append(pageHead('ask','Ask the data','Pick a prepared question or type a few words. Each answer is calculated from the data loaded in this page and links to the module with the evidence. This is a question finder, not a free-text chatbot.'));
  const list=h('div',{style:{display:'flex',flexDirection:'column',gap:'8px'}}), ans=h('div'); const inp=h('input',{type:'text',id:'ask-in',placeholder:'e.g. margin, suppliers, next quarter…','aria-label':'Search questions',value:st.text,oninput:e=>{st.text=e.target.value;store.set('askP',st);drawList();}});
  function words(s){ return s.toLowerCase().replace(/[^a-z0-9% ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','what','and','for','are','how','which','should','does'].includes(w)); }
  function drawList(){ const w=words(st.text); const items=ASKQ_.map((x,i)=>({x,i,s:w.length?w.filter(t=>(x.q+' '+x.kw).toLowerCase().includes(t)).length:1})).filter(o=>o.s>0).sort((a,b)=>b.s-a.s||a.i-b.i);
    list.replaceChildren(...items.map(o=>h('button',{class:'btn'+(o.i===st.i?' primary':''),style:{textAlign:'start',justifyContent:'flex-start'},onclick:()=>{st.i=o.i;store.set('askP',st);drawList();drawAns();}},o.x.q)),...(items.length?[]:[h('p',{class:'note'},'No prepared question matches. Try “margin”, “suppliers” or “quality”.')])); }
  function drawAns(){ const x=ASKQ_[st.i]||ASKQ_[0]; ans.replaceChildren(card(x.q,'Answer calculated from the loaded data',h('div',null,h('p',{html:x.a(),style:{margin:'0 0 12px',fontSize:'15px',lineHeight:1.55}}),h('button',{class:'btn primary',onclick:()=>go(x.to)},'Open evidence → '+APPBYID[x.to].t)),{tag:'from data',tagClass:'measured'})); }
  wrap.append(card('Questions',null,h('div',{style:{display:'flex',flexDirection:'column',gap:'12px'}},h('div',{class:'field'},h('label',{for:'ask-in'},'Search'),inp),list)),ans);
  drawList(); drawAns();
  wrap.append(h('p',{class:'note'},'Figures come from a historical dataset; confirm against the ledger before acting.'));
  return wrap;
};
