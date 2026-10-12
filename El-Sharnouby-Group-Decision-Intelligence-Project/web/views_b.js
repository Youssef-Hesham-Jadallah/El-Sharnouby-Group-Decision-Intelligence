/* ===== Views B: Inventory, Rebalancing ===== */
const INV = D.inventory.rows, LOCS=['Wholesale','Online','Store'], LOCCOL={Wholesale:'var(--c-whole)',Online:'var(--c-online)',Store:'var(--c-retail)'};
const LOC2CH={Wholesale:'Wholesale',Online:'Online',Store:'Retail'};
const STAT_CLS={'Stockout risk':'crit','Overstock':'warn','Healthy':'good'};
function skuHist(pi,ch){ const out=Array(36).fill(0); for(const r of CB){ if(r[2]===pi&&CH[r[1]]===ch) out[r[0]]+=r[3]; } return out; }
function rebalanceJS(rows,{keep=120,transport=4,allow={'Store>Wholesale':true,'Online>Wholesale':true,'Wholesale>Online':false,'Wholesale>Store':false,'Online>Store':false,'Store>Online':false}}={}){
  const byP=new Map(); rows.forEach(x=>{ if(!byP.has(x.p)) byP.set(x.p,[]); byP.get(x.p).push(x); }); const T=[];
  for(const [p,rs] of byP){ const info={}; rs.forEach(x=>{ const dd90=x.f90/91.2, keepU=Math.max(x.tgt,dd90*keep), dLT=x.f30/30.4*x.lt; info[x.l]={x,surplus:Math.max(0,x.stock-keepU),deficit:Math.max(0,x.tgt-x.stock),shortage:Math.max(0,dLT-x.stock)}; });
    const donors=Object.entries(info).filter(([k,v])=>v.surplus>=1).sort((a,b)=>b[1].surplus-a[1].surplus), recv=Object.entries(info).filter(([k,v])=>v.deficit>=1).sort((a,b)=>b[1].deficit-a[1].deficit);
    for(const [rk,rv] of recv){ let need=rv.deficit; for(const [dk,dv] of donors){ if(dk===rk||need<1||!allow[dk+'>'+rk]) continue; const q=Math.floor(Math.min(dv.surplus,need)); if(q<1) continue; dv.surplus-=q; need-=q; const cov=Math.min(q,rv.shortage); rv.shortage-=cov; const u=rv.x; const gpu=u.nu?u.nu-u.uc:0;
      T.push({p,frm:dk,to:rk,qty:q,short_cov:cov,value:q*dv.x.uc,gp_unit:gpu,lost_gp:cov*gpu,cost:q*transport}); } } }
  return T;
}
/* ---------- Inventory */
VIEWS.inventory=()=>{
  const S=D.inventory.summary, wrap=h('div',{class:'page'}), tr=D.inventory.trend; const ix=store.get('invProduct',null);
  const risk=INV.filter(x=>x.status==='Stockout risk'), over=INV.filter(x=>x.status==='Overstock');
  const wh=INV.filter(x=>x.l==='Wholesale');
  wrap.append(pageHead('inventory','What should move, where, and when',`Stock is <strong>observed</strong> (Sep 2026 snapshot), demand is <strong>forecast</strong> (seasonal-naive × growth, validated by backtest), and order quantities are <strong>recommended</strong> by explicit rules. Open production and purchase orders for finished goods are not in the data, so recommendations assume none are in transit.`));
  wrap.append(four({
    now:`<strong>${fmt.n(sum(INV.map(x=>x.stock)))}</strong> units worth <strong>${fmt.egp(S.total_value)}</strong>. ${risk.length} SKU-locations are at stock-out risk (${S.by_loc.Wholesale.risk} at the wholesale desk); ${over.length} are overstocked.`,
    why:`Wholesale holds ${fmt.n(S.by_loc.Wholesale.cover_med,0)} days of forecast cover and ran ${S.by_loc.Wholesale.so12} SKU stock-out days in 12 months. Store and online carry ${fmt.n(S.by_loc.Store.cover_med,0)}–${fmt.n(S.by_loc.Online.cover_med,0)} days, enough for most of a year.`,
    next:`Wholesale needs about <strong>${fmt.n(S.by_loc.Wholesale.rec_units)}</strong> more units over its lead time plus 30 days. D2C demand is small in total compared with wholesale.`,
    do:`Replenish the ${S.by_loc.Wholesale.risk} wholesale SKUs first, freeze D2C replenishment above 180 days, and move surplus (see Stock Rebalancing).`}));
  wrap.append(h('div',{class:'kpis'},
    ...LOCS.map(l=>h('div',{class:'kpi'},h('span',{class:'l'},l+' stock'),h('span',{class:'v'},fmt.n(S.by_loc[l=='Store'?'Store':l].units)),h('span',{class:'d'},fmt.egp(S.by_loc[l].value,1)+' · cover '+fmt.n(S.by_loc[l].cover_med,0)+' d'),sparkSvg(tr[l].close,{color:LOCCOL[l]}))),
    h('div',{class:'kpi'},h('span',{class:'l'},'Excess above 120 days'),h('span',{class:'v'},fmt.egp(S.excess_value)),h('span',{class:'d'},fmt.n(S.excess_units)+' units · '+fmt.p(S.excess_value/S.total_value,0)+' of stock value')) ));
  // status by location
  const cnt=l=>['Stockout risk','Healthy','Overstock'].map(s=>INV.filter(x=>x.l===l&&x.status===s).length);
  wrap.append(h('div',{class:'grid g2'},
    card('Stock health by location','Number of SKUs in each state (cover measured against forecast demand)',h('div',null,legend([{name:'Stock-out risk',color:'var(--crit)'},{name:'Healthy',color:'var(--good)'},{name:'Overstock (>150 d)',color:'var(--warn)'}]),chartBox(el=>{ const items=LOCS.map(l=>({l,c:cnt(l)})); colChart(el,{x:LOCS,series:[{name:'Stock-out risk',color:'var(--crit)',values:items.map(i=>i.c[0])},{name:'Healthy',color:'var(--good)',values:items.map(i=>i.c[1])},{name:'Overstock',color:'var(--warn)',values:items.map(i=>i.c[2])}],stack:true,h:230,fmt:v=>fmt.n(v)}); })),{tag:'measured + forecast',tagClass:'model'}),
    card('Stock-out days per month','All SKUs summed; wholesale is where service fails',chartBox(el=>lineChart(el,{x:MONTHS.map((_,i)=>fmt.mo(i)),series:LOCS.map(l=>({name:l,color:LOCCOL[l],values:tr[l].so})),fmt:byFmt.num,h:230,zero:true})),{tag:'measured',tagClass:'measured'})));
  // service vs cost
  const zs=[[.85,1.04],[.90,1.28],[.95,1.645],[.975,1.96],[.99,2.33]]; const ssv=z=>sum(INV.map(x=>z*x.sig*Math.sqrt(Math.max(x.lt,1)/30.4)*x.uc));
  const abc={A:{X:0,Y:0,Z:0},B:{X:0,Y:0,Z:0},C:{X:0,Y:0,Z:0}}; const seen=new Set(); INV.forEach(x=>{ if(seen.has(x.p)) return; seen.add(x.p); abc[x.abc][x.xyz]++; });
  wrap.append(h('div',{class:'grid g2'},
    card('Service level vs safety-stock cost','Safety stock = z × forecast error × √(lead time). Higher service costs more cash.',h('div',null,chartBox(el=>lineChart(el,{x:zs.map(z=>fmt.p(z[0],1)),series:[{name:'Safety-stock value',color:'var(--accent)',values:zs.map(z=>ssv(z[1])),area:true}],fmt:byFmt.c,h:210,zero:true,xticks:5})),h('p',{class:'note'},`Current model setting 95% needs ${fmt.egp(ssv(1.645),1)} of safety stock across all SKU-locations; the stock system holds ${fmt.egp(sum(INV.map(x=>x.ss*x.uc)),1)}.`)),{tag:'model',tagClass:'model'}),
    card('ABC × XYZ portfolio','A = top 80% of LTM sales, X = steady demand (CV ≤ 0.5).',chartBox(el=>heat(el,{rows:['A','B','C'],cols:['X steady','Y variable','Z erratic'],vals:['A','B','C'].map(a=>['X','Y','Z'].map(z=>abc[a][z])),fmt:v=>fmt.n(v),cw:96,ch:44,lw:30,domain:[0,Math.max(...['A','B','C'].flatMap(a=>Object.values(abc[a])))]})),{tag:'measured',tagClass:'measured'})));
  // replenishment table
  const locSel=h('select',{id:'invloc','aria-label':'Location'},h('option',{value:'All'},'All locations'),LOCS.map(l=>h('option',{value:l},l))), stSel=h('select',{id:'invst','aria-label':'Status'},h('option',{value:'All'},'All statuses'),['Stockout risk','Overstock','Healthy'].map(s=>h('option',{value:s},s)));
  const tblHost=h('div'); const drawT=()=>{ const rows=INV.filter(x=>(locSel.value==='All'||x.l===locSel.value)&&(stSel.value==='All'||x.status===stSel.value)).map(x=>({...x,name:shortName(x.p,36)}));
    tblHost.replaceChildren(table([{k:'name',label:'Product',wrap:true},{k:'l',label:'Location'},{k:'stock',label:'Stock',num:true,fmt:v=>fmt.n(v)},{k:'cover',label:'Cover (d)',num:true,title:'Stock ÷ forecast daily demand',fmt:v=>v>=999?'999+':fmt.n(v,0)},{k:'f30',label:'Fcst 30d',num:true,fmt:v=>fmt.n(v,0)},{k:'f90',label:'Fcst 90d',num:true,fmt:v=>fmt.n(v,0)},{k:'lt',label:'Lead (d)',num:true},{k:'ss',label:'SS system',num:true,title:'Safety stock held in the stock system'},{k:'ssm',label:'SS model',num:true,fmt:v=>fmt.n(v,0),title:'95% service, from backtest error'},{k:'rec',label:'Order qty',num:true,bar:true,fmt:v=>fmt.n(v),barColor:'var(--c-whole)'},{k:'status',label:'Status',render:r=>pill(r.status,STAT_CLS[r.status]),sortv:r=>r.status},{k:'abc',label:'ABC'}],rows,{max:12,onrow:r=>{store.set('invProduct',r.p);render();} })); };
  locSel.onchange=drawT; stSel.onchange=drawT; drawT();
  wrap.append(card('Replenishment plan','Order qty = forecast demand over (lead time + 30 days) + safety stock − stock on hand. Click a row for the product view.',h('div',{style:{display:'flex',flexDirection:'column',gap:'10px'}},h('div',{style:{display:'flex',gap:'8px'}},locSel,stSel),tblHost),{tag:'recommended',tagClass:'assump'}));
  // product drill
  const sel=h('select',{id:'invprod','aria-label':'Product',onchange:e=>{store.set('invProduct',+e.target.value);render();}},PRODUCTS.map((p,i)=>h('option',{value:i,selected:i===(ix??0)},prodName(i))));
  const pi=ix??0; const rowsP=INV.filter(x=>x.p===pi); const fut=D.forecast.meta.months_future; const fl=[...MONTHS.slice(-18).map((_,i)=>fmt.mo(18+i)),...fut.map(m=>fmt.moFull(35)&&(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m.slice(5)-1]+" '"+m.slice(2,4)))];
  const ser=[]; rowsP.forEach(x=>{ const ch=LOC2CH[x.l]; const hst=skuHist(pi,ch).slice(-18); const q=D.forecast.meta.ratio_q[ch]; ser.push({name:x.l+' actual',color:LOCCOL[x.l],values:[...hst,...Array(6).fill(null)]},{name:x.l+' forecast',color:LOCCOL[x.l],dash:'5 4',values:[...Array(17).fill(null),hst[17],...x.fm]}); });
  const w1=ser.filter(s=>s.name.startsWith('Wholesale')), d2c=ser.filter(s=>!s.name.startsWith('Wholesale'));
  wrap.append(section('Product view',prodName(pi)+' · '+PRODUCTS[pi].family+' · EGP '+PRODUCTS[pi].price+' list'));
  wrap.append(h('div',{class:'grid g21'},card('Demand history and forecast','Units per month, 18 months of history and 6 months of forecast',h('div',null,h('div',{style:{display:'flex',gap:'8px',marginBottom:'8px'}},sel),legend(rowsP.map(x=>({name:x.l,color:LOCCOL[x.l]}))),chartBox(el=>lineChart(el,{x:fl,series:ser,fmt:byFmt.c,h:260,zero:true,xticks:8,marks:[{i:17.5,label:'forecast →'}]}))),{tag:'model',tagClass:'model'}),
    card('This product by location','Stock, cover and the recommendation',table([{k:'l',label:'Location'},{k:'stock',label:'Stock',num:true},{k:'cover',label:'Cover d',num:true,fmt:v=>v>=999?'999+':fmt.n(v,0)},{k:'f90',label:'Fcst 90d',num:true,fmt:v=>fmt.n(v,0)},{k:'rec',label:'Order',num:true},{k:'status',label:'Status',render:r=>pill(r.status,STAT_CLS[r.status])}],rowsP,{sortable:false}))));
  wrap.append(lineage({tables:'Inventory · Sales',from:['marketing','customers','channels'],to:['rebalance','factory','whatif'],note:'Forecast intervals (P10–P90) multiply the point forecast by 0.55–1.45 on average; SKU-level error is higher than channel-level error.'}));
  return wrap;
};
/* ---------- Rebalancing */
VIEWS.rebalance=()=>{
  const wrap=h('div',{class:'page'}); const st=Object.assign({keep:120,transport:4,cap:20,s2w:true,o2w:true,w2d:false},store.get('rebParams',{}));
  const out=h('div',{style:{display:'flex',flexDirection:'column',gap:'16px'}});
  const ctl=(id,label,min,max,step,val,unit)=>h('div',{class:'field'},h('label',{for:id},label,h('output',{id:id+'o'},val+unit)),h('input',{type:'range',id,min,max,step,value:val,oninput:e=>{st[id]=+e.target.value;$('#'+id+'o').textContent=e.target.value+unit;store.set('rebParams',st);draw();}}));
  const chk=(id,label)=>h('label',{style:{display:'flex',gap:'8px',alignItems:'center',fontSize:'13px'}},h('input',{type:'checkbox',id,checked:st[id],onchange:e=>{st[id]=e.target.checked;store.set('rebParams',st);draw();}}),label);
  function draw(){
    const allow={'Store>Wholesale':st.s2w,'Online>Wholesale':st.o2w,'Wholesale>Online':st.w2d,'Wholesale>Store':st.w2d,'Online>Store':st.w2d,'Store>Online':st.w2d};
    const T=rebalanceJS(INV,{keep:st.keep,transport:st.transport,allow}); const units=sum(T.map(t=>t.qty)), value=sum(T.map(t=>t.value)), cov=sum(T.map(t=>t.short_cov)), lgp=sum(T.map(t=>t.lost_gp)), cost=sum(T.map(t=>t.cost)), carry=value*st.cap/100*(st.keep/365);
    const wh=INV.filter(x=>x.l==='Wholesale'), gap=sum(wh.map(x=>x.rec)), S=D.inventory.summary, exc=S.excess_units, excV=S.excess_value;
    const names=new Map(); T.forEach(t=>{ const k=t.p; const o=names.get(k)||{p:k,qty:0,value:0,from:new Set(),cov:0}; o.qty+=t.qty;o.value+=t.value;o.from.add(t.frm);o.cov+=t.short_cov; names.set(k,o); });
    const top=[...names.values()].sort((a,b)=>b.qty-a.qty);
    const net=lgp+carry-cost;
    out.replaceChildren(
      h('div',{class:'kpis'},
        h('div',{class:'kpi'},h('span',{class:'l'},'Units to move'),h('span',{class:'v'},fmt.n(units)),h('span',{class:'d'},T.length+' transfer lines · '+top.length+' products')),
        h('div',{class:'kpi'},h('span',{class:'l'},'Stock value moved'),h('span',{class:'v'},fmt.egp(value)),h('span',{class:'d'},'cash not spent on new production')),
        h('div',{class:'kpi'},h('span',{class:'l'},'Shortfall avoided'),h('span',{class:'v'},fmt.n(cov,0)+' units'),h('span',{class:'d'},'sales lost before replenishment lands: '+fmt.egp(lgp,2)+' GP')),
        h('div',{class:'kpi'},h('span',{class:'l'},'Transfer cost'),h('span',{class:'v'},fmt.egp(cost)),h('span',{class:'d'},'assumed EGP '+st.transport+' per unit')),
        h('div',{class:'kpi'},h('span',{class:'l'},'Net annual benefit'),h('span',{class:'v'},fmt.egp(net)),h('span',{class:'d'},'GP avoided + carrying cost saved − transport'))),
      h('div',{class:'grid g2'},
        card('What rebalancing can and cannot fix','Units, current snapshot',chartBox(el=>barChart(el,{items:[{label:'Wholesale shortfall (to order)',value:gap,color:'var(--c-whole)'},{label:'…covered by transfers',value:units,color:'var(--good)'},{label:'…left for production',value:Math.max(0,gap-units),color:'var(--crit)'},{label:'D2C excess stock',value:exc,color:'var(--warn)'},{label:'…absorbed by wholesale',value:units,color:'var(--good)'},{label:'…still excess',value:Math.max(0,exc-units),color:'var(--warn)'}],fmt:v=>fmt.n(v),labelW:200,rightW:80,rowH:28})),{tag:'recommended',tagClass:'assump'}),
        card('Transfers by product','Top 12 by units. Donor location shown.',table([{k:'name',label:'Product',wrap:true},{k:'from',label:'From'},{k:'qty',label:'Units',num:true,bar:true,fmt:v=>fmt.n(v)},{k:'value',label:'Value',num:true,fmt:v=>fmt.egp(v,1)},{k:'cov',label:'Shortfall avoided',num:true,fmt:v=>fmt.n(v,0)}],top.map(o=>({...o,name:shortName(o.p,34),from:[...o.from].join(' + ')})),{max:12,onrow:r=>{store.set('invProduct',r.p);go('inventory');}}),{tag:'recommended',tagClass:'assump'})),
      h('div',{class:'callout warn'},h('div',null,h('b',null,'Reading this honestly. '),`Transfers cover ${fmt.p(units/Math.max(gap,1),0)} of the wholesale gap because surplus SKUs rarely match the deficit SKUs. About ${fmt.n(Math.max(0,exc-units))} excess D2C units (${fmt.egp(Math.max(0,excV-value),1)}) cannot be absorbed by wholesale and need a different plan: stop replenishing, or test a markdown (discount depth has shown no measurable volume response, so a markdown is unproven).`))
    );
  }
  wrap.append(pageHead('rebalance','Use the stock you already have before making more',`The tool finds SKUs where one location holds more than it needs for its own forecast and another is short, then proposes transfers. It recommends nothing it cannot support: transfers need a surplus <em>and</em> a deficit on the same product, and transport cost and transit time are assumptions you can change. Whether wholesale and D2C stock can physically move between channels is <strong>not in the data</strong> and must be confirmed.`));
  wrap.append(four({now:'Wholesale is short on many SKUs while store and online hold surplus on most others.',why:'Surplus sits on different products from the shortages, so only part of the gap is closable by moving stock.',next:'Without action, wholesale keeps recording stock-out days while D2C stock ages into the next season.',do:'Approve the transfers below, order the remaining wholesale units, and stop replenishing SKUs above 180 days of cover.'}));
  wrap.append(card('Assumptions','Defaults are marked as assumptions; change them and every number updates',h('div',{class:'grid g4'},ctl('keep','Days of cover the donor keeps',60,240,10,st.keep,' d'),ctl('transport','Transport cost per unit',0,20,1,st.transport,' EGP'),ctl('cap','Cost of capital',0,40,1,st.cap,' %'),h('div',{class:'field'},h('div',{class:'lab'},'Allowed directions'),chk('s2w','Store → Wholesale'),chk('o2w','Online → Wholesale'),chk('w2d','Wholesale → D2C'))),{tag:'assumptions',tagClass:'assump'}),out);
  draw();
  wrap.append(lineage({tables:'Inventory · forecast · Sales (unit price & cost)',from:['inventory','channels'],to:['whatif','decisions'],note:'Transit time is ignored when sizing transfers; a 3-day transit would reduce the shortfall avoided by under 10%.'}));
  return wrap;
};
