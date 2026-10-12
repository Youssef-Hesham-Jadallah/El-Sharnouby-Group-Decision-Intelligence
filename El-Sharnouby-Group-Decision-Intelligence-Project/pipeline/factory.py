from common import *
from scipy import stats

def build_factory(D, s):
    po = D["Production_Orders"].copy(); pb = D["Printing_Batches"].copy(); dt = D["Machine_Downtime"].copy(); pm = D["Product_Master"]
    fam = dict(zip(pm.Product_ID, pm.Product_Family))
    po["fam"] = po.Product_ID.map(fam); po["cm"] = mk(po.Completion_Date); po["mi"] = po.cm.map(MI)
    po = po[po.mi.notna()].copy(); po["mi"] = po.mi.astype(int)
    po["late"] = (po.Delay_Days > 0).astype(int); po["bn"] = po.Primary_Bottleneck.fillna("None")
    pcost = s.groupby("Product_ID").apply(lambda d: d.Estimated_COGS_EGP.sum() / d.Quantity.sum(), include_groups=False)
    po["rej_val"] = po.Rejected_Qty * po.Product_ID.map(pcost)
    # monthly
    g = po.groupby("mi").agg(n=("Production_Order_ID", "count"), planned=("Planned_Qty", "sum"), produced=("Produced_Qty", "sum"), good=("Good_Qty", "sum"), rej=("Rejected_Qty", "sum"),
                             eff=("Efficiency_Pct", "mean"), late=("late", "mean"), delay=("Delay_Days", "mean"), ot=("Overtime_Hours", "sum")).reindex(range(36))
    days = [pd.Period(m, "M").days_in_month for m in MONTHS]
    monthly = dict(n=g.n.fillna(0).astype(int).tolist(), planned=g.planned.fillna(0).astype(int).tolist(), produced=g.produced.fillna(0).astype(int).tolist(), good=g.good.fillna(0).astype(int).tolist(),
                   rej=g.rej.fillna(0).astype(int).tolist(), eff=[r(x, 2) for x in g.eff], late=[r(x, 4) for x in g.late], delay=[r(x, 3) for x in g.delay], ot=[r(x, 1) for x in g.ot],
                   cap_nameplate=[HUB_PER_DAY * d for d in days])
    # by line
    bl = []
    for ln, x in po.groupby("Line_ID"):
        xl = x[x.late == 1]
        bl.append(dict(line=ln, n=int(len(x)), planned=int(x.Planned_Qty.sum()), produced=int(x.Produced_Qty.sum()), good=int(x.Good_Qty.sum()), rej_rate=r(x.Rejected_Qty.sum() / x.Produced_Qty.sum(), 4),
                       eff=r(x.Efficiency_Pct.mean(), 2), late=r(x.late.mean(), 4), delay_late=r(xl.Delay_Days.mean(), 2), delay_all=r(x.Delay_Days.mean(), 3), ot=r(x.Overtime_Hours.sum(), 0),
                       attain=r(x.Produced_Qty.sum() / x.Planned_Qty.sum(), 4), bn=x[x.bn != "None"].bn.value_counts().to_dict()))
    tot_delay = po.Delay_Days.sum()
    bb = []
    for b, x in po.groupby("bn"):
        bb.append(dict(bn=b, n=int(len(x)), share_orders=r(len(x) / len(po), 4), delay=r(x.Delay_Days.mean(), 2), delay_days=int(x.Delay_Days.sum()), share_delay=r(x.Delay_Days.sum() / tot_delay, 4),
                       eff=r(x.Efficiency_Pct.mean(), 2), ot=r(x.Overtime_Hours.mean(), 2), rej=r(x.Rejected_Qty.sum() / x.Produced_Qty.sum(), 4), late=r(x.late.mean(), 4)))
    bf = []
    for f, x in po.groupby("fam"):
        bf.append(dict(fam=f, n=int(len(x)), eff=r(x.Efficiency_Pct.mean(), 2), late=r(x.late.mean(), 4), delay=r(x.Delay_Days.mean(), 2), rej=r(x.Rejected_Qty.sum() / x.Produced_Qty.sum(), 4)))
    hist = po.Delay_Days.value_counts().sort_index()
    po["otbin"] = pd.cut(po.Overtime_Hours, [-0.1, 2, 5, 10, 20, 100], labels=["0–2h", "2–5h", "5–10h", "10–20h", "20h+"])
    otb = po.groupby("otbin", observed=True).agg(n=("late", "count"), eff=("Efficiency_Pct", "mean"), late=("late", "mean"), delay=("Delay_Days", "mean")).reset_index()
    po["qb"] = pd.qcut(po.Planned_Qty, 5, duplicates="drop")
    qb = po.groupby("qb", observed=True).agg(n=("late", "count"), eff=("Efficiency_Pct", "mean"), late=("late", "mean"), delay=("Delay_Days", "mean")).reset_index()
    tests = dict(
        eff_ot=dict(zip(["r", "p"], [r(v, 4) for v in stats.pearsonr(po.Efficiency_Pct, po.Overtime_Hours)])),
        delay_qty=dict(zip(["r", "p"], [r(v, 4) for v in stats.pearsonr(po.Delay_Days, po.Planned_Qty)])),
        delay_eff=dict(zip(["r", "p"], [r(v, 4) for v in stats.pearsonr(po.Delay_Days, po.Efficiency_Pct)])),
    )
    # sewing vs rest delay test
    sw = po[po.bn == "Sewing"].Delay_Days; ot_ = po[po.bn != "Sewing"].Delay_Days
    tests["sewing_vs_rest"] = dict(mean_sew=r(sw.mean(), 2), mean_rest=r(ot_.mean(), 2), p=r(stats.mannwhitneyu(sw, ot_).pvalue, 6))
    # ltm vs prior
    def per(x): return dict(n=int(len(x)), eff=r(x.Efficiency_Pct.mean(), 2), late=r(x.late.mean(), 4), delay=r(x.Delay_Days.mean(), 3), good=int(x.Good_Qty.sum()), ot=r(x.Overtime_Hours.sum(), 0), rej=r(x.Rejected_Qty.sum() / x.Produced_Qty.sum(), 4))
    ltm = po[po.Completion_Date >= LTM_START]; prior = po[(po.Completion_Date >= PRIOR_START) & (po.Completion_Date < LTM_START)]
    lead = (po.Due_Date - po.Start_Date).dt.days
    # ---- downtime
    dt["cm"] = mk(dt.Date); dt["mi"] = dt.cm.map(MI); dt["unpl"] = np.where(dt.Planned == "No", dt.Downtime_Hours, 0.0)
    machines = []
    pbm = pb.groupby("Machine_ID").agg(printed=("Printed_Qty", "sum"), good=("Good_Qty", "sum"), rej=("Rejected_Qty", "sum"), rep=("Reprint_Qty", "sum"), rw=("Rework_Cost_EGP", "sum"), ink=("Ink_or_Consumable_Cost_EGP", "sum"), n=("Print_Batch_ID", "count"))
    for mid, x in dt.groupby("Machine_ID"):
        row = dict(m=mid, area=x.Business_Area.iloc[0], events=int(len(x)), hrs=r(x.Downtime_Hours.sum(), 1), unpl=r(x.unpl.sum(), 1), pl=r(x.Downtime_Hours.sum() - x.unpl.sum(), 1),
                   avg=r(x.Downtime_Hours.mean(), 2), top=x[x.Planned == "No"].groupby("Reason").Downtime_Hours.sum().idxmax(),
                   ltm=r(x[x.Date >= LTM_START].unpl.sum(), 1), prior=r(x[(x.Date >= PRIOR_START) & (x.Date < LTM_START)].unpl.sum(), 1))
        if mid in pbm.index:
            p_ = pbm.loc[mid]; row.update(print_yield=r(p_.good / p_.printed, 4), print_rej=r(p_.rej / p_.printed, 4), reprint=r(p_.rep / p_.printed, 4), rework=r(p_.rw, 0), batches=int(p_.n))
        machines.append(row)
    pr_m = pd.DataFrame([m for m in machines if "print_rej" in m])
    # maintenance priority score for printers: z-sum of unplanned hours and reject rate
    if len(pr_m):
        for c in ["unpl", "print_rej"]:
            pr_m[c + "_z"] = (pr_m[c] - pr_m[c].mean()) / pr_m[c].std()
        pr_m["score"] = pr_m.unpl_z + pr_m.print_rej_z
        sc = dict(zip(pr_m.m, pr_m.score.round(2)))
        for m_ in machines:
            if m_["m"] in sc: m_["prio"] = sc[m_["m"]]
    reasons = dt.groupby("Reason").agg(events=("Downtime_ID", "count"), hrs=("Downtime_Hours", "sum")).reset_index()
    reasons["planned"] = reasons.Reason.eq("Planned maintenance")
    reasons = [dict(reason=a.Reason, events=int(a.events), hrs=r(a.hrs, 1), planned=bool(a.planned)) for a in reasons.itertuples()]
    area_reason = dt[dt.Planned == "No"].groupby(["Business_Area", "Reason"]).Downtime_Hours.sum().unstack(fill_value=0).round(1)
    dm = dt.groupby("mi").agg(h=("Downtime_Hours", "sum"), u=("unpl", "sum")).reindex(range(36)).fillna(0)
    mw = dt[dt.Reason == "Material wait"].groupby("mi").Downtime_Hours.sum().reindex(range(36)).fillna(0)
    # ---- printing
    pb["cm"] = mk(pb.Print_Date); pb["mi"] = pb.cm.map(MI)
    pt = pb.groupby("Print_Type").agg(batches=("Print_Batch_ID", "count"), printed=("Printed_Qty", "sum"), good=("Good_Qty", "sum"), rej=("Rejected_Qty", "sum"), rep=("Reprint_Qty", "sum"), rw=("Rework_Cost_EGP", "sum"), ink=("Ink_or_Consumable_Cost_EGP", "sum")).reset_index()
    pt = [dict(t=a.Print_Type, batches=int(a.batches), yield_=r(a.good / a.printed, 4), rej=r(a.rej / a.printed, 4), rework=r(a.rw, 0), cost_unit=r((a.ink + a.rw) / a.good, 3)) for a in pt.itertuples()]
    pdf = pb.Defect_Type.fillna("None").value_counts()
    pdef = [dict(d=k, n=int(v)) for k, v in pdf.items()]
    pbm_m = pb.groupby("mi").agg(printed=("Printed_Qty", "sum"), good=("Good_Qty", "sum"), rw=("Rework_Cost_EGP", "sum")).reindex(range(36))
    print_trend = dict(yield_=[r(a / b, 4) if b else None for a, b in zip(pbm_m.good, pbm_m.printed)], rework=[r(x, 0) for x in pbm_m.rw.fillna(0)])
    # print machine x type yield heat
    mt = pb.groupby(["Machine_ID", "Print_Type"]).apply(lambda d: d.Good_Qty.sum() / d.Printed_Qty.sum(), include_groups=False).unstack().round(4)
    # ---- production demand cover: monthly output vs sales units
    sales_m = s.groupby("mi").Quantity.sum().reindex(range(36)).fillna(0)
    return dict(monthly=monthly, lines=bl, bottlenecks=bb, families=bf,
                delay_hist=[[int(k), int(v)] for k, v in hist.items()],
                ot_bins=[dict(b=str(a.otbin), n=int(a.n), eff=r(a.eff, 2), late=r(a.late, 4), delay=r(a.delay, 3)) for a in otb.itertuples()],
                qty_bins=[dict(b=str(a.qb), n=int(a.n), eff=r(a.eff, 2), late=r(a.late, 4), delay=r(a.delay, 3)) for a in qb.itertuples()],
                tests=tests, ltm=per(ltm), prior=per(prior), all=per(po), lead_days=r(lead.mean(), 1),
                machines=machines, downtime_reasons=reasons, downtime_monthly=dict(h=[r(x, 1) for x in dm.h], u=[r(x, 1) for x in dm.u], material_wait=[r(x, 1) for x in mw]),
                area_reason={a: {b: float(v) for b, v in row.items()} for a, row in area_reason.iterrows()},
                print_types=pt, print_defects=pdef, print_trend=print_trend, print_machine_type={m: {t: float(v) for t, v in row.items()} for m, row in mt.iterrows()},
                sales_units_monthly=[int(x) for x in sales_m], good_total=int(po.Good_Qty.sum()), sold_total=int(s.Quantity.sum()),
                rej_value_ltm=r(ltm.rej_val.sum(), 0), rework_ltm=r(pb[pb.Print_Date >= LTM_START].Rework_Cost_EGP.sum(), 0),
                nameplate=dict(hub_per_day=HUB_PER_DAY, print_garments_per_day=PRINT_PER_DAY))
