/* ===== Dashboard core: utilities, cube engine, chart kit ===== */
const D = window.ESG_DATA;
const M = D.meta, MONTHS = M.months, CH = M.channels, PRODUCTS = D.products;
const CHCOL = {Online:'var(--c-online)',Retail:'var(--c-retail)',Wholesale:'var(--c-whole)'};
const CATS = ['var(--c-online)','var(--c-retail)','var(--c-whole)','var(--c4)','var(--c5)','var(--c6)','var(--c7)'];
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==='class') el.className=v; else if (k==='html') el.innerHTML=v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2),v);
    else if (k==='style' && typeof v==='object') Object.assign(el.style,v);
    else el.setAttribute(k, v===true?'':v);
  }
  for (const k of kids.flat(9)){ if (k==null||k===false) continue; el.append(k.nodeType?k:document.createTextNode(k)); }
  return el;
}
const svgNS='http://www.w3.org/2000/svg';
/* ---------- formatting */
const nf = new Intl.NumberFormat('en-US');
const fmt = {
  n:(v,d=0)=> v==null||isNaN(v)?'–':new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v),
  c:(v,d=1)=>{ if(v==null||isNaN(v)) return '–'; const a=Math.abs(v); if(a>=1e9) return (v/1e9).toFixed(d)+'B'; if(a>=1e6) return (v/1e6).toFixed(d)+'M'; if(a>=1e3) return (v/1e3).toFixed(a>=1e5?0:d)+'K'; return v.toFixed(0); },
  egp:(v,d=2)=> v==null||isNaN(v)?'–':(v<0?'−':'')+'EGP '+fmt.c(Math.abs(v),d),
  p:(v,d=1)=> v==null||isNaN(v)?'–':(v*100).toFixed(d)+'%',
  sp:(v,d=1)=> v==null||isNaN(v)?'–':(v>=0?'+':'−')+Math.abs(v*100).toFixed(d)+'%',
  pp:(v,d=1)=> v==null||isNaN(v)?'–':(v>=0?'+':'−')+Math.abs(v*100).toFixed(d)+' pp',
  x:(v,d=1)=> v==null||isNaN(v)?'–':v.toFixed(d)+'x',
  mo:(i)=>{const [y,m]=MONTHS[i].split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+" '"+y.slice(2)},
  moFull:(i)=>{const [y,m]=MONTHS[i].split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+y},
};
const byFmt = {pct:v=>fmt.p(v,1),pct2:v=>fmt.p(v,2),num:v=>fmt.n(v,1),x:v=>fmt.x(v,2),egp:v=>fmt.egp(v),c:v=>fmt.c(v)};
function deltaEl(cur, prev, {inv=false, pp=false, d=1}={}){
  if (prev==null||cur==null||(!pp&&prev===0)) return h('span',{class:'delta flat'},'–');
  const dv = pp ? cur-prev : cur/prev-1; const up = dv>0.0005, dn = dv<-0.0005;
  const good = inv ? dn : up, bad = inv ? up : dn;
  return h('span',{class:'delta '+(good?'up':bad?'dn':'flat')},(up?'▲ ':dn?'▼ ':'● ')+(pp?fmt.pp(dv,d):fmt.sp(dv,d)));
}
/* ---------- tooltip */
const tipEl = h('div',{class:'tip',role:'status'}); document.addEventListener('DOMContentLoaded',()=>document.body.append(tipEl));
function showTip(ev, html){ if(typeof trFragment==='function') html=trFragment(html);
  tipEl.innerHTML = html; tipEl.classList.add('on');
  const w=tipEl.offsetWidth, hh=tipEl.offsetHeight; let x=ev.clientX+14, y=ev.clientY+14;
  if (x+w>innerWidth-8) x=ev.clientX-w-14; if (y+hh>innerHeight-8) y=ev.clientY-hh-14;
  tipEl.style.left=Math.max(8,x)+'px'; tipEl.style.top=Math.max(8,y)+'px';
}
function hideTip(){ tipEl.classList.remove('on'); }
function tipRows(title, rows){ return `<b>${title}</b>`+rows.map(r=>`<div class="r"><span>${r.c?`<i class="dot" style="background:${r.c}"></i>`:''}${r[0]}</span><b>${r[1]}</b></div>`).join(''); }
/* ---------- scales */
function lin(d0,d1,r0,r1){ const k=(r1-r0)/((d1-d0)||1); const f=v=>r0+(v-d0)*k; f.inv=v=>d0+(v-r0)/k; f.d=[d0,d1]; return f; }
function niceTicks(min,max,n=5){
  if (min===max){ max=min+1; }
  const span=max-min, step0=span/n, mag=Math.pow(10,Math.floor(Math.log10(step0))), err=step0/mag;
  const step=(err>=7.5?10:err>=3.5?5:err>=1.5?2:1)*mag;
  const a=Math.floor(min/step)*step, b=Math.ceil(max/step)*step, t=[]; for(let v=a; v<=b+step*.01; v+=step) t.push(+v.toFixed(10)); return t;
}
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const W_=(el,d)=>Math.max(320,Math.round(el.clientWidth||d));
function mountSvg(el, w, hgt, inner){ el.innerHTML=`<svg viewBox="0 0 ${w} ${hgt}" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; return el.firstChild; }
/* ---------- charts */
function lineChart(el, o){
  /* o: {x:[labels], series:[{name,color,values,area,dash,width}], fmt, h, yMin,yMax, band:{lo,hi,label}, marks:[{i,label}], ref:{v,label}} */
  const W=W_(el,760), H=o.h||240, ml=48, mr=16, mt=10, mb=26; const n=o.x.length;
  let lo=Infinity, hi=-Infinity; o.series.forEach(s=>s.values.forEach(v=>{ if(v!=null&&!isNaN(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);} }));
  if(o.ref){lo=Math.min(lo,o.ref.v);hi=Math.max(hi,o.ref.v);} if(o.band){lo=Math.min(lo,o.band.lo);hi=Math.max(hi,o.band.hi);}
  if(o.yMin!=null) lo=o.yMin; else if(!o.zero){ const pad=(hi-lo)*.1||1; lo-=pad; } else lo=Math.min(0,lo);
  if(o.yMax!=null) hi=o.yMax; else hi+=(hi-lo)*.06;
  const tk=niceTicks(lo,hi,4); lo=Math.min(lo,tk[0]); hi=Math.max(hi,tk[tk.length-1]);
  const X=lin(0,n-1,ml,W-mr), Y=lin(lo,hi,H-mb,mt), f=o.fmt||byFmt.num;
  let g=''; tk.forEach(t=>{ g+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${ml-8}" y="${Y(t)+4}" text-anchor="end" class="mono">${esc(f(t))}</text>`; });
  const step=Math.ceil(n/(o.xticks||8)); o.x.forEach((l,i)=>{ if(i%step===0||i===n-1) g+=`<text x="${X(i)}" y="${H-6}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}">${esc(l)}</text>`; });
  if(o.band) g+=`<rect x="${ml}" width="${W-ml-mr}" y="${Y(o.band.hi)}" height="${Y(o.band.lo)-Y(o.band.hi)}" fill="var(--accent)" opacity=".09"/>`;
  if(o.ref) g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(o.ref.v)}" y2="${Y(o.ref.v)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${W-mr}" y="${Y(o.ref.v)-5}" text-anchor="end">${esc(o.ref.label||'')}</text>`;
  (o.marks||[]).forEach(m=>{ g+=`<line x1="${X(m.i)}" x2="${X(m.i)}" y1="${mt}" y2="${H-mb}" stroke="var(--hi)" stroke-dasharray="3 3"/><text x="${X(m.i)+4}" y="${mt+10}" fill="var(--ink-2)" style="fill:var(--ink-2)">${esc(m.label)}</text>`; });
  o.series.forEach((s,si)=>{
    const col=s.color||CATS[si]; let d='', started=false, firstX=null, lastX=null;
    s.values.forEach((v,i)=>{ if(v==null||isNaN(v)){started=false;return;} d+=(started?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1); if(!started&&firstX==null) firstX=X(i); started=true; lastX=X(i); });
    if(s.area&&d) g+=`<path d="${d} L${lastX} ${Y(Math.max(lo,0))} L${firstX} ${Y(Math.max(lo,0))}Z" fill="${col}" opacity=".12"/>`;
    g+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="${s.width||2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash?`stroke-dasharray="${s.dash}"`:''}/>`;
    const li=[...s.values.keys()].reverse().find(i=>s.values[i]!=null);
    if(li!=null&&!s.noEnd) g+=`<circle cx="${X(li)}" cy="${Y(s.values[li])}" r="3.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
  });
  g+=`<line id="xh" class="axis" y1="${mt}" y2="${H-mb}" style="display:none;stroke:var(--ink-3)"/><rect id="hit" x="${ml}" y="${mt}" width="${W-ml-mr}" height="${H-mt-mb}" fill="transparent"/>`;
  const svg=mountSvg(el,W,H,g); const xh=svg.querySelector('#xh'), hit=svg.querySelector('#hit');
  hit.addEventListener('mousemove',ev=>{ const r=svg.getBoundingClientRect(); const px=(ev.clientX-r.left)/r.width*W; const i=Math.max(0,Math.min(n-1,Math.round((px-ml)/((W-ml-mr)/(n-1))))); xh.style.display='';xh.setAttribute('x1',X(i));xh.setAttribute('x2',X(i));
    showTip(ev,tipRows(o.x[i],o.series.filter(s=>s.values[i]!=null).map((s,si)=>({c:s.color||CATS[o.series.indexOf(s)],0:s.name,1:(s.fmt||f)(s.values[i])})))); });
  hit.addEventListener('mouseleave',()=>{xh.style.display='none';hideTip();});
  return el;
}
function barChart(el, o){
  /* o: {items:[{label,value,color,sub,tip}], fmt, max, ref, valueLabel:true, labelW} horizontal bars */
  const it=o.items, rowH=o.rowH||26, W=W_(el,640), lw=Math.min(o.labelW||150,W*.42), rw=o.rightW||74, H=it.length*rowH+8;
  const mx=o.max||Math.max(...it.map(d=>Math.abs(d.value)),1e-9), mn=Math.min(0,...it.map(d=>d.value));
  const X=lin(mn,mx,lw,W-rw), z=X(0), f=o.fmt||byFmt.num; let g='';
  it.forEach((d,i)=>{ const y=i*rowH+4, bh=Math.min(14,rowH-10), x0=Math.min(z,X(d.value)), x1=Math.max(z,X(d.value));
    g+=`<g class="row" data-i="${i}"><text x="${lw-10}" y="${y+rowH/2+4-2}" text-anchor="end" style="fill:var(--ink-2)">${esc(d.label)}</text>
    <rect x="${x0}" y="${y+(rowH-bh)/2-2}" width="${Math.max(1,x1-x0)}" height="${bh}" rx="3" fill="${d.color||o.color||'var(--accent)'}"/>
    <text x="${x1+6}" y="${y+rowH/2+4-2}" class="mono" style="fill:var(--ink)">${esc(d.text||f(d.value))}</text><rect x="0" y="${y-2}" width="${W}" height="${rowH}" fill="transparent"/></g>`; });
  if(o.ref!=null) g+=`<line x1="${X(o.ref)}" x2="${X(o.ref)}" y1="0" y2="${H}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
  g+=`<line class="axis" x1="${z}" x2="${z}" y1="0" y2="${H}"/>`;
  const svg=mountSvg(el,W,H,g);
  $$('.row',svg).forEach(r=>{ const d=it[+r.dataset.i]; r.addEventListener('mousemove',ev=>showTip(ev,d.tip||tipRows(d.label,[[o.name||'Value',d.text||f(d.value)]]))); r.addEventListener('mouseleave',hideTip); if(o.onclick) {r.style.cursor='pointer'; r.addEventListener('click',()=>o.onclick(d));} });
  return el;
}
function colChart(el, o){
  /* vertical columns, stackable. o:{x:[labels], series:[{name,color,values}], stack:true, fmt, h, ref} */
  const W=W_(el,760),H=o.h||240,ml=48,mr=12,mt=10,mb=26,n=o.x.length, f=o.fmt||byFmt.num;
  const tot=o.x.map((_,i)=>o.stack?o.series.reduce((a,s)=>a+(s.values[i]||0),0):Math.max(...o.series.map(s=>s.values[i]||0)));
  let hi=Math.max(...tot,o.ref?o.ref.v:0), lo=Math.min(0,...(o.stack?[0]:o.series.flatMap(s=>s.values.map(v=>v||0))));
  const tk=niceTicks(lo,hi,4); hi=tk[tk.length-1]; lo=tk[0]; const X=lin(0,n,ml,W-mr), Y=lin(lo,hi,H-mb,mt), bw=(W-ml-mr)/n; let g='';
  tk.forEach(t=>{ g+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${ml-8}" y="${Y(t)+4}" text-anchor="end" class="mono">${esc(f(t))}</text>`; });
  const step=Math.ceil(n/(o.xticks||10));
  o.x.forEach((l,i)=>{ if(i%step===0) g+=`<text x="${X(i)+bw/2}" y="${H-6}" text-anchor="middle">${esc(l)}</text>`;
    let acc=0; const k=o.stack?1:o.series.length, w=Math.max(2,(bw-2)/k-1);
    o.series.forEach((s,si)=>{ const v=s.values[i]||0, col=s.color||CATS[si];
      if(o.stack){ const y0=Y(acc), y1=Y(acc+v); g+=`<rect x="${X(i)+1}" y="${y1}" width="${bw-2}" height="${Math.max(0,y0-y1-(v>0?1:0))}" fill="${col}" rx="${bw>8?2:0}"/>`; acc+=v; }
      else { g+=`<rect x="${X(i)+1+si*(w+1)}" y="${Y(Math.max(v,0))}" width="${w}" height="${Math.abs(Y(v)-Y(0))}" fill="${col}" rx="2"/>`; } });
    g+=`<rect class="hb" data-i="${i}" x="${X(i)}" y="${mt}" width="${bw}" height="${H-mt-mb}" fill="transparent"/>`; });
  if(o.ref) g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(o.ref.v)}" y2="${Y(o.ref.v)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${W-mr}" y="${Y(o.ref.v)-5}" text-anchor="end">${esc(o.ref.label||'')}</text>`;
  const svg=mountSvg(el,W,H,g);
  $$('.hb',svg).forEach(r=>{ const i=+r.dataset.i; r.addEventListener('mousemove',ev=>showTip(ev,tipRows(o.x[i],[...o.series.map((s,si)=>({c:s.color||CATS[si],0:s.name,1:(s.fmt||f)(s.values[i]||0)})),...(o.stack&&o.series.length>1?[['Total',f(tot[i])]]:[])]))); r.addEventListener('mouseleave',hideTip); });
  return el;
}
function scatter(el,o){
  /* o:{pts:[{x,y,r,label,color,tip}], xFmt,yFmt,xLabel,yLabel, hlines:[{v,label}], vlines, h, onclick} */
  const W=W_(el,760),H=o.h||320,ml=56,mr=20,mt=14,mb=40, P=o.pts;
  let x0=o.xMin??Math.min(...P.map(p=>p.x)),x1=o.xMax??Math.max(...P.map(p=>p.x)),y0=o.yMin??Math.min(...P.map(p=>p.y)),y1=o.yMax??Math.max(...P.map(p=>p.y));
  (o.vlines||[]).forEach(l=>{x0=Math.min(x0,l.v);x1=Math.max(x1,l.v)}); (o.hlines||[]).forEach(l=>{y0=Math.min(y0,l.v);y1=Math.max(y1,l.v)});
  const tx=niceTicks(x0,x1,5), ty=niceTicks(y0,y1,5); x0=tx[0];x1=tx[tx.length-1];y0=ty[0];y1=ty[ty.length-1];
  const X=lin(x0,x1,ml,W-mr), Y=lin(y0,y1,H-mb,mt), xf=o.xFmt||byFmt.num, yf=o.yFmt||byFmt.num; let g='';
  ty.forEach(t=>g+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${ml-8}" y="${Y(t)+4}" text-anchor="end" class="mono">${esc(yf(t))}</text>`);
  tx.forEach(t=>g+=`<text x="${X(t)}" y="${H-mb+16}" text-anchor="middle" class="mono">${esc(xf(t))}</text>`);
  g+=`<text x="${(ml+W-mr)/2}" y="${H-4}" text-anchor="middle">${esc(o.xLabel||'')}</text><text transform="translate(12 ${(mt+H-mb)/2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel||'')}</text>`;
  (o.hlines||[]).forEach(l=>g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(l.v)}" y2="${Y(l.v)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${W-mr}" y="${Y(l.v)-4}" text-anchor="end">${esc(l.label||'')}</text>`);
  (o.vlines||[]).forEach(l=>g+=`<line y1="${mt}" y2="${H-mb}" x1="${X(l.v)}" x2="${X(l.v)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/><text x="${X(l.v)+4}" y="${mt+10}">${esc(l.label||'')}</text>`);
  P.forEach((p,i)=>g+=`<circle class="pt" data-i="${i}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r||5}" fill="${p.color||'var(--accent)'}" fill-opacity=".78" stroke="var(--surface)" stroke-width="1.5" style="cursor:${o.onclick?'pointer':'default'}"/>`);
  (o.labels||[]).forEach(i=>{const p=P[i]; g+=`<text x="${X(p.x)+(p.r||5)+4}" y="${Y(p.y)+4}" style="fill:var(--ink)">${esc(p.label)}</text>`});
  const svg=mountSvg(el,W,H,g);
  $$('.pt',svg).forEach(c=>{const p=P[+c.dataset.i]; c.addEventListener('mousemove',ev=>showTip(ev,p.tip||tipRows(p.label,[[o.xLabel||'x',xf(p.x)],[o.yLabel||'y',yf(p.y)]]))); c.addEventListener('mouseleave',hideTip); if(o.onclick) c.addEventListener('click',()=>o.onclick(p));});
  return el;
}
function heat(el,o){
  /* o:{rows:[labels],cols:[labels],vals:[[v]],fmt,colors:[lo,hi] css vars, domain:[a,b], cell:{w,h}, tip(r,c,v), diverge:mid} */
  const rl=o.rows,cl=o.cols,cw=o.cw||Math.max(34,Math.min(70,620/cl.length)),chh=o.ch||26,lw=o.lw||110,top=44,W=lw+cl.length*cw+8,H=top+rl.length*chh+6;
  const flat=o.vals.flat().filter(v=>v!=null&&!isNaN(v)); const a=o.domain?o.domain[0]:Math.min(...flat), b=o.domain?o.domain[1]:Math.max(...flat); let g='';
  cl.forEach((c,j)=>g+=`<text x="${lw+j*cw+cw/2}" y="${top-8}" text-anchor="middle" style="font-size:10.5px">${esc(c)}</text>`);
  rl.forEach((r,i)=>{ g+=`<text x="${lw-8}" y="${top+i*chh+chh/2+4}" text-anchor="end" style="fill:var(--ink-2)">${esc(r)}</text>`;
    cl.forEach((c,j)=>{ const v=o.vals[i][j]; const t=v==null?0:(v-a)/((b-a)||1); const mixp=Math.round(Math.max(0,Math.min(1,t))*100);
      const fill=v==null?'var(--surface-2)':(o.rev?`color-mix(in srgb,var(--accent) ${100-mixp}%,${o.hot||'var(--crit)'})`:`color-mix(in srgb,${o.hot||'var(--accent)'} ${Math.round(10+mixp*.85)}%,var(--surface))`);
      g+=`<rect class="hc" data-r="${i}" data-c="${j}" x="${lw+j*cw+1}" y="${top+i*chh+1}" width="${cw-2}" height="${chh-2}" rx="3" fill="${fill}"/>`;
      if(o.show!==false&&v!=null) g+=`<text x="${lw+j*cw+cw/2}" y="${top+i*chh+chh/2+4}" text-anchor="middle" class="mono" style="font-size:10px;fill:${t>.62?'var(--bg)':'var(--ink)'}">${esc((o.fmt||byFmt.num)(v))}</text>`; }); });
  const svg=mountSvg(el,W,H,g); el.style.overflowX='auto';
  $$('.hc',svg).forEach(c=>{const i=+c.dataset.r,j=+c.dataset.c,v=o.vals[i][j]; c.addEventListener('mousemove',ev=>showTip(ev,o.tip?o.tip(i,j,v):tipRows(rl[i]+' × '+cl[j],[['Value',(o.fmt||byFmt.num)(v)]]))); c.addEventListener('mouseleave',hideTip); if(o.onclick) c.addEventListener('click',()=>o.onclick(i,j)); });
  return el;
}
function waterfall(el,o){
  /* o:{steps:[{label,value,total?}], fmt, h} */
  const W=W_(el,760),H=o.h||260,ml=14,mr=14,mt=24,mb=44,n=o.steps.length,f=o.fmt||byFmt.c; let run=0; const bars=o.steps.map(s=>{ if(s.total){const b={s,a:0,b:s.value,t:true}; run=s.value; return b;} const a=run; run+=s.value; return {s,a,b:run}; });
  const hi=Math.max(...bars.map(b=>Math.max(b.a,b.b))); let lo=Math.min(...bars.map(b=>Math.min(b.a,b.b))); lo=lo>0? Math.max(0,lo-(hi-lo)*0.35):Math.min(0,lo); const Y=lin(lo,hi*1.05,H-mb,mt), bw=(W-ml-mr)/n; let g=`<line class="axis" x1="${ml}" x2="${W-mr}" y1="${Y(lo)}" y2="${Y(lo)}"/>`;
  bars.forEach((b,i)=>{ const x=ml+i*bw+bw*.14, w=bw*.72, y0=Y(Math.max(b.a,b.b)), y1=Y(Math.max(lo,Math.min(b.a,b.b))); const col=b.t?'var(--ink-2)':(b.s.value>=0?'var(--good)':'var(--crit)');
    g+=`<g class="wf" data-i="${i}"><rect x="${x}" y="${y0}" width="${w}" height="${Math.max(1,y1-y0)}" rx="3" fill="${b.s.color||col}"/><text x="${x+w/2}" y="${y0-6}" text-anchor="middle" class="mono" style="fill:var(--ink)">${esc((b.s.text)||f(b.s.value))}</text><text x="${x+w/2}" y="${H-mb+16}" text-anchor="middle">${esc(b.s.label)}</text><rect x="${ml+i*bw}" y="0" width="${bw}" height="${H}" fill="transparent"/></g>`;
    if(i<n-1) g+=`<line x1="${x+w}" x2="${x+bw*1.0-bw*.14+0}" y1="${Y(b.b)}" y2="${Y(b.b)}" stroke="var(--ink-3)" stroke-dasharray="2 3"/>`; });
  const svg=mountSvg(el,W,H,g); $$('.wf',svg).forEach(r=>{const s=o.steps[+r.dataset.i]; r.addEventListener('mousemove',ev=>showTip(ev,tipRows(s.label,[[s.total?'Level':'Change',s.text||f(s.value)],...(s.note?[[s.note,'']]:[])]))); r.addEventListener('mouseleave',hideTip);}); return el;
}
function spark(values,{color='var(--accent)',w=120,h=30,fmtv=byFmt.num,labels}={}){
  const v=values.map(x=>x==null?NaN:x), ok=v.filter(x=>!isNaN(x)); if(!ok.length) return h('span');
  const lo=Math.min(...ok),hi=Math.max(...ok),X=lin(0,v.length-1,2,w-4),Y=lin(lo,hi,h-3,3); let d='',st=false,fx=null,lx=null; v.forEach((x,i)=>{ if(isNaN(x)){st=false;return;} d+=(st?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1); if(fx==null)fx=X(i); lx=X(i); st=true; });
  const li=v.length-1-[...v].reverse().findIndex(x=>!isNaN(x)); const wrap=h('div',{class:'chart',style:{height:h+'px'}}); wrap.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px"><path d="${d} L${lx} ${h} L${fx} ${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`; return wrap;
}
function sparkSvg(values,{color='var(--accent)',w=120,h:hh=30}={}){ const el=h('div',{class:'chart'}); const v=values.map(x=>x==null?NaN:x),ok=v.filter(x=>!isNaN(x)); if(!ok.length) return el; const lo=Math.min(...ok),hi=Math.max(...ok),X=lin(0,v.length-1,3,w-5),Y=lin(lo,hi,hh-4,4); let d='',st=false,fx=null,lx=null,ly=0; v.forEach((x,i)=>{ if(isNaN(x)){st=false;return;} d+=(st?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1); if(fx==null)fx=X(i); lx=X(i); ly=Y(x); st=true; }); el.innerHTML=`<svg viewBox="0 0 ${w} ${hh}" style="height:${hh}px;width:100%"><path d="${d} L${lx} ${hh} L${fx} ${hh}Z" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/><circle cx="${lx}" cy="${ly}" r="2.6" fill="${color}"/></svg>`; return el; }
function funnel(el,o){
  const steps=o.steps,W=W_(el,640),rowH=44,H=steps.length*rowH+4,mx=steps[0].value; let g='';
  steps.forEach((s,i)=>{ const w=Math.max(6,(s.value/mx)*(W-300)), y=i*rowH+2; const nxt=steps[i+1];
    g+=`<g class="fn" data-i="${i}"><rect x="150" y="${y}" width="${w}" height="${rowH-10}" rx="4" fill="${s.color||'var(--accent)'}" opacity="${1-i*.14}"/><text x="142" y="${y+(rowH-10)/2+4}" text-anchor="end" style="fill:var(--ink-2)">${esc(s.label)}</text><text x="${158+w}" y="${y+(rowH-10)/2+4}" class="mono" style="fill:var(--ink)">${esc(fmt.n(s.value))}</text>${nxt?`<text x="${W}" y="${y+rowH-2}" text-anchor="end" class="mono" style="fill:var(--warn)">${fmt.p(nxt.value/s.value,1)} continue</text>`:''}</g>`; });
  const svg=mountSvg(el,W,H,g); return el;
}
function tileMap(el,o){
  /* schematic tile cartogram of Egyptian governorates seen in the data. o:{values:{gov:v}, fmt, color} */
  const POS={'Alexandria':[0,1],'Beheira':[1,1],'Kafr El Sheikh':[2,0],'Damietta':[4,0],'Gharbia':[2,1],'Dakahlia':[3,1],'Port Said':[5,0],'Monufia':[2,2],'Sharqia':[4,1],'Giza':[1,3],'Cairo':[3,2],'Suez':[5,2],'Other':[5,4]};
  const cw=88,chh=66,W=6*cw+10,H=5*chh+10; el.style.maxWidth='620px'; const vals=o.values, mx=Math.max(...Object.values(vals),1e-9); let g='';
  for(const [gv,[cx,cy]] of Object.entries(POS)){ const v=vals[gv]||0, t=v/mx; const sel=o.sel===gv;
    g+=`<g class="tl" data-g="${gv}" style="cursor:pointer"><rect x="${cx*cw+4}" y="${cy*chh+4}" width="${cw-8}" height="${chh-8}" rx="10" fill="color-mix(in srgb,${o.color||'var(--accent)'} ${Math.round(8+t*80)}%,var(--surface))" stroke="${sel?'var(--ink)':'var(--line)'}" stroke-width="${sel?2:1}"/><text x="${cx*cw+cw/2}" y="${cy*chh+chh/2-3}" text-anchor="middle" style="fill:${t>.55?'var(--bg)':'var(--ink)'};font-size:11px;font-weight:600">${esc(gv.length>11?gv.slice(0,10)+'…':gv)}</text><text x="${cx*cw+cw/2}" y="${cy*chh+chh/2+13}" text-anchor="middle" class="mono" style="fill:${t>.55?'var(--bg)':'var(--ink-2)'};font-size:10.5px">${esc((o.fmt||byFmt.c)(v))}</text></g>`; }
  const svg=mountSvg(el,W,H,g); $$('.tl',svg).forEach(t=>{const gv=t.dataset.g; t.addEventListener('mousemove',ev=>showTip(ev,o.tip?o.tip(gv):tipRows(gv,[['Value',(o.fmt||byFmt.c)(vals[gv]||0)]]))); t.addEventListener('mouseleave',hideTip); if(o.onclick) t.addEventListener('click',()=>o.onclick(gv));}); return el;
}
function legend(items){ return h('div',{class:'legend'},items.map(i=>h('span',null,h('i',{style:{background:i.color}}),i.name))); }
function card(title, sub, body, {tag, tagClass, right, cls}={}){
  return h('section',{class:'card '+(cls||'')},h('div',{class:'ch'},h('div',null,h('h3',null,title),sub?h('div',{class:'sub'},sub):null),h('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},right,tag?h('span',{class:'tag '+(tagClass||'')},tag):null)),body);
}
function chartBox(fn){ const el=h('div',{class:'chart'}); requestAnimationFrame(()=>fn(el)); return el; }
function table(cols, rows, {sortable=true, max=14, onrow, foot, id}={}){
  /* cols:[{k,label,fmt,num,bar,wrap,cls,render}] rows: array of objects */
  const state={k:null,dir:-1,limit:max}; const wrap=h('div',null); const tw=h('div',{class:'tbl-wrap'});
  const draw=()=>{ let data=[...rows]; if(state.k){ const c=cols.find(c=>c.k===state.k); const val=r=>c.sortv?c.sortv(r):r[c.k]; data.sort((a,b)=>{const x=val(a),y=val(b); return (typeof x==='string'?x.localeCompare(y):(x??-Infinity)-(y??-Infinity))*state.dir;}); }
    const shown=data.slice(0,state.limit); const mxs={}; cols.filter(c=>c.bar).forEach(c=>mxs[c.k]=Math.max(...rows.map(r=>Math.abs(r[c.k]||0)),1e-9));
    const t=h('table',{class:'t'},h('thead',null,h('tr',null,cols.map(c=>h('th',{class:(c.num?'num ':'')+(sortable?'sort':''),title:c.title||'',onclick:()=>{ if(!sortable) return; state.dir=state.k===c.k?-state.dir:-1; state.k=c.k; draw(); }},c.label+(state.k===c.k?(state.dir<0?' ↓':' ↑'):''))))),
      h('tbody',null,shown.map(r=>h('tr',{style:onrow?{cursor:'pointer'}:null,onclick:onrow?()=>onrow(r):null},cols.map(c=>{ const v=r[c.k]; const txt=c.render?c.render(r):(c.fmt?c.fmt(v,r):(v??'–'));
        if(c.bar) return h('td',{class:'num'},h('div',{class:'bar-cell'},h('i',{style:{width:Math.max(1,Math.abs(v||0)/mxs[c.k]*60)+'px',background:c.barColor||'var(--accent)'}}),txt));
        return h('td',{class:(c.num?'num ':'')+(c.wrap?'wrap ':'')+(c.cls||'')},txt); })))));
    tw.replaceChildren(t); more.hidden=data.length<=state.limit; more.textContent=`Show ${Math.min(20,data.length-state.limit)} more · ${data.length} rows`; };
  const more=h('button',{class:'btn sm',onclick:()=>{state.limit+=20;draw();}}); wrap.append(tw,more); draw(); return wrap;
}
/* ---------- cube engine */
const CB = D.cube.rows; const C={m:0,c:1,p:2,q:3,gr:4,ne:5,cg:6,rf:7,rl:8,ql:9,ln:10};
const FAMILY = PRODUCTS.map(p=>p.family);
const F = {from:24,to:35,ch:new Set(CH),family:'All',preset:'L12M'};
function inF(row,f=F){ return row[0]>=f.from&&row[0]<=f.to&&f.ch.has(CH[row[1]])&&(f.family==='All'||FAMILY[row[2]]===f.family); }
function sumRows(rows){ const t={q:0,gr:0,ne:0,cg:0,rf:0,rl:0,ql:0,ln:0}; for(const r of rows){t.q+=r[3];t.gr+=r[4];t.ne+=r[5];t.cg+=r[6];t.rf+=r[7];t.rl+=r[8];t.ql+=r[9];t.ln+=r[10];} t.gp=t.ne-t.cg; t.gm=t.ne?t.gp/t.ne:0; t.disc=t.gr?1-t.ne/t.gr:0; t.ret=t.ln?t.rl/t.ln:0; return t; }
function qsum(f=F,extra){ return sumRows(CB.filter(r=>inF(r,f)&&(!extra||extra(r)))); }
function prevOf(f=F){ const n=f.to-f.from+1; if(f.from-12>=0) return {...f,from:f.from-12,to:f.to-12}; return null; }
function group(f,keyFn){ const g=new Map(); for(const r of CB){ if(!inF(r,f)) continue; const k=keyFn(r); if(!g.has(k)) g.set(k,[]); g.get(k).push(r);} const o=new Map(); for(const [k,v] of g) o.set(k,sumRows(v)); return o; }
function monthly(f,extra){ const out=Array.from({length:36},()=>({q:0,gr:0,ne:0,cg:0,rf:0,rl:0,ql:0,ln:0})); for(const r of CB){ if(r[0]<0||!f.ch.has(CH[r[1]])||(f.family!=='All'&&FAMILY[r[2]]!==f.family)||(extra&&!extra(r))) continue; const o=out[r[0]]; o.q+=r[3];o.gr+=r[4];o.ne+=r[5];o.cg+=r[6];o.rf+=r[7];o.rl+=r[8];o.ql+=r[9];o.ln+=r[10]; } out.forEach(o=>{o.gp=o.ne-o.cg;o.gm=o.ne?o.gp/o.ne:null;o.disc=o.gr?1-o.ne/o.gr:null;o.ret=o.ln?o.rl/o.ln:null;}); return out; }
function periodLabel(f=F){ return fmt.mo(f.from)+' – '+fmt.mo(f.to); }
/* PVM bridge: gross-profit change between period A and B, by product x channel keys */
function gpBridge(fa,fb){
  const key=r=>r[1]*100+r[2], A=new Map(), B=new Map();
  for(const r of CB){ if(inF(r,fa)){const k=key(r),o=A.get(k)||{q:0,ne:0,cg:0};o.q+=r[3];o.ne+=r[5];o.cg+=r[6];A.set(k,o);} if(inF(r,fb)){const k=key(r),o=B.get(k)||{q:0,ne:0,cg:0};o.q+=r[3];o.ne+=r[5];o.cg+=r[6];B.set(k,o);} }
  const qa=[...A.values()].reduce((s,o)=>s+o.q,0), qb=[...B.values()].reduce((s,o)=>s+o.q,0), gpa=[...A.values()].reduce((s,o)=>s+o.ne-o.cg,0), gpb=[...B.values()].reduce((s,o)=>s+o.ne-o.cg,0);
  let vol=(qb-qa)*(qa?gpa/qa:0), mix=0, price=0, cost=0;
  const keys=new Set([...A.keys(),...B.keys()]);
  for(const k of keys){ const a=A.get(k)||{q:0,ne:0,cg:0}, b=B.get(k)||{q:0,ne:0,cg:0}; const gpua=a.q?(a.ne-a.cg)/a.q:null, pa=a.q?a.ne/a.q:null, ca=a.q?a.cg/a.q:null;
    if(a.q&&b.q){ price+=b.q*(b.ne/b.q-pa); cost+=-b.q*(b.cg/b.q-ca); mix+=(b.q-qb*(a.q/qa))*gpua; }
    else if(b.q){ mix+=b.q*(b.ne-b.cg)/b.q-qb*0; } }
  const resid=(gpb-gpa)-(vol+mix+price+cost); return {gpa,gpb,vol,mix,price,cost:cost+resid,qa,qb};
}
/* sorting/misc */
const sum=a=>a.reduce((x,y)=>x+(y||0),0), avg=a=>a.length?sum(a)/a.length:0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const prodName=i=>PRODUCTS[i].name.replace(/\s+/g,' ').trim();
const shortName=(i,n=34)=>{const s=prodName(i);return s.length>n?s.slice(0,n-1)+'…':s;};
/* local state */
const store={get(k,d){try{const v=localStorage.getItem('esg.'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('esg.'+k,JSON.stringify(v));}catch(e){}}};
