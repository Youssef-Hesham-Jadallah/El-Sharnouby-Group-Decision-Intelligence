/* ===== Views C: What-If Simulator & Decision Optimizer ===== */
const WI = {tab:store.get('wiTab','chain')};
const baseCh = ()=>{ const g=group({from:24,to:35,ch:new Set(CH),family:'All'},r=>CH[r[1]]); return Object.fromEntries(CH.map(c=>[c,g.get(c)])); };
function winDem(fm,days){ let tot=0,rem=days; for(const v of fm){ const t=Math.min(rem,30.4); tot+=v*t/30.4; rem-=t; if(rem<=0) break; } return tot; }
function slider(id,label,min,max,step,val,unit,cb,fmtv){ const o=h('output',{id:id+'o'},(fmtv?fmtv(val):val)+(unit||'')); return h('div',{class:'field'},h('label',{for:id},label,o),h('input',{type:'range',id,min,max,step,value:val,oninput:e=>{o.textContent=(fmtv?fmtv(+e.target.value):e.target.value)+(unit||'');cb(+e.target.value);}})); }
/* --- decision chain engine */
function chain(pi,{scope='All',uplift=.3,H=60,transport=4,cap=.2,mult=1,expedite=0}={}){
  const rows=INV.filter(x=>x.p===pi); const inScope=x=>scope==='All'||x.l===scope;
  const dem=rows.map(x=>({x,base:winDem(x.fm,H),lt:x.lt})); let E=0; const need={}; dem.forEach(d=>{ d.lift=inScope(d.x)?d.base*uplift*mult:0; d.total=d.base+d.lift; d.gap=Math.max(0,d.total-d.x.stock); d.keep=d.base*1.0+d.x.ssm*0; d.surplus=Math.max(0,d.x.stock-Math.max(d.base,d.x.tgt*0)-0); d.surplus=Math.max(0,d.x.stock-d.base*1.2); E+=d.lift; });
  // transfers: donors with surplus -> recipients with gap
  let moved=0; const tf=[]; const donors=dem.map(d=>({...d,s:d.surplus})).sort((a,b)=>b.s-a.s);
  dem.slice().sort((a,b)=>b.gap-a.gap).forEach(r=>{ let g=r.gap; donors.forEach(d=>{ if(d.x.l===r.x.l||g<1||d.s<1) return; const q=Math.floor(Math.min(d.s,g)); d.s-=q; g-=q; moved+=q; tf.push({from:d.x.l,to:r.x.l,q}); }); r.afterTransfer=g; });
  const remaining=sum(dem.map(d=>d.afterTransfer??d.gap)), totalGap=sum(dem.map(d=>d.gap));
  const gpuOf=x=>x.nu?x.nu-x.uc:0; const gap0=dem.filter(d=>d.gap>0); const gpu=gap0.length?sum(gap0.map(d=>d.gap*gpuOf(d.x)))/Math.max(1,sum(gap0.map(d=>d.gap))):avg(rows.map(gpuOf)); const uc=avg(rows.map(x=>x.uc));
  // materials & timing
  const bom=(D.bom[pi]||[]).map(([mi,per])=>({m:D.procurement.materials.find(x=>x.id===D.material_ids[mi]),per})).filter(b=>b.m);
  const matLT=bom.length?Math.max(...bom.map(b=>b.m.lt)):12, pOn=bom.reduce((a,b)=>a*b.m.ontime,1), lateAvg=bom.length?Math.max(...bom.map(b=>b.m.late_avg)):0, prodDays=D.prod_lead.days;
  const tOn=matLT+prodDays, tLate=tOn+Math.max(2,lateAvg*3);
  const capt=(T)=>Math.max(0,(H-T)/H);
  const transit=3, tcapt=capt(transit);
  const sold=(units,t)=>units*t;
  const eP=pOn*capt(tOn)+(1-pOn)*capt(tLate);   // expected share of the gap that the new production can still serve
  const pol=[];
  const carry=(u,days)=>u*uc*cap*days/365;
  // A: do nothing
  pol.push({k:'Do nothing',sold:0,lost:totalGap,cost:0,gp:0,cash:0,when:'—',risk:'Lost sales on '+fmt.n(totalGap,0)+' units'});
  const gB=sold(moved,tcapt)*gpu-moved*transport; pol.push({k:'Rebalance stock',sold:sold(moved,tcapt),lost:totalGap-sold(moved,tcapt),cost:moved*transport,gp:gB,cash:0,when:'day '+transit,risk:moved?'Needs surplus on the same SKU':'No transferable surplus'});
  const prodU=remaining, prodSold=prodU*eP; const gC=gB+prodSold*gpu-carry(prodU-prodSold,H)-expedite*prodU; pol.push({k:'Rebalance + produce',sold:sold(moved,tcapt)+prodSold,lost:Math.max(0,totalGap-sold(moved,tcapt)-prodSold),cost:moved*transport+carry(prodU-prodSold,H)+expedite*prodU,gp:gC,cash:prodU*uc,when:'day '+fmt.n(tOn,0)+(pOn<.95?'–'+fmt.n(tLate,0):''),risk:(1-pOn>0.25?'Material delay risk '+fmt.p(1-pOn,0):'On-time odds '+fmt.p(pOn,0))});
  const pu2=totalGap, ps2=pu2*eP; const gD=ps2*gpu-carry(pu2-ps2,H)-expedite*pu2; pol.push({k:'Produce only',sold:ps2,lost:Math.max(0,totalGap-ps2),cost:carry(pu2-ps2,H)+expedite*pu2,gp:gD,cash:pu2*uc,when:'day '+fmt.n(tOn,0)+(pOn<.95?'–'+fmt.n(tLate,0):''),risk:'Cash '+fmt.egp(pu2*uc,1)+' tied up'});
  return {rows,dem,E,moved,tf,remaining,totalGap,gpu,uc,bom,matLT,pOn,tOn,tLate,prodDays,pol,H};
}
VIEWS.whatif=()=>{
  const wrap=h('div',{class:'page'}), body=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  wrap.append(pageHead('whatif','Try a decision before making it',`Change an assumption and compare the scenario with today's baseline. Each tab says what is measured, what is assumed and how uncertain the result is. Where an optimiser is used it has an explicit objective, decision variables and constraints; everywhere else it is a transparent calculator.`));
  wrap.append(four({now:'Baseline is the last 12 months by channel, the Sep-2026 stock snapshot and the 6-month forecast.',why:'Each scenario changes one or two levers and recomputes profit, stock and risk from the same cube the other modules use.',next:'Results carry a range: demand error from the backtest, price response from the fixed-effects interval, supplier delay from observed on-time rates.',do:'Pick the tab for your decision. Save the scenario you prefer to the Decision Log.'}));
  const tabs=[['chain','Decision chain'],['price','Price & discount'],['shock','Demand shock'],['supplier','Supplier shift'],['mkt','Marketing budget'],['cap','Capacity & delay']];
  const seg=h('div',{class:'seg',role:'tablist'},tabs.map(([k,l])=>h('button',{'aria-pressed':WI.tab===k,onclick:()=>{WI.tab=k;store.set('wiTab',k);render();}},l)));
  wrap.append(seg,body); (WIT[WI.tab]||WIT.chain)(body); 
  wrap.append(lineage({tables:'cube · Inventory · BOM · Purchasing · Marketing',from:['inventory','profit','procurement','marketing','factory'],to:['decisions','exec']})); return wrap;
};
const WIT={};
function saveScenario(title,text,low,high){ const log=store.get('scenarios',[]); log.unshift({t:title,s:text,low,high,at:new Date().toISOString().slice(0,10)}); store.set('scenarios',log.slice(0,30)); }
function saveBtn(getter){ const b=h('button',{class:'btn primary sm',onclick:()=>{const s=getter(); saveScenario(s.t,s.s,s.low,s.high); b.textContent='Saved to Decision Log ✓';}},'Save scenario to Decision Log'); return b; }
/* ---- chain */
WIT.chain=(body)=>{
  const st=Object.assign({pi:(INV.filter(x=>x.l==='Wholesale').sort((a,b)=>b.rec-a.rec)[0]||{p:0}).p,scope:'All',uplift:30,H:60,transport:4,cap:20,exped:0},store.get('chainP',{}));
  const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  const sel=h('select',{id:'wic-p',onchange:e=>{st.pi=+e.target.value;store.set('chainP',st);draw();}},PRODUCTS.map((p,i)=>h('option',{value:i,selected:i===st.pi},prodName(i)))); const sc=h('select',{id:'wic-s',onchange:e=>{st.scope=e.target.value;store.set('chainP',st);draw();}},['All','Wholesale','Online','Store'].map(s=>h('option',{value:s,selected:s===st.scope},s==='All'?'All locations':s)));
  const upd=k=>v=>{st[k]=v;store.set('chainP',st);draw();};
  body.append(card('The event','A demand lift on one product. The chain checks stock, transfers, materials and production before choosing a policy.',h('div',{class:'grid g4'},h('div',{class:'field'},h('label',{for:'wic-p'},'Product'),sel),h('div',{class:'field'},h('label',{for:'wic-s'},'Lift applies to'),sc),slider('wic-u','Demand lift',-30,150,5,st.uplift,'%',upd('uplift')),slider('wic-h','Horizon',30,90,30,st.H,' days',upd('H')),slider('wic-t','Transport cost per unit',0,20,1,st.transport,' EGP',upd('transport')),slider('wic-c','Cost of capital',0,40,1,st.cap,' %',upd('cap')),slider('wic-e','Expedite cost per unit',0,60,5,st.exped,' EGP',upd('exped'))),{tag:'assumptions',tagClass:'assump'}),out);
  function draw(){
    const q=D.forecast.meta.ratio_q; const run=m=>chain(st.pi,{scope:st.scope,uplift:st.uplift/100,H:st.H,transport:st.transport,cap:st.cap/100,mult:m,expedite:st.exped});
    const base=run(1), lo=run(q.Wholesale[0]), hi=run(q.Wholesale[2]); const r=base;
    const best=r.pol.slice().sort((a,b)=>b.gp-a.gp)[0];
    const chk=(n,title,txt,ok)=>h('div',{class:'kpi'},h('span',{class:'l'},'Check '+n),h('b',{style:{fontFamily:'var(--f-display)',fontSize:'16px'}},title),h('span',{class:'d',style:{color:'var(--ink-2)'}},txt),pill(ok.t,ok.c));
    // timeline
    const T=r.tOn, TL=r.tLate, Hh=st.H; const timeline=chartBox(el=>{ const W=W_(el,760),Hs=130,ml=20,mr=20; const X=lin(0,Math.max(Hh,TL*1.05),ml,W-mr); let g=`<line class="axis" x1="${ml}" x2="${W-mr}" y1="70" y2="70"/>`; for(let d=0;d<=Math.max(Hh,TL);d+=15) g+=`<line x1="${X(d)}" x2="${X(d)}" y1="66" y2="74" stroke="var(--ink-3)"/><text x="${X(d)}" y="92" text-anchor="middle">d${d}</text>`;
      g+=`<rect x="${X(0)}" y="40" width="${X(Hh)-X(0)}" height="12" rx="6" fill="var(--accent)" opacity=".18"/><text x="${X(0)}" y="34" style="fill:var(--ink-2)">Demand window (${Hh} d)</text>`;
      g+=`<circle cx="${X(3)}" cy="70" r="6" fill="var(--c-whole)"/><text x="${X(3)}" y="112" text-anchor="middle" style="fill:var(--ink)">Transfer lands</text>`;
      g+=`<rect x="${X(r.matLT)}" y="60" width="${X(T)-X(r.matLT)}" height="20" fill="var(--c4)" opacity=".7" rx="4"/><text x="${(X(r.matLT)+X(T))/2}" y="74" text-anchor="middle" style="fill:var(--bg);font-weight:600">production ${fmt.n(r.prodDays,0)} d</text>`;
      g+=`<rect x="${X(0)}" y="60" width="${X(r.matLT)-X(0)}" height="20" fill="var(--c-online)" opacity=".7" rx="4" transform="translate(0 0)"/><text x="${(X(0)+X(r.matLT))/2+20}" y="74" text-anchor="middle" style="fill:var(--bg);font-weight:600">materials ${fmt.n(r.matLT,0)} d</text>`;
      g+=`<line x1="${X(T)}" x2="${X(TL)}" y1="100" y2="100" stroke="var(--crit)" stroke-width="3" stroke-dasharray="3 3"/><text x="${X(TL)}" y="118" text-anchor="end" style="fill:var(--crit)">if materials slip → day ${fmt.n(TL,0)}</text>`; mountSvg(el,W,Hs+10,g); });
    out.replaceChildren(
      h('div',{class:'grid g4'},
        chk(1,'Demand',`+${fmt.n(r.E,0)} extra units over ${st.H} days across the chosen locations.`,{t:r.E>0?'Lift':'No lift',c:'info'}),
        chk(2,'Stock',`${fmt.n(r.totalGap,0)} units short after using on-hand stock in lifted locations.`,{t:r.totalGap>0?'Gap':'Covered',c:r.totalGap>0?'warn':'good'}),
        chk(3,'Transfers',`${fmt.n(r.moved,0)} units can move from other locations (keeping 120% of their own demand).`,{t:r.moved>=r.totalGap&&r.totalGap>0?'Closes gap':r.moved>0?'Partial':'None',c:r.moved>=r.totalGap?'good':r.moved>0?'warn':'crit'}),
        chk(4,'Production & materials',`${fmt.n(r.remaining,0)} units to make. ${r.bom.length} materials; slowest ${fmt.n(r.matLT,0)} d; on-time odds ${fmt.p(r.pOn,0)}.`,{t:r.tOn<st.H?'Can land in window':'Too slow',c:r.tOn<st.H?'good':'crit'})),
      card('Timeline','When each remedy can actually serve demand',timeline),
      card('Policy comparison','Extra gross profit vs doing nothing; low/high use the backtest P10/P90 demand error',h('div',null,table([{k:'k',label:'Policy'},{k:'sold',label:'Extra units sold',num:true,fmt:v=>fmt.n(v,0)},{k:'lost',label:'Units still lost',num:true,fmt:v=>fmt.n(v,0)},{k:'gp',label:'Extra GP',num:true,bar:true,fmt:v=>fmt.egp(v,1)},{k:'rng',label:'Range',num:true},{k:'cash',label:'Cash committed',num:true,fmt:v=>fmt.egp(v,1)},{k:'when',label:'Served from'},{k:'risk',label:'Main risk',wrap:true}],r.pol.map((p,i)=>({...p,rng:fmt.egp(lo.pol[i].gp,1)+' to '+fmt.egp(hi.pol[i].gp,1)})),{sortable:false}),h('div',{class:'callout',style:{marginTop:'12px'}},h('div',null,h('b',null,'Best on expected profit: '+best.k+'. '),`Gross profit per extra unit is ${fmt.egp(r.gpu,2)} (this product). ${best.k.includes('produce')&&r.pOn<.8?'Materials are the weak link: the chain depends on suppliers that deliver on time only '+fmt.p(r.pOn,0)+' of the time.':''} ${r.totalGap===0?'Existing stock already covers this lift.':''}`)),h('div',{style:{marginTop:'10px'}},saveBtn(()=>({t:'Decision chain · '+prodName(st.pi),s:`+${st.uplift}% demand, ${st.H} days; best policy ${best.k}`,low:lo.pol.find(p=>p.k===best.k).gp,high:hi.pol.find(p=>p.k===best.k).gp})))),{tag:'model + assumptions',tagClass:'assump'}),
      card('Materials on the critical path','Observed supplier reliability for this product\'s bill of materials',table([{k:'name',label:'Material',wrap:true},{k:'need',label:'Needed',num:true,fmt:v=>fmt.n(v,0)},{k:'lt',label:'Lead (d)',num:true,fmt:v=>fmt.n(v,1)},{k:'std',label:'Standard (d)',num:true},{k:'ot',label:'On-time',num:true,fmt:v=>fmt.p(v,0)},{k:'late',label:'Avg days late',num:true,fmt:v=>fmt.n(v,1)}],r.bom.map(b=>({name:b.m.name,need:b.per*r.remaining,lt:b.m.lt,std:b.m.std_lt,ot:b.m.ontime,late:b.m.late_avg})),{sortable:false}),{tag:'measured',tagClass:'measured'}));
  }
  draw();
};
/* ---- price & discount */
WIT.price=(body)=>{
  const B=baseCh(), el=D.discount_gov.elasticity, st=Object.assign({Online:0,Retail:0,Wholesale:0,e:'0',Online_e:0,Retail_e:0,Wholesale_e:0},store.get('priceP',{})); const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  const upd=k=>v=>{st[k]=v;store.set('priceP',st);draw();};
  body.append(card('Assumptions','Change in average discount by channel, and the volume response you want to assume (units per 1 pp of discount). Measured response is in the table below.',h('div',{class:'grid g3'},...CH.map(c=>h('div',{style:{display:'flex',flexDirection:'column',gap:'10px'}},h('b',null,c),slider('p-'+c,'Discount change',-15,10,0.5,st[c],' pp',upd(c)),slider('pe-'+c,'Volume response per pp',-1,4,0.1,st[c+'_e'],'%',upd(c+'_e'))))),{tag:'assumptions',tagClass:'assump'}),out);
  function calc(c,dpp,e){ const b=B[c], d0=1-b.ne/b.gr, d1=Math.max(0,d0+dpp/100), qf=1+e/100*(-dpp)*-1*-1; const q=1+(e/100)*(-dpp)*-1; /* more discount (dpp>0) -> more units when e>0 */ const qq=1+(e/100)*dpp; const ne=b.gr*(1-d1)*qq, cg=b.cg*qq, gp=ne-cg; return {ne,gp,q:b.q*qq,gm:gp/ne,d1}; }
  function draw(){ const rows=CH.map(c=>{ const b=B[c], s=calc(c,st[c],st[c+'_e']); const e=el.find(x=>x.channel===c); const lo=calc(c,st[c],e.lo*100), hi=calc(c,st[c],e.hi*100); const gp0=b.ne-b.cg; const be=st[c]!==0?((gp0/(calc(c,st[c],0).gp)-1)/st[c])*100:null; return {c,b,s,gp0,lo,hi,e,be}; });
    const tot0=sum(rows.map(r=>r.gp0)), tot1=sum(rows.map(r=>r.s.gp)), n0=sum(rows.map(r=>r.b.ne)), n1=sum(rows.map(r=>r.s.ne));
    out.replaceChildren(h('div',{class:'kpis'},h('div',{class:'kpi'},h('span',{class:'l'},'Gross profit, annual'),h('span',{class:'v'},fmt.egp(tot1)),h('span',{class:'d'},deltaEl(tot1,tot0),' vs baseline '+fmt.egp(tot0))),h('div',{class:'kpi'},h('span',{class:'l'},'Net sales'),h('span',{class:'v'},fmt.egp(n1)),h('span',{class:'d'},deltaEl(n1,n0))),h('div',{class:'kpi'},h('span',{class:'l'},'Gross margin'),h('span',{class:'v'},fmt.p(tot1/n1)),h('span',{class:'d'},deltaEl(tot1/n1,tot0/n0,{pp:true}))),h('div',{class:'kpi'},h('span',{class:'l'},'Units'),h('span',{class:'v'},fmt.n(sum(rows.map(r=>r.s.q)))),h('span',{class:'d'},deltaEl(sum(rows.map(r=>r.s.q)),sum(rows.map(r=>r.b.q)))))),
      card('By channel','Baseline vs scenario at your assumed response, and at the low / high end of the measured response',table([{k:'c',label:'Channel'},{k:'d0',label:'Discount now',num:true},{k:'d1',label:'Scenario',num:true},{k:'gp0',label:'GP baseline',num:true},{k:'gp1',label:'GP scenario',num:true},{k:'dgp',label:'Change',num:true,bar:true,fmt:v=>fmt.egp(v,2),barColor:'var(--good)'},{k:'meas',label:'At measured 95% range',num:true},{k:'be',label:'Break-even response',num:true,title:'Volume change per pp of discount at which gross profit is unchanged'}],rows.map(r=>({c:r.c,d0:fmt.p(1-r.b.ne/r.b.gr),d1:fmt.p(r.s.d1),gp0:fmt.egp(r.gp0,1),gp1:fmt.egp(r.s.gp,1),dgp:r.s.gp-r.gp0,meas:fmt.egp(r.lo.gp-r.gp0,1)+' to '+fmt.egp(r.hi.gp-r.gp0,1),be:r.be==null?'–':fmt.sp(r.be/100,1)+' per pp'})),{sortable:false}),{tag:'model',tagClass:'model'}),
      h('div',{class:'grid g2'},card('Measured price response','Fixed-effects regression, 36 months',table([{k:'c',label:'Channel'},{k:'b',label:'Units per 1 pp discount',num:true},{k:'ci',label:'95% interval',num:true}],el.map(e=>({c:e.channel,b:fmt.sp(e.beta,2),ci:fmt.sp(e.lo,1)+' to '+fmt.sp(e.hi,1)})),{sortable:false}),{tag:'measured',tagClass:'measured'}),
        card('How to read this','',h('p',{class:'note'},'Unit economics: COGS is a near-constant share of list price, so each point of discount removes more than one point of gross profit per unit sold at store and online margins, and more at wholesale margins. For deeper discounts to pay back, volume would have to rise by roughly the break-even figure per point. The measured response is statistically zero, so a cap is cheap to try and a deeper discount is not supported by the data.'))),
      saveBtn(()=>({t:'Pricing scenario',s:CH.map(c=>c+' '+(st[c]>=0?'+':'')+st[c]+'pp').join(' · '),low:Math.min(...rows.map(()=>0))+sum(rows.map(r=>r.lo.gp-r.gp0)),high:sum(rows.map(r=>r.hi.gp-r.gp0))})));
  } draw();
};
/* ---- demand shock */
WIT.shock=(body)=>{
  const st=Object.assign({Online:20,Retail:0,Wholesale:15,H:60},store.get('shockP',{})); const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}}); const upd=k=>v=>{st[k]=v;store.set('shockP',st);draw();};
  body.append(card('Demand change by channel','Applied to the forecast over the chosen horizon, then checked against stock, materials and the plant',h('div',{class:'grid g4'},...CH.map(c=>slider('sh-'+c,c,-30,80,5,st[c],'%',upd(c))),slider('sh-H','Horizon',30,90,30,st.H,' days',upd('H'))),{tag:'assumptions',tagClass:'assump'}),out);
  function draw(){ const L=[['Online','Online'],['Retail','Store'],['Wholesale','Wholesale']]; const per=INV.map(x=>{ const ch=Object.keys(LOC2CH).find(k=>k===x.l)&&LOC2CH[x.l]; const dm=winDem(x.fm,st.H)*(1+st[ch]/100); const short=Math.max(0,dm-x.stock); return {x,dm,short,gp:short*(x.nu?x.nu-x.uc:0)}; });
    const byL=LOCS.map(l=>{ const a=per.filter(p=>p.x.l===l); return {l,demand:sum(a.map(p=>p.dm)),short:sum(a.map(p=>p.short)),skus:a.filter(p=>p.short>0).length,gp:sum(a.map(p=>p.gp))}; });
    const need={}; per.forEach(p=>{ (D.bom[p.x.p]||[]).forEach(([mi,per_])=>{ need[mi]=(need[mi]||0)+p.short*per_; }); });
    const mats=D.procurement.materials.map((m,i)=>({m,need:need[i]||0,mo:m.accepted_ltm/12})).filter(r=>r.need>0).map(r=>({name:r.m.name,need:r.need,mo:r.mo,share:r.need/r.mo,lt:r.m.lt,ot:r.m.ontime}));
    const tot=sum(byL.map(b=>b.short)), plantMo=D.factory.ltm.good/12;
    out.replaceChildren(h('div',{class:'kpis'},h('div',{class:'kpi'},h('span',{class:'l'},'Units short, all locations'),h('span',{class:'v'},fmt.n(tot,0)),h('span',{class:'d'},fmt.p(sum(byL.map(b=>b.short))/sum(byL.map(b=>b.demand)),0)+' of scenario demand')),h('div',{class:'kpi'},h('span',{class:'l'},'Gross profit at risk'),h('span',{class:'v'},fmt.egp(sum(byL.map(b=>b.gp)))),h('span',{class:'d'},'if nothing is replenished')),h('div',{class:'kpi'},h('span',{class:'l'},'Plant headroom'),h('span',{class:'v'},fmt.p(tot/plantMo,1)),h('span',{class:'d'},'of one month of factory output ('+fmt.n(plantMo,0)+' units)'))),
      h('div',{class:'grid g2'},card('Shortfall by location','Units short over the horizon',chartBox(el=>barChart(el,{items:byL.map(b=>({label:b.l,value:b.short,color:LOCCOL[b.l],text:fmt.n(b.short,0)+' · '+b.skus+' SKUs',tip:tipRows(b.l,[['Scenario demand',fmt.n(b.demand,0)],['Short units',fmt.n(b.short,0)],['SKUs short',b.skus],['GP at risk',fmt.egp(b.gp)]])})),fmt:v=>fmt.n(v),labelW:100,rightW:130,rowH:36}))),
        card('Materials needed to close the gap','Compared with an average month of accepted purchases',table([{k:'name',label:'Material',wrap:true},{k:'need',label:'Needed',num:true,fmt:v=>fmt.n(v,0)},{k:'share',label:'vs monthly buy',num:true,fmt:v=>fmt.p(v,1)},{k:'lt',label:'Lead (d)',num:true,fmt:v=>fmt.n(v,1)},{k:'ot',label:'On-time',num:true,fmt:v=>fmt.p(v,0)}],mats,{sortable:false}))),
      h('p',{class:'note'},'Replenishment is assumed to start at the beginning of the horizon and ignores stock already on order (not in the data). The plant is not the constraint: sales volumes are a small share of recorded factory output (see Data Trust).'));
  } draw();
};
/* ---- supplier shift */
WIT.supplier=(body)=>{
  const st=Object.assign({shift:30},store.get('supP',{})); const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}}); const M_=D.procurement.matrix; const mats=D.procurement.materials; const P=D.procurement;
  body.append(card('Move volume away from the two weakest suppliers','Share of their purchase orders re-assigned to the three most reliable suppliers per material',h('div',{class:'grid g3'},slider('sp-s','Volume moved',0,100,5,st.shift,' %',v=>{st.shift=v;store.set('supP',st);draw();})),{tag:'assumptions',tagClass:'assump'}),out);
  function draw(){ const donors=new Set(D.procurement.suppliers.slice().sort((a,b)=>a.ontime-b.ontime).slice(0,2).map(x=>x.id)); const rows=M_.map(r=>({s:r[0],m:r[1],n:r[2],ot:r[3],px:r[4]})); const byM={}; rows.forEach(r=>(byM[r.m]=byM[r.m]||[]).push(r));
    const before={n:0,ot:0,px:0}, after={n:0,ot:0,px:0}; let movedPO=0; const permat=[];
    for(const [m,rs] of Object.entries(byM)){ const don=rs.filter(r=>donors.has(r.s)), rec=rs.filter(r=>!donors.has(r.s)).sort((a,b)=>b.ot-a.ot).slice(0,3); const mv=don.reduce((a,r)=>a+r.n,0)*st.shift/100; movedPO+=mv; const nn=new Map(rs.map(r=>[r.s,r.n]));
      don.forEach(r=>nn.set(r.s,r.n*(1-st.shift/100))); rec.forEach(r=>nn.set(r.s,nn.get(r.s)+mv/rec.length));
      let b0=0,o0=0,p0=0,b1=0,o1=0,p1=0; rs.forEach(r=>{ b0+=r.n;o0+=r.n*r.ot;p0+=r.n*r.px; const k=nn.get(r.s); b1+=k;o1+=k*r.ot;p1+=k*r.px; });
      before.n+=b0;before.ot+=o0;before.px+=p0;after.n+=b1;after.ot+=o1;after.px+=p1; permat.push({m:mats.find(x=>x.id===m).name,ot0:o0/b0,ot1:o1/b1,px0:p0/b0,px1:p1/b1}); }
    const ot0=before.ot/before.n, ot1=after.ot/after.n, px0=before.px/before.n, px1=after.px/after.n, spend=P.totals.spend_ltm, dcost=spend*(px1/px0-1);
    out.replaceChildren(h('div',{class:'kpis'},h('div',{class:'kpi'},h('span',{class:'l'},'Portfolio on-time rate'),h('span',{class:'v'},fmt.p(ot1)),h('span',{class:'d'},deltaEl(ot1,ot0,{pp:true}),' from '+fmt.p(ot0))),h('div',{class:'kpi'},h('span',{class:'l'},'Price index (spend-weighted)'),h('span',{class:'v'},px1.toFixed(3)),h('span',{class:'d'},deltaEl(px1,px0,{inv:true}),' from '+px0.toFixed(3))),h('div',{class:'kpi'},h('span',{class:'l'},'Cost effect, LTM spend'),h('span',{class:'v'},fmt.egp(dcost)),h('span',{class:'d'},'on '+fmt.egp(spend,0)+' of purchases')),h('div',{class:'kpi'},h('span',{class:'l'},'POs re-assigned'),h('span',{class:'v'},fmt.n(movedPO,0)),h('span',{class:'d'},'of '+fmt.n(before.n)+' in 36 months'))),
      card('By material','On-time rate and price index before and after',table([{k:'m',label:'Material'},{k:'ot0',label:'On-time now',num:true,fmt:v=>fmt.p(v,0)},{k:'ot1',label:'After',num:true,fmt:v=>fmt.p(v,0)},{k:'d',label:'Change',num:true,bar:true,fmt:v=>fmt.pp(v,1),barColor:'var(--good)'},{k:'px0',label:'Price idx now',num:true,fmt:v=>v.toFixed(3)},{k:'px1',label:'After',num:true,fmt:v=>v.toFixed(3)}],permat.map(p=>({...p,d:p.ot1-p.ot0})),{sortable:false,max:12}),{tag:'model',tagClass:'model'}),
      h('p',{class:'note'},'Assumes alternatives keep the performance they showed on the volume they already handle. Qualification, capacity and contract terms are not in the data. Price index = unit cost ÷ same-material, same-quarter median. Cost effect uses PO-count weights, so treat it as a direction, not a quote.'),saveBtn(()=>({t:'Supplier shift '+st.shift+'%',s:'On-time '+fmt.p(ot0)+' → '+fmt.p(ot1),low:Math.min(0,-dcost),high:Math.max(0,-dcost)})));
  } draw();
};
/* ---- marketing optimizer */
function optimizeMkt(pl,{budget,lo,hi,hair}){
  /* maximise sum R_p (S_p/S0_p)^b_p * hair  s.t. sum S_p = budget, lo*S0<=S<=hi*S0. Greedy on marginal return; exact for concave, corner-correct for convex. */
  const S=pl.map(p=>p.s0*lo), cap=pl.map(p=>p.s0*hi); let rem=budget-sum(S); const step=budget/400; let guard=0;
  while(rem>1e-6&&guard++<5000){ let bi=-1,bm=-1; pl.forEach((p,i)=>{ if(S[i]>=cap[i]-1e-6) return; const m=p.r0*p.b*Math.pow(S[i]/p.s0,p.b-1)/p.s0*hair; if(m>bm){bm=m;bi=i;} }); if(bi<0) break; const t=Math.min(step,rem,cap[bi]-S[bi]); S[bi]+=t; rem-=t; }
  return S;
}
WIT.mkt=(body)=>{
  const Mk=D.marketing, st=Object.assign({budget:0,lo:50,hi:200,hair:Math.round(Mk.recon.haircut*100)},store.get('mktP',{})); const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}}); const upd=k=>v=>{st[k]=v;store.set('mktP',st);draw();};
  const pl=Mk.platforms.map(p=>({p:p.p,s0:p.spend_ltm,r0:p.rev_ltm,b:Math.min(p.b,1.3),bse:p.b_se,roas:p.rev_ltm/p.spend_ltm})); const B0=sum(pl.map(p=>p.s0));
  body.append(card('Objective and constraints','Maximise D2C gross profit from marketing, subject to the total budget and each platform staying within a band of its current spend',h('div',{class:'grid g4'},slider('mk-b','Total budget vs now',-30,50,5,st.budget,'%',upd('budget')),slider('mk-lo','Minimum per platform',0,100,10,st.lo,'% of now',upd('lo')),slider('mk-hi','Maximum per platform',100,400,25,st.hi,'% of now',upd('hi')),slider('mk-h','Credit given to reported revenue',10,100,5,st.hair,'%',upd('hair'))),{tag:'optimiser',tagClass:'model'}),out);
  function draw(){ const budget=B0*(1+st.budget/100), hair=st.hair/100, gm=Mk.recon.d2c_gm; const S=optimizeMkt(pl,{budget,lo:st.lo/100,hi:st.hi/100,hair}); const rev=(S_)=>pl.map((p,i)=>p.r0*Math.pow(S_[i]/p.s0,p.b)*hair); const R1=rev(S), R0=rev(pl.map(p=>p.s0)); const gp0=sum(R0)*gm-B0, gp1=sum(R1)*gm-budget;
    out.replaceChildren(h('div',{class:'kpis'},h('div',{class:'kpi'},h('span',{class:'l'},'Credited revenue'),h('span',{class:'v'},fmt.egp(sum(R1))),h('span',{class:'d'},deltaEl(sum(R1),sum(R0)),' vs now '+fmt.egp(sum(R0)))),h('div',{class:'kpi'},h('span',{class:'l'},'Marketing profit (GP − spend)'),h('span',{class:'v'},fmt.egp(gp1)),h('span',{class:'d'},'now '+fmt.egp(gp0))),h('div',{class:'kpi'},h('span',{class:'l'},'Break-even ROAS'),h('span',{class:'v'},fmt.x(1/gm)),h('span',{class:'d'},'at '+fmt.p(gm)+' D2C gross margin')),h('div',{class:'kpi'},h('span',{class:'l'},'Blended MER now'),h('span',{class:'v'},fmt.x(Mk.recon.mer)),h('span',{class:'d'},'does not rely on attribution'))),
      h('div',{class:'grid g2'},card('Spend by platform','Current (LTM) vs optimised',chartBox(el=>colChart(el,{x:pl.map(p=>p.p),series:[{name:'Current',color:'var(--ink-3)',values:pl.map(p=>p.s0)},{name:'Optimised',color:'var(--accent)',values:S}],fmt:byFmt.c,h:240}))),
        card('Platform response','Reported ROAS, response elasticity b (revenue ∝ spend^b), and credited ROAS',table([{k:'p',label:'Platform'},{k:'roas',label:'Reported ROAS',num:true,fmt:v=>fmt.x(v)},{k:'cred',label:'Credited ROAS',num:true,fmt:v=>fmt.x(v)},{k:'b',label:'b ± se',num:true},{k:'s0',label:'Spend now',num:true,fmt:v=>fmt.egp(v,2)},{k:'s1',label:'Optimised',num:true,fmt:v=>fmt.egp(v,2)}],pl.map((p,i)=>({p:p.p,roas:p.roas,cred:p.roas*hair,b:p.b.toFixed(2)+' ± '+p.bse.toFixed(2),s0:p.s0,s1:S[i]})),{sortable:false}))),
      h('div',{class:'callout warn'},h('div',null,h('b',null,'Read with care. '),`Revenue here is what platforms claim, and claims add up to ${fmt.x(Mk.recon.ratio_rev)} actual D2C sales. The credit slider scales it (default ${fmt.p(Mk.recon.haircut,0)} makes the total match actual sales). Response elasticities are close to 1 for most platforms, so the optimiser mostly ranks platforms by ROAS and cannot show saturation. Treat the result as a hypothesis for a holdout test.`)),
      saveBtn(()=>({t:'Marketing reallocation',s:'Budget '+(st.budget>=0?'+':'')+st.budget+'%, credit '+st.hair+'%',low:gp1-gp0,high:gp1-gp0})));
  } draw();
};
/* ---- capacity & delay */
WIT.cap=(body)=>{
  const Fa=D.factory, st=Object.assign({close:50,ot:0},store.get('capP',{})); const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}}); const upd=k=>v=>{st[k]=v;store.set('capP',st);draw();};
  body.append(card('Levers','Closing part of the sewing gap, and moving orders out of heavy-overtime bands',h('div',{class:'grid g3'},slider('cp-c','Close this much of the sewing delay gap',0,100,10,st.close,'%',upd('close')),slider('cp-o','Orders moved out of 10h+ overtime',0,50,5,st.ot,'%',upd('ot'))),{tag:'assumptions',tagClass:'assump'}),out);
  function draw(){ const bn=Fa.bottlenecks, sew=bn.find(b=>b.bn==='Sewing'), oth=avg(bn.filter(b=>['Cutting','Printing','Packing'].includes(b.bn)).map(b=>b.delay)); const ordersLtm=Fa.ltm.n, sewShare=sew.n/Fa.all.n, flagged=ordersLtm*sewShare; const saved=flagged*(sew.delay-oth)*st.close/100;
    const ot=Fa.ot_bins, hi=ot[3].n+ot[4].n, moved=hi*st.ot/100, dLate=(ot[3].late-ot[2].late)*moved/Fa.all.n*ordersLtm; const lateNow=Fa.ltm.late*ordersLtm;
    out.replaceChildren(h('div',{class:'kpis'},h('div',{class:'kpi'},h('span',{class:'l'},'Sewing-flagged orders per year'),h('span',{class:'v'},fmt.n(flagged,0)),h('span',{class:'d'},'avg delay '+fmt.n(sew.delay,1)+' d vs '+fmt.n(oth,1)+' d other stages')),h('div',{class:'kpi'},h('span',{class:'l'},'Delay days avoided'),h('span',{class:'v'},fmt.n(saved,0)),h('span',{class:'d'},'per year, from the sewing lever')),h('div',{class:'kpi'},h('span',{class:'l'},'Late orders avoided'),h('span',{class:'v'},fmt.n(dLate,0)),h('span',{class:'d'},'of '+fmt.n(lateNow,0)+' late orders a year (association only)'))),
      card('Late-order rate by overtime band','Orders in heavy overtime are late far more often. Overtime is probably a response to lateness, so this is an association, not proof that cutting overtime prevents delay.',chartBox(el=>colChart(el,{x:ot.map(o=>o.b),series:[{name:'Late orders',color:'var(--crit)',values:ot.map(o=>o.late)}],fmt:byFmt.pct,h:220})),{tag:'measured',tagClass:'measured'}),
      h('p',{class:'note'},'Factory data is historical orders, downtime events and print batches. There is no live machine feed, so this is a planning calculator, not a digital twin.'));
  } draw();
};
