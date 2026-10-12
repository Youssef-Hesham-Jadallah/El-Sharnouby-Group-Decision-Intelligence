/* ===== Views F: Insights & Next Actions hub + per-page action panels ===== */
const AR={
 'F-01':{t:'خصومات الجملة غير مرتبطة بحجم الطلب ولا بالعميل ولا بالمنتج',a:'تحديد سقف خصم الجملة عند سقف محدد واستبدال الشرائح الحالية بسلّم خصم مرتبط بالحجم'},
 'F-02':{t:'الخصم على الأونلاين زاد تدريجيًا وبيأكل الهامش',a:'وضع سقف لخصومات الأونلاين ومراجعة العروض الجارية'},
 'F-03':{t:'المخزون في المكان الغلط: الجملة ناقصة والمتجر والأونلاين عندهم فائض',a:'نقل الفائض لمكتب الجملة وإعادة طلب الأصناف الناقصة'},
 'F-04':{t:'موردان متأخران في التسليم أكتر بكتير من باقي الموردين',a:'مراجعة عقود الموردين المتأخرين وطلب خطة تعافي أسبوعية منهم'},
 'F-05':{t:'الخياطة هي عنق الزجاجة الرئيسي في الإنتاج',a:'موازنة خط الخياطة وإضافة طاقة في هذه المحطة'},
 'F-06':{t:'إيراد التسويق اللي بتعلنه المنصات مش قابل للمطابقة مع المبيعات الفعلية',a:'توحيد معرّفات الطلبات في الإسناد وتنفيذ اختبار holdout على منصة واحدة'},
 'F-07':{t:'مرتجعات الأونلاين أعلى بكتير من المتجر وأكبر سبب هو المقاس',a:'إضافة دليل مقاسات وبيانات fit ومراجعة المنتجات الأعلى إرجاعًا'},
 'F-08':{t:'مبيعات المتجر في انخفاض وتغطية مخزونه الأعلى في المجموعة',a:'مراجعة أداء المتجر وتخفيض مخزونه قبل أي نقاش عن التوسع'},
 'F-09':{t:'هبوط التحويل في Q4-2025 تزامن مع بطء تحميل الصفحات (تم حله)',a:'وضع تنبيه لسرعة الصفحات عند تجاوز حد محدد'},
 'F-11':{t:'تكلفة الجودة الضعيفة المقاسة في السنة، قبل مرفوضات الإنتاج',a:'مراجعات تصحيحية للعشرة منتجات الأعلى في خسارة فحص الجودة'},
 'F-12':{t:'حسابات جملة وعملاء تجزئة كتير في شريحة المعرّضين للفقد',a:'الاتصال بحسابات الجملة المعرّضة للفقد وتجربة رسالة استرجاع لعملاء التجزئة الموافقين'},
 'F-13':{t:'ذروة ديسمبر أعلى من أكتوبر والخامات محتاجة مدد توريد طويلة',a:'تقديم أوامر شراء خامات الربع الرابع دلوقتي بمدد التوريد المخططة'},
 'F-10':{t:'بيانات المصنع والمشتريات لا تتطابق مع المبيعات',a:'مطابقة الإنتاج والمشتريات مع دفتر المبيعات قبل الاعتماد عليها في القرارات'}};
const OWNER_AR={'Quality manager':'مدير الجودة','Key account managers + CRM':'مديرو الحسابات الرئيسية + CRM','Procurement + planning':'المشتريات + التخطيط','Sales director + Finance':'مدير المبيعات + المالية','E-commerce lead':'مسؤول التجارة الإلكترونية','Supply chain':'سلسلة الإمداد','Procurement':'المشتريات','Plant manager':'مدير المصنع','Marketing + Analytics':'التسويق + التحليلات','E-commerce + Merchandising':'التجارة الإلكترونية + الميرشاندايزينج','Retail manager':'مدير التجزئة','E-commerce / IT':'التجارة الإلكترونية / IT','Finance + Operations':'المالية + العمليات'};
const SEVTXT={4:'Critical',3:'High',2:'Medium',1:'Low'}, SEVAR={4:'حرج',3:'مرتفع',2:'متوسط',1:'منخفض'};
const ACTST=['Proposed','Approved','In progress','Done','Rejected'], STAR={Proposed:'مقترح',Approved:'معتمد','In progress':'قيد التنفيذ',Done:'تم',Rejected:'مرفوض'};
const actLog=()=>store.get('actionLog',{});
function dueOf(a,l){ if(l&&l.due) return l.due; const days=parseInt((a.horizon.match(/\d+/)||[30])[0],10); const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function valueText(a,ar){ if(a.low==null||a.high==null) return ar?'تقليل مخاطر (غير مُقيَّم بالجنيه)':(a.kind==='risk'?'Risk reduction (not valued in EGP)':'Not valued'); return fmt.egp(a.low)+' – '+fmt.egp(a.high)+(ar?' سنويًا':' / yr')+(a.kind==='cash'?(ar?' (نقدية محررة)':' (cash released)'):''); }

VIEWS.briefing=()=>{
  const wrap=h('div',{class:'page'}); const st=Object.assign({sev:0,mod:'All'},store.get('briefPrefs',{})); st.ar=isAR(); const log=actLog();
  const save=()=>store.set('briefPrefs',st); const ar=st.ar;
  const items=D.alerts.map(f=>({f,a:D.actions.find(x=>x.id===f.action)})).sort((x,y)=>y.f.sev-x.f.sev||(y.a?.score||0)-(x.a?.score||0));
  const shown=items.filter(i=>(!st.sev||i.f.sev>=st.sev)&&(st.mod==='All'||i.f.module===st.mod));
  wrap.append(h('header',{class:'ph'},h('div',{class:'eyebrow'},'Overview · Insights & Next Actions'),h('h1',null,ar?'إيه اللي حصل؟ ليه مهم؟ وإيه المطلوب ومين المسؤول؟':'What happened, why it matters, and who acts next'),h('p',{class:'lede',html:ar?'كل بند هنا مبني على دليل قابل للفحص في صفحة التحليل. الأولوية حسب الخطورة ثم العائد المتوقع. التواريخ والمسؤولون قابلة للتعديل وبتتحفظ في المتصفح.':'Every item is backed by evidence you can inspect on its module page. Ranked by severity, then expected value. Owners, dates and status are editable and kept in this browser.'})));
  wrap.setAttribute('dir',ar?'rtl':'ltr');
  const prof=D.actions.filter(a=>a.kind==='profit'); const open=D.actions.filter(a=>!['Done','Rejected'].includes((log[a.id]||{}).status||'Proposed')).length;
  const crit=D.alerts.filter(a=>a.sev>=3).length;
  const lang=h('div',{class:'seg',role:'group','aria-label':'Language'},h('button',{'aria-pressed':String(!ar),onclick:()=>{st.ar=false;save();render();}},'English'),h('button',{'aria-pressed':String(ar),onclick:()=>{st.ar=true;save();render();}},'العربية'));
  const sevSel=h('select',{'aria-label':'Severity',onchange:e=>{st.sev=+e.target.value;save();render();}},[[0,ar?'كل الدرجات':'All severities'],[3,ar?'مرتفع فما فوق':'High and above'],[4,ar?'حرج فقط':'Critical only']].map(([v,l])=>h('option',{value:v,selected:v===st.sev},l)));
  const mods=['All',...new Set(D.alerts.map(a=>a.module))]; const modSel=h('select',{'aria-label':'Module',onchange:e=>{st.mod=e.target.value;save();render();}},mods.map(m=>h('option',{value:m,selected:m===st.mod},m==='All'?(ar?'كل الوحدات':'All modules'):(APPS.find(a=>MODMAP[a.id]===m)||APPBYID[m]||{t:m}).t)));
  const copy=h('button',{class:'btn',onclick:()=>{ const t=shown.map((i,k)=>{const lg=log[i.a?.id]||{}; return `${k+1}. [${ar?SEVAR[i.f.sev]:SEVTXT[i.f.sev]}] ${ar?AR[i.f.id].t:i.f.title}\n   ${ar?'ماذا حدث':'What happened'}: ${i.f.signal}\n   ${ar?'الإجراء':'Action'}: ${ar?AR[i.f.id].a:i.a.title}\n   ${ar?'المسؤول':'Owner'}: ${lg.owner||(ar?OWNER_AR[i.a.owner]||i.a.owner:i.a.owner)} · ${ar?'الموعد':'Due'}: ${dueOf(i.a,lg)} · ${valueText(i.a,ar)}`;}).join('\n\n'); navigator.clipboard.writeText(t).then(()=>copy.textContent=ar?'تم النسخ ✓':'Copied ✓').catch(()=>{const ta=h('textarea',{style:{width:'100%',height:'180px'}});ta.value=t;copy.after(ta);ta.select();}); }},ar?'انسخ الملخص للاجتماع':'Copy briefing for the meeting');
  wrap.append(h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}},sevSel,modSel,copy));
  wrap.append(h('div',{class:'kpis'},K(ar?'عدد الملاحظات':'Findings',String(D.alerts.length),crit+(ar?' عالية/حرجة':' high or critical')),K(ar?'عائد الإجراءات الربحية':'Profit actions',fmt.egp(sum(prof.map(a=>a.low)))+' – '+fmt.egp(sum(prof.map(a=>a.high))),ar?'سنويًا — غير قابلة للجمع':'a year, overlapping'),K(ar?'نقدية قابلة للتحرير':'Cash to release',fmt.egp(D.actions.filter(a=>a.kind==='cash').reduce((s,a)=>s+(a.low||0),0)),ar?'من إعادة توزيع المخزون (حد أدنى)':'inventory (low case)'),K(ar?'إجراءات مفتوحة':'Open actions',String(open),ar?'من '+D.actions.length:'of '+D.actions.length)));
  wrap.append(section('Decision board','Every action moves from Proposed to Done; change its status here or on the card below'));
  wrap.append(decisionBoard(()=>render()));
  wrap.append(section('Insights behind the decisions','Each insight carries the chain from signal to KPI target'));
  const list=h('div',{style:{display:'flex',flexDirection:'column',gap:'14px'}});
  shown.forEach(({f,a},k)=>{ const lg=log[a.id]=log[a.id]||{status:'Proposed',owner:a.owner,due:'',note:'',actual:''}; const persist=()=>store.set('actionLog',log);
    const sev=pill(ar?SEVAR[f.sev]:SEVTXT[f.sev],'s'+f.sev);
    const statusSel=h('select',{'aria-label':'Status '+a.id,onchange:e=>{lg.status=e.target.value;persist();render();}},ACTST.map(x=>h('option',{value:x,selected:x===lg.status},ar?STAR[x]:x)));
    const ownerIn=h('input',{type:'text',value:lg.owner||a.owner,'aria-label':'Owner '+a.id,style:{width:'100%',minWidth:0},oninput:e=>{lg.owner=e.target.value;persist();}});
    const dueIn=h('input',{type:'date',value:dueOf(a,lg),'aria-label':'Due '+a.id,style:{minWidth:0},oninput:e=>{lg.due=e.target.value;persist();}});
    const why=[ar?`الخطورة: ${SEVAR[f.sev]}`:`Severity: ${SEVTXT[f.sev]}`,ar?`القيمة: ${valueText(a,true)}`:`At stake: ${valueText(a)}`,ar?`درجة الثقة: ${a.conf==='High'?'عالية':a.conf==='Medium'?'متوسطة':'منخفضة'}`:`Confidence: ${a.conf}`];
    const mod=APPS.find(x=>MODMAP[x.id]===f.module&&x.id!=='exec')||APPBYID[f.module]||APPBYID.warning;
    list.append(h('section',{class:'card'},
      h('div',{class:'ch'},h('div',null,h('div',{style:{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}},sev,h('span',{class:'mono',style:{color:'var(--ink-3)',fontSize:'12px'}},f.id+' → '+a.id),h('span',{class:'tag '+(a.kind==='profit'?'measured':'inferred')},ar?{profit:'ربح',cash:'نقدية',risk:'مخاطر',ops:'تشغيل'}[a.kind]:a.kind)),h('h3',null,(k+1)+'. '+(ar?AR[f.id].t:f.title))),h('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},statusSel)),
      decisionChain(f,a,lg),
      h('div',{class:'grid g3'},
        h('div',{style:{display:'flex',flexDirection:'column',gap:'8px'}},h('div',{class:'lab',style:{fontWeight:600}},ar?'ماذا حدث':'What happened'),h('p',{style:{margin:0}},f.signal),h('div',{class:'lab',style:{fontWeight:600,marginTop:'6px'}},ar?'الدليل':'Evidence'),h('dl',{class:'ev'},...f.evidence.slice(0,3).flatMap(e=>[h('dt',null,e.k),h('dd',null,e.v)]))),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'8px'}},h('div',{class:'lab',style:{fontWeight:600}},ar?'ليه يستحق الانتباه':'Why it deserves attention'),h('ul',{style:{margin:0,paddingInlineStart:'18px',fontSize:'13.5px'}},...why.map(w=>h('li',null,w))),h('p',{class:'note'},a.why),h('p',{class:'note warn'},h('b',null,ar?'المخاطر: ':'Risk: '),a.risk)),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'8px'}},h('div',{class:'lab',style:{fontWeight:600}},ar?'الإجراء المقترح':'Next action'),h('p',{style:{margin:0,fontWeight:600}},ar?AR[f.id].a:a.title),h('p',{class:'note'},a.what),h('div',{class:'field'},h('label',null,ar?'المسؤول عن المتابعة':'Owner (follows up)'),ownerIn),h('div',{class:'field'},h('label',null,(ar?'الموعد':'Due')+' · '+a.horizon),dueIn),h('div',{class:'btn-row',style:{display:'flex',gap:'6px',flexWrap:'wrap'}},h('button',{class:'btn sm',onclick:()=>go(mod.id)},(ar?'افتح الدليل: ':'Open evidence: ')+mod.t),h('button',{class:'btn sm',onclick:()=>{store.set('focusAlert',f.id);go('warning');}},ar?'الأسباب والفرضيات':'Root cause'))))));
  });
  if(!shown.length) list.append(h('p',{class:'note'},ar?'مفيش نتائج بالفلاتر دي.':'No findings match these filters.'));
  wrap.append(list);
  // follow-up by owner
  const byOwner={}; D.actions.forEach(a=>{ const lg=log[a.id]||{}; const o=(lg.owner||a.owner); (byOwner[o]=byOwner[o]||[]).push({a,lg}); });
  const rows=Object.entries(byOwner).map(([o,v])=>({o:ar&&OWNER_AR[o]?OWNER_AR[o]:o,n:v.length,acts:v.map(x=>x.a.id).join(', '),next:v.map(x=>dueOf(x.a,x.lg)).sort()[0],open:v.filter(x=>!['Done','Rejected'].includes(x.lg.status||'Proposed')).length}));
  wrap.append(section(ar?'مين بيتابع إيه':'Who follows up what',ar?'مجمّع حسب المسؤول':'Grouped by owner'));
  wrap.append(card(ar?'جدول المتابعة':'Follow-up board',ar?'أقرب موعد لكل مسؤول':'Nearest due date per owner',table([col('o',ar?'المسؤول':'Owner',{wrap:1}),col('acts',ar?'الإجراءات':'Actions'),col('open',ar?'مفتوح':'Open',{num:1}),col('next',ar?'أقرب موعد':'Next due')],rows.sort((x,y)=>x.next.localeCompare(y.next)),{sortable:false,max:12}),{tag:ar?'قابل للتعديل':'editable',tagClass:'assumption'}));
  wrap.append(h('p',{class:'note'},ar?'الأرقام مبنية على داتا تاريخية؛ راجعها مع الدفاتر قبل التنفيذ. المبالغ حدود عليا/دنيا وليست وعودًا.':'Figures come from a historical dataset; confirm against the ledger before acting. Ranges are bounds, not promises.'));
  wrap.append(lineage({tables:'All modules (findings F-01…F-13, actions ACT-01…ACT-13)',from:['warning','profit','inventory','procurement','quality'],to:['decisions'],note:'Status, owner and due date are shared with the Decision Log.'}));
  return wrap;
};

/* compact panel injected into each module page */
const PAGE_ACTS={planner:['procurement'],customers:['customers'],profit:['discount'],discount:['discount'],channels:['exec'],marketing:['marketing'],inventory:['inventory'],rebalance:['inventory'],factory:['factory'],procurement:['procurement'],quality:['quality'],trust:['data']};
function pageActions(id){
  const mods=PAGE_ACTS[id]; if(!mods) return null; const log=actLog(); const rows=D.actions.filter(a=>mods.includes(a.module)); if(!rows.length) return null;
  return card('Insights & next actions','What the data says here, what to do, and who follows up',h('div',{style:{display:'flex',flexDirection:'column',gap:'10px'}},...rows.map(a=>{ const f=D.alerts.find(x=>x.id===a.finding); const lg=log[a.id]||{};
    return h('div',{style:{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,.9fr)',gap:'14px',alignItems:'start',borderTop:'1px solid var(--line)',paddingTop:'10px'},class:'pa-row'},
      h('div',null,h('div',{style:{display:'flex',gap:'6px',alignItems:'center',marginBottom:'4px'}},sevPill(f.sev),h('span',{class:'mono',style:{fontSize:'12px',color:'var(--ink-3)'}},f.id)),h('b',null,f.title),h('p',{class:'sub',style:{margin:'4px 0 0'}},f.signal)),
      h('div',null,h('b',null,'Do: '),a.title,h('p',{class:'sub',style:{margin:'4px 0 0'}},valueText(a))),
      h('div',{style:{fontSize:'13px'}},h('div',null,h('b',null,'Owner: '),lg.owner||a.owner),h('div',null,h('b',null,'Due: '),dueOf(a,lg)),h('div',null,h('b',null,'Status: '),lg.status||'Proposed'),h('button',{class:'btn sm',style:{marginTop:'6px'},onclick:()=>go('briefing')},'Open in Insights & Actions')));
  })),{tag:'action',tagClass:'inferred'});
}
