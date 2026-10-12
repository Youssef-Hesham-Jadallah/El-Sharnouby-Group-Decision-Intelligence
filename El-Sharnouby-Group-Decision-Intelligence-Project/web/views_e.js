/* ===== Views E: Factory, Procurement, Quality, Decision Log ===== */

/* ---------- App 04 · Factory */
VIEWS.factory=()=>{
  const Fa=D.factory, wrap=h('div',{class:'page'}), L=Fa.ltm, P=Fa.prior, mo=Fa.monthly;
  const bn=[...Fa.bottlenecks].sort((a,b)=>b.delay_days-a.delay_days), top=bn[0];
  wrap.append(pageHead('factory','Where does production lose time?',`<strong>Historical</strong> production orders, downtime logs and print batches — not a live feed. Output is ${fmt.x(Fa.good_total/Fa.sold_total,1)} the units sold in this dataset, so production and sales <strong>cannot be reconciled</strong>; the hub likely serves volume that is not in the sales table. Treat the findings as operations questions, not a sales forecast.`));
  wrap.append(four({
    now:`Last 12 months: ${fmt.n(L.n)} orders, ${fmt.n(L.good)} good units, efficiency ${fmt.n(L.eff,1)}%, ${fmt.p(L.late,0)} of orders late (${fmt.p(P.late,0)} the year before).`,
    why:`${top.bn} accounts for ${fmt.p(top.share_delay,0)} of all delay days while being only ${fmt.p(top.share_orders,0)} of orders where it is the bottleneck. Delay correlates with low efficiency (r = ${fmt.n(Fa.tests.delay_eff.r,2)}) and with overtime (r = ${fmt.n(Fa.tests.eff_ot.r,2)} on efficiency); neither shows cause.`,
    next:`Lateness already fell from ${fmt.p(P.late,0)} to ${fmt.p(L.late,0)}. Nameplate is ${fmt.n(Fa.nameplate.hub_per_day)} pieces/day; actual output averages ~${fmt.n(mo.good.slice(-12).reduce((a,b)=>a+b,0)/365)} /day.`,
    do:`Add line balancing at the bottleneck station first, then target the machines with most unplanned downtime.`}));
  wrap.append(h('div',{class:'kpis'},K('Efficiency',fmt.n(L.eff,1)+'%',deltaEl(L.eff,P.eff)),K('Late orders',fmt.p(L.late,0),deltaEl(L.late,P.late,{inv:1,pp:1})),K('Average delay',fmt.n(L.delay,2)+' d',deltaEl(L.delay,P.delay,{inv:1})),K('Overtime hours',fmt.n(L.ot),deltaEl(L.ot,P.ot,{inv:1})),K('Reject rate',fmt.p(L.rej,1),'EGP '+fmt.c(Fa.rej_value_ltm)+' rejected value')));
  wrap.append(gridOf('g2',
    card('Output and efficiency','Good units per month, efficiency %',h('div',null,chartBox(el=>colChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Good units',color:'var(--c-whole)',values:mo.good}],fmt:byFmt.c,h:200})),chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Efficiency %',color:'var(--accent)',values:mo.eff}],fmt:v=>fmt.n(v,0)+'%',h:150}))),{tag:'measured',tagClass:'measured'}),
    card('Late orders and delay','Share of orders late; average delay days',h('div',null,chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Late share',color:'var(--crit)',values:mo.late}],fmt:byFmt.pct,h:200,zero:true})),chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Avg delay d',color:'var(--warn)',values:mo.delay}],fmt:v=>fmt.n(v,1)+'d',h:150,zero:true}))),{tag:'measured',tagClass:'measured'})));
  wrap.append(gridOf('g2',
    card('Bottleneck station','Delay days attributed to each station (orders with a recorded bottleneck)',h('div',null,chartBox(el=>barChart(el,{items:bn.map(b=>({label:b.bn,value:b.delay_days,sub:fmt.n(b.n)+' orders'})),fmt:v=>fmt.n(v)+' d',labelW:100})),h('p',{class:'note',style:{marginTop:'8px'}},`Orders with a bottleneck wait ${fmt.n(Fa.tests.sewing_vs_rest.mean_sew,1)} days on sewing vs ${fmt.n(Fa.tests.sewing_vs_rest.mean_rest,1)} elsewhere (p < 0.001).`)),{tag:'measured',tagClass:'measured'}),
    card('Production lines','Same plant, five lines',table([col('line','Line'),col('n','Orders',{num:1}),col('attain','Plan attainment',{num:1,fmt:v=>fmt.p(v,0)}),col('eff','Efficiency',{num:1,fmt:v=>fmt.n(v,1)+'%'}),col('late','Late',{num:1,fmt:v=>fmt.p(v,0)}),col('rej_rate','Rejects',{num:1,fmt:v=>fmt.p(v,1)}),col('ot','OT hrs',{num:1,fmt:v=>fmt.n(v)})],Fa.lines,{sortable:true}),{tag:'measured',tagClass:'measured'})));
  wrap.append(gridOf('g2',
    card('Overtime vs lateness','Orders grouped by overtime hours',table([col('b','Overtime'),col('n','Orders',{num:1,fmt:v=>fmt.n(v)}),col('eff','Efficiency',{num:1,fmt:v=>fmt.n(v,1)+'%'}),col('late','Late',{num:1,fmt:v=>fmt.p(v,0)}),col('delay','Delay (d)',{num:1,fmt:v=>fmt.n(v,2)})],Fa.ot_bins,{sortable:false}),{tag:'measured',tagClass:'measured'}),
    card('Product families','Same process, small differences',table([col('fam','Family'),col('n','Orders',{num:1}),col('eff','Efficiency',{num:1,fmt:v=>fmt.n(v,1)+'%'}),col('late','Late',{num:1,fmt:v=>fmt.p(v,0)}),col('rej','Rejects',{num:1,fmt:v=>fmt.p(v,1)})],Fa.families,{sortable:false}),{tag:'measured',tagClass:'measured'})));
  // downtime
  const areas=Object.keys(Fa.area_reason), reasons=[...new Set(areas.flatMap(a=>Object.keys(Fa.area_reason[a])))];
  wrap.append(gridOf('g2',
    card('Machine downtime (hours, 36 months)','Unplanned vs planned, with L12M vs prior year',table([col('m','Machine'),col('area','Area'),col('hrs','Hours',{num:1,bar:1,fmt:v=>fmt.n(v)}),col('unpl','Unplanned',{num:1,fmt:v=>fmt.n(v)}),col('top','Top cause'),col('ltm','L12M',{num:1,fmt:v=>fmt.n(v)}),col('prior','Prior',{num:1,fmt:v=>fmt.n(v)})],Fa.machines,{max:8}),{tag:'measured',tagClass:'measured'}),
    card('Downtime by area and cause','Hours',chartBox(el=>heat(el,{rows:areas,cols:reasons.map(r=>r.replace(' / ','/')),vals:areas.map(a=>reasons.map(r=>Fa.area_reason[a][r]||0)),fmt:v=>fmt.n(v),colors:['var(--surface-2)','var(--accent)'],lw:90,cw:70})),{tag:'measured',tagClass:'measured'})));
  wrap.append(gridOf('g2',
    card('Printing yield','Print batches by technique',h('div',null,table([col('t','Technique'),col('batches','Batches',{num:1}),col('yield_','Yield',{num:1,fmt:v=>fmt.p(v,1)}),col('rework','Rework units',{num:1,fmt:v=>fmt.n(v)}),col('cost_unit','Cost/unit',{num:1,fmt:v=>fmt.egp(v)})],Fa.print_types,{sortable:false}),h('p',{class:'note',style:{marginTop:'8px'}},`Yield is flat across techniques and machines: no print hotspot to chase. Rework L12M: ${fmt.n(Fa.rework_ltm)} units.`)),{tag:'measured',tagClass:'measured'}),
    card('Monthly print yield','Share of printed units accepted',chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Yield',color:'var(--c-online)',values:Fa.print_trend.yield_}],fmt:byFmt.pct,h:220})),{tag:'measured',tagClass:'measured'})));
  wrap.append(card('Production vs sales units','Good units made vs units sold per month — the two do not reconcile',h('div',null,legend([{name:'Good units produced',color:'var(--c-whole)'},{name:'Units sold (sales table)',color:'var(--c-online)'}]),chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Produced',color:'var(--c-whole)',values:mo.good},{name:'Sold',color:'var(--c-online)',values:Fa.sales_units_monthly}],fmt:byFmt.c,h:230,zero:true}))),{tag:'measured',tagClass:'measured'}));
  wrap.append(lineage({tables:'Production · Downtime · Printing',from:['procurement','inventory'],to:['whatif','quality','decisions'],note:'Do not use production output to forecast sales or stock: the factory serves volume outside the sales table.'}));
  return wrap;
};

/* ---------- App 07 · Procurement & suppliers */
VIEWS.procurement=()=>{
  const Pr=D.procurement, wrap=h('div',{class:'page'}), T=Pr.totals; const S=[...Pr.suppliers].sort((a,b)=>b.risk-a.risk);
  const worst=S.slice(0,2);
  wrap.append(pageHead('procurement','Which suppliers can we count on?',`Delivery performance, lateness and price are <strong>measured</strong> from the purchase-order records. No supplier ratings or material stock balances exist, so shortage risk is <strong>inferred</strong> from lead-time reliability and bill-of-materials demand.`));
  wrap.append(four({
    now:`EGP ${fmt.c(T.spend)} over 36 months; only <strong>${fmt.p(T.ontime,0)}</strong> of orders arrive on time. Average lead time ${fmt.n(T.lt,1)} d; ${fmt.p(T.late5,1)} of orders are more than 5 days late.`,
    why:`${worst.map(s=>s.id).join(' and ')} have the highest risk scores (${fmt.n(worst[0].risk,0)}, ${fmt.n(worst[1].risk,0)}): on-time ${fmt.p(worst[0].ontime,0)} and ${fmt.p(worst[1].ontime,0)}. Late deliveries do not correlate with factory material-wait downtime (r = ${fmt.n(Pr.corr_late_matwait.r,2)}, p = ${fmt.n(Pr.corr_late_matwait.p,2)}), so impact on production is unproven.`,
    next:`Price dispersion across suppliers is ${fmt.p(Pr.price_disp,0)} on the same material-quarter; buying everything at the best observed price is an upper bound of savings, not a target.`,
    do:`Open delivery reviews with the two riskiest suppliers; contract the high-volume materials; ask suppliers for committed lead times.`}));
  const pot=sum(Pr.materials.map(m=>m.pot));
  wrap.append(h('div',{class:'kpis'},K('Spend (L12M)',fmt.egp(T.spend_ltm),fmt.egp(T.spend)+' total'),K('On-time orders',fmt.p(T.ontime,0),'purchase orders'),K('Reject rate',fmt.p(T.rej,1),'goods received'),K('Average lead time',fmt.n(T.lt,1)+' d','late > 5d: '+fmt.p(T.late5,1)),K('Price-gap upper bound',fmt.egp(pot),'not a target')));
  wrap.append(card('Supplier scorecard','Risk = transparent composite of lateness, on-time rate, rejects and price index (higher is worse)',table([col('id','Supplier'),col('cat','Category'),col('spend','Spend',{num:1,bar:1,fmt:v=>fmt.egp(v)}),col('ontime','On-time',{num:1,fmt:v=>fmt.p(v,0)}),col('late_when','Days late (when late)',{num:1,fmt:v=>fmt.n(v,1)}),col('rej','Rejects',{num:1,fmt:v=>fmt.p(v,1)}),col('pidx','Price index',{num:1,fmt:v=>fmt.n(v,3)}),col('ontime_ltm','On-time L12M',{num:1,fmt:v=>fmt.p(v,0)}),col('risk','Risk',{num:1,bar:1,barColor:'var(--crit)',fmt:v=>fmt.n(v,0)})],S,{max:12}),{tag:'measured',tagClass:'measured'}));
  const sup=Pr.suppliers.map(s=>s.id), mats=Pr.materials.map(m=>m.id); const mv=sup.map(s=>mats.map(m=>{const r=Pr.matrix.find(x=>x[0]===s&&x[1]===m);return r?r[3]:null;}));
  wrap.append(gridOf('g2',
    card('On-time rate by quarter','Overall, and the two riskiest suppliers',h('div',null,legend([{name:'All suppliers',color:'var(--accent)'},{name:worst[0].id,color:'var(--crit)'},{name:worst[1].id,color:'var(--warn)'}]),chartBox(el=>lineChart(el,{x:Pr.quarterly.q,series:[{name:'All',color:'var(--accent)',values:Pr.quarterly.ot},{name:worst[0].id,color:'var(--crit)',values:Pr.quarterly.by_supplier[worst[0].id]},{name:worst[1].id,color:'var(--warn)',values:Pr.quarterly.by_supplier[worst[1].id]}],fmt:byFmt.pct,h:230,yMin:0.4,yMax:1}))),{tag:'measured',tagClass:'measured'}),
    card('Supplier × material on-time','Every supplier supplies every material in this data, so there is no category specialisation to assess',chartBox(el=>heat(el,{rows:sup,cols:mats,vals:mv,fmt:v=>v==null?'':fmt.n(v*100,0),colors:['var(--crit-bg)','var(--good)'],domain:[.5,.9],lw:60,cw:42,ch:22})),{tag:'measured',tagClass:'measured'})));
  wrap.append(card('Materials','Price trend, lead time vs standard, and purchase vs BOM-implied need',table([col('name','Material',{wrap:1}),col('cat','Cat.'),col('spend_ltm','Spend L12M',{num:1,bar:1,fmt:v=>fmt.egp(v)}),col('price_chg','Price YoY',{num:1,fmt:v=>fmt.sp(v,1)}),col('std_lt','Std lead',{num:1,fmt:v=>fmt.n(v)+' d'}),col('lt','Actual',{num:1,fmt:v=>fmt.n(v,1)+' d'}),col('lt_p90','P90',{num:1,fmt:v=>fmt.n(v)+' d'}),col('ontime','On-time',{num:1,fmt:v=>fmt.p(v,0)}),col('pot','Price-gap bound',{num:1,fmt:v=>fmt.egp(v)})],Pr.materials,{max:12}),{tag:'measured',tagClass:'measured'}));
  const rc=Pr.recon;
  wrap.append(gridOf('g2',
    card('Cost index by category','Q4-2023 = 1.00',h('div',null,legend(Object.keys(Pr.cost_index.by_cat).map((k,i)=>({name:k,color:CATS[i]}))),chartBox(el=>lineChart(el,{x:Pr.cost_index.q,series:Object.entries(Pr.cost_index.by_cat).map(([k,v],i)=>({name:k,color:CATS[i],values:v})),fmt:v=>fmt.n(v,2),h:220}))),{tag:'measured',tagClass:'measured'}),
    card('Purchases vs BOM-implied need','Material units bought vs what sales and production would require',h('div',null,chartBox(el=>barChart(el,{items:rc.slice(0,8).map(r=>({label:r.name.slice(0,26),value:r.purchased/Math.max(r.need_sales,1),sub:fmt.n(r.purchased)})),fmt:v=>fmt.x(v,1),labelW:170})),h('p',{class:'note warn',style:{marginTop:'8px'}},`Bought is a multiple of what the sales table implies (about right vs production). Same mismatch as production vs sales (F-10). ${Pr.missing_bom.join(', ')} have purchases but no BOM line.`)),{tag:'inferred',tagClass:'inferred'})));
  wrap.append(lineage({tables:'Purchasing · Suppliers · Materials · BOM',from:['factory','inventory'],to:['whatif','decisions','warning'],note:'No supplier master ratings, delivery promises beyond PO dates, or material stock: shortage risk is approximated, not observed.'}));
  return wrap;
};

/* ---------- App 12 · Quality, waste and returns */
VIEWS.quality=()=>{
  const Q=D.quality, wrap=h('div',{class:'page'}), cp=Q.copq, ch=Q.channel_returns; const on=ch.find(c=>c.ch==='Online'), rt=ch.find(c=>c.ch==='Retail');
  wrap.append(pageHead('quality','What does poor quality cost, and where does it start?',`Defects, rework, returns and complaints, valued in EGP. We separate what is <strong>measured</strong> (QC rejects, print rework, quality-coded refunds) from the larger figure that includes production rejects. Statistical tests below say whether any stage or defect is a real hotspot.`));
  wrap.append(four({
    now:`Cost of poor quality is <strong>${fmt.egp(cp.qc_loss+cp.print_rework+cp.quality_refunds,1)}</strong> measured in the last year (${fmt.egp(cp.total,1)} if production rejects are included): ${fmt.p(cp.total/cp.ltm_net,0)} of net sales. QC reject rate is ${fmt.p(Q.qc.rate,1)}.`,
    why:`Defect type and stage are statistically independent (p = ${fmt.n(Q.chi.stage_defect.p,2)} and ${fmt.n(Q.chi.defect_root.p,2)}), so there is no hotspot to fix; the cost is spread evenly. Online returns run ${fmt.p(on.rate,1)} vs ${fmt.p(rt.rate,1)} in store, with size and fit the top reason.`,
    next:`If online excess returns persist: about ${fmt.egp(Q.online_excess.ltm_refund)} of refunds per year above the store rate.`,
    do:`Add size guidance and fit data on online product pages; review the product lines with unusually high returns before restocking.`}));
  wrap.append(h('div',{class:'kpis'},K('QC reject rate',fmt.p(Q.qc.rate,1),fmt.n(Q.qc.inspected)+' inspected'),K('QC loss (all history)',fmt.egp(Q.qc.loss,1),fmt.n(Q.qc.rejected)+' units'),K('Online return rate',fmt.p(on.rate,1),'store '+fmt.p(rt.rate,1)),K('Refunds (L12M)',fmt.egp(cp.all_refunds,1),fmt.egp(cp.quality_refunds,1)+' quality-coded'),K('Complaint CSAT',fmt.n(Q.tickets_monthly.csat.slice(-12).reduce((a,b)=>a+b,0)/12,2)+' / 5','last 12 months')));
  wrap.append(card('Cost of poor quality (L12M)','Measured components first; production rejects shown separately because they may be re-used or sold as seconds',chartBox(el=>barChart(el,{items:[{label:'QC rejects (value)',value:cp.qc_loss},{label:'Print rework',value:cp.print_rework},{label:'Quality refunds',value:cp.quality_refunds},{label:'Production rejects*',value:cp.production_rejects}],fmt:v=>fmt.egp(v,1),labelW:150})),{tag:'measured',tagClass:'measured'}));
  const stages=Object.keys(Q.stage_defect), defects=Object.keys(Q.stage_defect[stages[0]]);
  wrap.append(gridOf('g2',
    card('Defect Pareto','Rejected units by defect type',chartBox(el=>barChart(el,{items:Q.pareto.map(p=>({label:p.d,value:p.rej,sub:fmt.egp(p.loss,1)})),fmt:v=>fmt.n(v),labelW:140})),{tag:'measured',tagClass:'measured'}),
    card('Root cause','Rejected units by recorded cause',chartBox(el=>barChart(el,{items:Q.root.map(p=>({label:p.c,value:p.rej,sub:fmt.egp(p.loss,1)})),fmt:v=>fmt.n(v),labelW:140})),{tag:'measured',tagClass:'measured'})));
  wrap.append(gridOf('g2',
    card('Stage × defect','Rejected units. Colors look uniform for a reason: chi-square finds no association.',h('div',null,chartBox(el=>heat(el,{rows:stages,cols:defects.map(d=>d.replace(' ','\n').slice(0,10)),vals:stages.map(s=>defects.map(d=>Q.stage_defect[s][d])),fmt:v=>fmt.n(v/1000,0)+'K',colors:['var(--surface-2)','var(--accent)'],lw:80,cw:58})),h('p',{class:'note',style:{marginTop:'8px'}},`Stage × defect: χ² = ${fmt.n(Q.chi.stage_defect.chi2,1)}, p = ${fmt.n(Q.chi.stage_defect.p,2)}. Defect × root cause: p = ${fmt.n(Q.chi.defect_root.p,2)}. No stage or defect stands out.`)),{tag:'model',tagClass:'model'}),
    card('QC reject rate by month','All stages',chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:[{name:'Reject rate',color:'var(--crit)',values:Q.monthly.rate}],fmt:byFmt.pct2,h:230,yMin:0})),{tag:'measured',tagClass:'measured'})));
  // returns
  const rr=D.return_reasons; const agg={}; rr.forEach(r=>{const k=r[1]; agg[k]=(agg[k]||0)+r[2];});
  wrap.append(gridOf('g2',
    card('Return rate by quarter','Share of invoice lines returned, by channel',h('div',null,legend(CH.map(c=>({name:c,color:CHCOL[c]}))),chartBox(el=>lineChart(el,{x:Q.return_q.q,series:CH.map(c=>({name:c,color:CHCOL[c],values:Q.return_q[c]})),fmt:byFmt.pct,h:230,zero:true}))),{tag:'measured',tagClass:'measured'}),
    card('Why customers return','Returned lines by reason (all channels, all history)',chartBox(el=>barChart(el,{items:Object.entries(agg).map(([k,v])=>({label:k,value:v})).sort((a,b)=>b.value-a.value).slice(0,8),fmt:v=>fmt.n(v),labelW:150})),{tag:'measured',tagClass:'measured'})));
  const outl=Q.products.filter(p=>p.retz>1.8||p.qcz>1.8).map(p=>({...p,name:shortName(p.p,36)})).sort((a,b)=>b.retz-a.retz);
  wrap.append(gridOf('g2',
    card('Products with unusual returns or rejects','Funnel-plot style z-score (|z| > 1.8, adjusts for volume). QC rate and return rate are not correlated across products (r = '+fmt.n(Q.qc_vs_return.pearson,2)+', p = '+fmt.n(Q.qc_vs_return.p,2)+').',outl.length?table([col('name','Product',{wrap:1}),col('ret','Return rate',{num:1,fmt:v=>fmt.p(v,1)}),col('retz','z',{num:1,fmt:v=>fmt.n(v,1)}),col('qc','QC reject',{num:1,fmt:v=>fmt.p(v,1)}),col('qcz','z',{num:1,fmt:v=>fmt.n(v,1)}),col('ref','Refunds',{num:1,fmt:v=>fmt.egp(v)})],outl,{max:8}):h('p',{class:'note'},'No product is a statistical outlier.'),{tag:'model',tagClass:'model'}),
    card('Customer complaints','Tickets by type: volume, satisfaction and speed',table([col('t','Type'),col('n','Tickets',{num:1,fmt:v=>fmt.n(v)}),col('csat','CSAT',{num:1,fmt:v=>fmt.n(v,2)}),col('fr','First reply (h)',{num:1,fmt:v=>fmt.n(v,1)}),col('res','Resolution (h)',{num:1,fmt:v=>fmt.n(v,1)}),col('unres','Unresolved',{num:1,fmt:v=>fmt.p(v,1)})],Q.tickets,{sortable:true}),{tag:'measured',tagClass:'measured'})));
  wrap.append(lineage({tables:'Quality · Returns · Printing · Support',from:['factory','procurement'],to:['whatif','decisions','warning'],note:'Tickets carry no customer ID, so complaints cannot be joined to customer value or churn.'}));
  return wrap;
};

/* ---------- App 13 · Decision Log & Learning Loop */
VIEWS.decisions=()=>{
  const A=D.actions, wrap=h('div',{class:'page'}); const log=store.get('actionLog',{}); const scen=store.get('scenarios',[]);
  const ST=['Proposed','Approved','In progress','Done','Rejected']; const save=()=>store.set('actionLog',log);
  wrap.append(pageHead('decisions','Decide, track, and check what really happened',`Ten evidence-linked actions, ranked by impact over effort and confidence. Status, owner, dates and the <em>actual</em> impact you enter are kept in this browser only (nothing leaves your device); copy the log to share it.`));
  const lowT=sum(A.map(a=>a.low)), highT=sum(A.map(a=>a.high)), prof=A.filter(a=>a.kind==='profit');
  wrap.append(four({
    now:`${A.length} recommended actions; ${A.filter(a=>(log[a.id]||{}).status&&(log[a.id]||{}).status!=='Proposed').length} are in progress or decided. Profit actions alone are worth ${fmt.egp(sum(prof.map(a=>a.low)))}–${fmt.egp(sum(prof.map(a=>a.high)))} a year.`,
    why:`Each action is tied to a finding and to the evidence on its page. Ranges are not additive: the low case assumes some volume loss; the high case assumes none.`,
    next:`The forecast is accurate within ~${fmt.p(D.forecast.meta.results.snaive_g.Wholesale.wape_sku,0)} per SKU (wholesale) and ~${fmt.p(D.forecast.meta.results.snaive_g.Wholesale.wape_total,0)} in total, so planned actions should be re-checked each month.`,
    do:`Approve ACT-01 first (largest, best-evidenced), assign owners, and record actual results at 30, 60 and 90 days.`}));
  const rowsHost=h('div',{style:{display:'flex',flexDirection:'column',gap:'12px'}});
  const sorted=[...A].sort((a,b)=>b.score-a.score);
  sorted.forEach(a=>{ const s=log[a.id]=log[a.id]||{status:'Proposed',owner:a.owner,due:'',note:'',actual:''};
    const inp=(k,ph,type='text',w)=>h('input',{type,placeholder:ph,value:s[k]||'','aria-label':k+' '+a.id,style:{minWidth:0,width:w||'100%'},oninput:e=>{s[k]=e.target.value;save();}});
    const sel=h('select',{'aria-label':'Status '+a.id,onchange:e=>{s.status=e.target.value;save();render();}},ST.map(x=>h('option',{value:x,selected:x===s.status},x)));
    const kp=a.kpi; const fv=v=>kp.fmt==='pct'?fmt.p(v,1):kp.fmt==='egp'?fmt.egp(v):fmt.n(v,1);
    rowsHost.append(h('section',{class:'card'},h('div',{class:'ch'},h('div',null,h('h3',null,a.id+' · '+a.title),h('div',{class:'sub'},a.why)),h('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},h('span',{class:'tag '+(a.kind==='profit'?'measured':'inferred')},a.kind),sel)),
      h('div',{class:'grid g3'},h('div',null,h('p',{class:'note'},h('b',null,'What: '),a.what),h('p',{class:'note warn',style:{marginTop:'8px'}},h('b',null,'Risk: '),a.risk)),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'6px',fontSize:'13px'}},h('div',null,h('b',null,'Impact: '),fmt.egp(a.low),' – ',fmt.egp(a.high),' / yr'),h('div',null,h('b',null,'Confidence: '),a.conf,' · Effort ',a.effort),h('div',null,h('b',null,'Horizon: '),a.horizon),h('div',null,h('b',null,'KPI: '),kp.name+' '+fv(kp.base)+' → '+fv(kp.target)),h('div',{class:'sub'},a.basis)),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},inp('owner','Owner'),inp('due','Due date','date'),inp('actual','Actual impact (EGP / note)'),inp('note','Notes / learning'))))); });
  wrap.append(h('div',{class:'kpis'},K('Actions',String(A.length),prof.length+' profit · '+A.filter(a=>a.kind==='cash').length+' cash'),K('Low case total',fmt.egp(lowT),'not additive'),K('High case total',fmt.egp(highT),'not additive'),K('Done',String(A.filter(a=>log[a.id]&&log[a.id].status==='Done').length),'recorded by you'),K('Scenarios saved',String(scen.length),'from What-If')));
  wrap.append(section('Decision board','Drag-free: change the status on a card to move it'));
  wrap.append(decisionBoard(()=>render()));
  wrap.append(section('Action register','Ranked by score = impact × confidence ÷ effort'));
  wrap.append(rowsHost);
  wrap.append(section('Saved scenarios','Created in the What-If Simulator, stored in this browser'));
  wrap.append(scen.length?table([col('at','Saved'),col('t','Scenario',{wrap:1}),col('s','Assumptions and result',{wrap:1}),col('low','Low',{num:1,fmt:v=>v==null?'–':fmt.egp(v)}),col('high','High',{num:1,fmt:v=>v==null?'–':fmt.egp(v)})],scen,{sortable:false}):h('p',{class:'note'},'No scenarios yet. Build one in the What-If Simulator and press “Save scenario to Decision Log”.'));
  // model health
  const R=D.forecast.meta.results, rl=D.forecast.meta.rolling;
  wrap.append(section('Learning loop','How much to trust the forecasts behind these actions'));
  wrap.append(gridOf('g2',
    card('Forecast accuracy','Rolling-origin backtest, 3-month horizon (lower is better)',table([col('ch','Channel'),col('m','Chosen method'),col('w','SKU error (WAPE)',{num:1,fmt:v=>fmt.p(v,0)}),col('t','Total error',{num:1,fmt:v=>fmt.p(v,1)}),col('b','Bias',{num:1,fmt:v=>fmt.sp(v,1)})],CH.map(c=>{const m=D.forecast.meta.best[c],r=R[m][c];return {ch:c,m:D.forecast.meta.labels[m],w:r.wape_sku,t:r.wape_total,b:r.bias};}),{sortable:false}),{tag:'model',tagClass:'model'}),
    card('Error over time','Overall WAPE by forecast origin',chartBox(el=>lineChart(el,{x:rl.map(r=>r.origin),series:[{name:'WAPE',color:'var(--accent)',values:rl.map(r=>r.wape)}],fmt:byFmt.pct,h:200,zero:true})),{tag:'model',tagClass:'model'})));
  const exp=h('button',{class:'btn',onclick:()=>{const txt=JSON.stringify({actions:log,scenarios:scen},null,1); navigator.clipboard.writeText(txt).then(()=>exp.textContent='Copied to clipboard ✓').catch(()=>{const ta=h('textarea',{style:{width:'100%',height:'160px'}});ta.value=txt;exp.after(ta);ta.select();});}},'Copy log as JSON');
  wrap.append(h('div',{style:{display:'flex',gap:'10px',alignItems:'center'}},exp,h('span',{class:'sub'},'Browser storage is per viewer; copy the log to keep a shared record.')));
  wrap.append(lineage({tables:'All modules',from:['whatif','warning','profit','inventory','procurement','quality'],to:[],note:'Estimated impacts come from last-12-month run rates and stated assumptions; they are targets to verify, not promises.'}));
  return wrap;
};
