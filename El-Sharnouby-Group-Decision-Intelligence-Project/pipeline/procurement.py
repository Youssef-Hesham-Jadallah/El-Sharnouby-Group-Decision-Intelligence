from common import *
from scipy import stats

def build_procurement(D, s, F):
    po = D["Purchase_Orders"].copy(); mat = D["Materials"]; sup = D["Suppliers"]; bom = D["Product_BOM"]; pm = D["Product_Master"]
    po["spend"] = po.Ordered_Qty * po.Unit_Cost_EGP
    po["late"] = (po.Actual_Receipt_Date - po.Promised_Date).dt.days
    po["ltd"] = (po.Actual_Receipt_Date - po.Order_Date).dt.days
    po["promised_lt"] = (po.Promised_Date - po.Order_Date).dt.days
    po["ontime"] = (po.late <= 0).astype(int); po["late5"] = (po.late > 5).astype(int)
    po["rejr"] = po.Rejected_Qty / po.Ordered_Qty
    po["q"] = po.Order_Date.dt.to_period("Q").astype(str); po["mi"] = mk(po.Order_Date).map(MI)
    std_lt = dict(zip(mat.Material_ID, mat.Standard_Lead_Time_Days))
    po["std_lt"] = po.Material_ID.map(std_lt)
    # price index = unit cost / median unit cost of the same material in the same quarter
    po["pidx"] = po.Unit_Cost_EGP / po.groupby(["Material_ID", "q"]).Unit_Cost_EGP.transform("median")
    tot_spend = po.spend.sum()
    sc = []
    for sid, x in po.groupby("Supplier_ID"):
        sr = sup[sup.Supplier_ID == sid].iloc[0]
        late_x = x[x.late > 0]
        sc.append(dict(id=sid, cat=sr.Primary_Category, gov=sr.Governorate, terms=int(sr.Payment_Terms_Days), contracted=sr.Contracted == "Yes", pos=int(len(x)), spend=r(x.spend.sum(), 0), share=r(x.spend.sum() / tot_spend, 4),
                       ontime=r(x.ontime.mean(), 4), late_avg=r(x.late.clip(lower=0).mean(), 2), late_when=r(late_x.late.mean(), 2) if len(late_x) else 0, late5=r(x.late5.mean(), 4), lt=r(x.ltd.mean(), 2), promised_lt=r(x.promised_lt.mean(), 2),
                       rej=r(x.Rejected_Qty.sum() / x.Ordered_Qty.sum(), 4), pidx=r(x.pidx.mean(), 4), mats=int(x.Material_ID.nunique()),
                       ontime_ltm=r(x[x.Order_Date >= LTM_START].ontime.mean(), 4), ontime_prior=r(x[(x.Order_Date >= PRIOR_START) & (x.Order_Date < LTM_START)].ontime.mean(), 4)))
    sdf = pd.DataFrame(sc)
    # transparent composite risk (inferred): rank-normalised 0-100
    def nz(v): return (v - v.min()) / (v.max() - v.min()) if v.max() > v.min() else v * 0
    sdf["risk"] = 100 * (0.40 * nz(1 - sdf.ontime) + 0.20 * nz(sdf.late_avg) + 0.20 * nz(sdf.rej) + 0.20 * nz(sdf.pidx))
    risk = dict(zip(sdf.id, sdf.risk.round(1)))
    for x in sc: x["risk"] = risk[x["id"]]
    # materials
    used = bom.groupby("Material_ID").agg(products=("Product_ID", "nunique"), per_unit=("Required_Per_Unit", "mean")).reset_index()
    # forecast units next 90d by product (all channels) -> material need
    fc = pd.DataFrame(F["fc"][:, :3].sum(1), index=pd.MultiIndex.from_tuples(F["keys"])).groupby(level=1).sum()[0]
    pids = list(pm.Product_ID)
    need90 = {}
    for r_ in bom.itertuples():
        pi = pids.index(r_.Product_ID); need90[r_.Material_ID] = need90.get(r_.Material_ID, 0) + fc.get(pi, 0) * r_.Required_Per_Unit
    ltm_units = s[s.Order_Date >= LTM_START].groupby("Product_ID").Quantity.sum()
    need_ltm = bom.assign(u=bom.Product_ID.map(ltm_units) * bom.Required_Per_Unit).groupby("Material_ID").u.sum()
    mats = []
    for mid, x in po.groupby("Material_ID"):
        mr = mat[mat.Material_ID == mid].iloc[0]
        ltm = x[x.Order_Date >= LTM_START]; pri = x[(x.Order_Date >= PRIOR_START) & (x.Order_Date < LTM_START)]
        price_ltm = ltm.spend.sum() / ltm.Ordered_Qty.sum(); price_pri = pri.spend.sum() / pri.Ordered_Qty.sum()
        # savings potential: spend above best-quartile price among suppliers with on-time >= overall median
        sp = x.groupby("Supplier_ID").agg(spend=("spend", "sum"), q=("Ordered_Qty", "sum"), pidx=("pidx", "mean"), ot=("ontime", "mean"))
        ok = sp[sp.ot >= x.ontime.median() if False else sp.ot >= sp.ot.median()]
        best = ok.pidx.min() if len(ok) else sp.pidx.min()
        pot = float(((sp.pidx - best).clip(lower=0) / sp.pidx * sp.spend).sum())
        urow = used[used.Material_ID == mid]
        mats.append(dict(id=mid, name=mr.Material_Name, unit=mr.Unit, cat=mr.Material_Category, std_lt=int(mr.Standard_Lead_Time_Days), pos=int(len(x)), spend=r(x.spend.sum(), 0), spend_ltm=r(ltm.spend.sum(), 0),
                         price=r(x.spend.sum() / x.Ordered_Qty.sum(), 2), price_ltm=r(price_ltm, 2), price_prior=r(price_pri, 2), price_chg=r(price_ltm / price_pri - 1, 4), lt=r(x.ltd.mean(), 2), lt_p90=r(x.ltd.quantile(.9), 1),
                         ontime=r(x.ontime.mean(), 4), late_avg=r(x.late.clip(lower=0).mean(), 2), rej=r(x.Rejected_Qty.sum() / x.Ordered_Qty.sum(), 4), suppliers=int(x.Supplier_ID.nunique()),
                         hhi=r(float(((x.groupby("Supplier_ID").spend.sum() / x.spend.sum()) ** 2).sum()), 4), products=int(urow.products.iloc[0]) if len(urow) else 0,
                         need90=r(need90.get(mid), 0), need_ltm=r(need_ltm.get(mid), 0), accepted_ltm=r(ltm.Accepted_Qty.sum(), 0), pot=r(pot, 0)))
    # supplier x material matrix
    mx = po.groupby(["Supplier_ID", "Material_ID"]).agg(n=("PO_ID", "count"), ot=("ontime", "mean"), px=("pidx", "mean")).reset_index()
    matrix = [[a.Supplier_ID, a.Material_ID, int(a.n), r(a.ot, 3), r(a.px, 3)] for a in mx.itertuples()]
    # monthly overall series & per-supplier quarterly on-time
    mo = po.groupby("mi").agg(ot=("ontime", "mean"), late=("late", lambda v: v.clip(lower=0).mean()), spend=("spend", "sum"), n=("PO_ID", "count"), rej=("Rejected_Qty", "sum"), q=("Ordered_Qty", "sum")).reindex(range(36))
    qs = po.groupby(["q", "Supplier_ID"]).ontime.mean().unstack()
    qsum = po.groupby("q").agg(ot=("ontime", "mean"), late=("late", lambda v: v.clip(lower=0).mean()))
    # cost index by category by quarter (price index relative to first quarter, same-material basket)
    qprice = po.groupby(["Material_ID", "q"]).apply(lambda d: d.spend.sum() / d.Ordered_Qty.sum(), include_groups=False).unstack()
    base = qprice.iloc[:, 0]
    cat_map = dict(zip(mat.Material_ID, mat.Material_Category))
    # spend-weighted basket index per category
    w_ = po.groupby("Material_ID").spend.sum()
    idx = {}
    for cat in sorted(set(cat_map.values())):
        ms = [m for m in qprice.index if cat_map[m] == cat]
        rel = (qprice.loc[ms].div(base.loc[ms], axis=0)); wt = w_.loc[ms] / w_.loc[ms].sum()
        idx[cat] = [r((rel[c] * wt).sum(), 4) for c in qprice.columns]
    # delays vs material-wait downtime correlation (monthly)
    dt = D["Machine_Downtime"]; mw = dt[dt.Reason == "Material wait"].assign(mi=lambda d: mk(d.Date).map(MI)).groupby("mi").Downtime_Hours.sum().reindex(range(36)).fillna(0)
    ok_ = mo.late.notna()
    corr = stats.pearsonr(mo.late[ok_], mw[ok_.values])
    # delivery lateness distribution
    lh = po.late.value_counts().sort_index()
    late_hist = [[int(k), int(v)] for k, v in lh.items()]
    # reconciliation of PO volume to BOM requirement
    prod_units = D["Production_Orders"].groupby("Product_ID").Good_Qty.sum()
    need_prod = bom.assign(u=bom.Product_ID.map(prod_units) * bom.Required_Per_Unit).groupby("Material_ID").u.sum()
    need_sales = bom.assign(u=bom.Product_ID.map(s.groupby("Product_ID").Quantity.sum()) * bom.Required_Per_Unit).groupby("Material_ID").u.sum()
    acc = po.groupby("Material_ID").Accepted_Qty.sum()
    recon = [dict(id=m, name=mat.set_index("Material_ID").Material_Name[m], purchased=r(acc.get(m), 0), need_sales=r(need_sales.get(m), 0), need_prod=r(need_prod.get(m), 0)) for m in mat.Material_ID]
    in_bom = set(bom.Material_ID); missing_bom = [m for m in mat.Material_ID if m not in in_bom]
    # price dispersion within material-quarter
    disp = po.groupby(["Material_ID", "q"]).Unit_Cost_EGP.apply(lambda v: v.std() / v.mean()).mean()
    # contracted vs not
    ct = po.merge(sup[["Supplier_ID", "Contracted"]], on="Supplier_ID").groupby("Contracted").agg(ot=("ontime", "mean"), late=("late", lambda v: v.clip(lower=0).mean()), pidx=("pidx", "mean"), n=("PO_ID", "count")).reset_index()
    return dict(suppliers=sc, materials=mats, matrix=matrix,
                monthly=dict(ot=[r(x, 4) for x in mo.ot], late=[r(x, 3) for x in mo.late], spend=[r(x, 0) for x in mo.spend], n=[int(x) if x == x else 0 for x in mo.n]),
                quarterly=dict(q=list(qs.index), by_supplier={c: [r(x, 3) for x in qs[c]] for c in qs.columns}, ot=[r(x, 4) for x in qsum.ot], late=[r(x, 3) for x in qsum.late]),
                cost_index=dict(q=list(qprice.columns), by_cat=idx), late_hist=late_hist, corr_late_matwait=dict(r=r(corr[0], 3), p=r(corr[1], 4), n=int(ok_.sum())),
                recon=recon, missing_bom=missing_bom, price_disp=r(disp, 4), contracted=[dict(c=a.Contracted, ot=r(a.ot, 4), late=r(a.late, 2), pidx=r(a.pidx, 4), n=int(a.n)) for a in ct.itertuples()],
                totals=dict(spend=r(tot_spend, 0), pos=int(len(po)), ontime=r(po.ontime.mean(), 4), spend_ltm=r(po[po.Order_Date >= LTM_START].spend.sum(), 0), accepted=r(po.Accepted_Qty.sum(), 0),
                            rej=r(po.Rejected_Qty.sum() / po.Ordered_Qty.sum(), 4), lt=r(po.ltd.mean(), 2), late5=r(po.late5.mean(), 4)))

def build_quality(D, s):
    q = D["Quality"].copy(); pb = D["Printing_Batches"]; po = D["Production_Orders"]; pm = D["Product_Master"]; cs = D["Customer_Service"].copy()
    fam = dict(zip(pm.Product_ID, pm.Product_Family))
    q["fam"] = q.Product_ID.map(fam); q["mi"] = mk(q.Inspection_Date).map(MI); q["def"] = q.Defect_Type.fillna("No defect")
    qtot = dict(inspected=int(q.Inspected_Qty.sum()), rejected=int(q.Rejected_Qty.sum()), rate=r(q.Rejected_Qty.sum() / q.Inspected_Qty.sum(), 4), loss=r(q.Estimated_Loss_EGP.sum(), 0), n=int(len(q)))
    pareto = q[q.Rejected_Qty > 0].groupby("def").agg(n=("QC_ID", "count"), rej=("Rejected_Qty", "sum"), loss=("Estimated_Loss_EGP", "sum")).sort_values("loss", ascending=False).reset_index()
    pareto = [dict(d=a["def"], n=int(a.n), rej=int(a.rej), loss=r(a.loss, 0)) for _, a in pareto.iterrows() if a["def"] != "No defect"]
    qd = q[q.Defect_Type.notna()]
    rc = qd.groupby("Root_Cause").agg(n=("QC_ID", "count"), rej=("Rejected_Qty", "sum"), loss=("Estimated_Loss_EGP", "sum")).sort_values("loss", ascending=False).reset_index()
    root = [dict(c=a.Root_Cause, n=int(a.n), rej=int(a.rej), loss=r(a.loss, 0)) for a in rc.itertuples()]
    stage = q.groupby("Stage").agg(n=("QC_ID", "count"), ins=("Inspected_Qty", "sum"), rej=("Rejected_Qty", "sum"), loss=("Estimated_Loss_EGP", "sum")).reset_index()
    stage = [dict(s=a.Stage, n=int(a.n), rate=r(a.rej / a.ins, 4), loss=r(a.loss, 0)) for a in stage.itertuples()]
    # stage x defect heat (loss)
    heat = qd.groupby(["Stage", "Defect_Type"]).Estimated_Loss_EGP.sum().unstack(fill_value=0).round(0)
    # chi-square independence of defect x root cause and stage x defect
    ct = pd.crosstab(qd.Defect_Type, qd.Root_Cause); chi = stats.chi2_contingency(ct)
    ct2 = pd.crosstab(qd.Stage, qd.Defect_Type); chi2 = stats.chi2_contingency(ct2)
    qm = q.groupby("mi").agg(ins=("Inspected_Qty", "sum"), rej=("Rejected_Qty", "sum"), loss=("Estimated_Loss_EGP", "sum")).reindex(range(36))
    # product level: QC reject rate vs customer quality-return rate (funnel)
    pq = q.groupby("Product_ID").agg(ins=("Inspected_Qty", "sum"), rej=("Rejected_Qty", "sum"), loss=("Estimated_Loss_EGP", "sum"))
    pr = s.groupby("Product_ID").agg(ln=("Row_ID", "count"), rl=("ret", "sum"), ql=("qret", "sum"), ref=("Refund_Value_EGP", "sum"), net=("Net_Sales_EGP", "sum"))
    pall = pq.join(pr); p0 = pall.rej.sum() / pall.ins.sum(); pr0 = pall.rl.sum() / pall.ln.sum(); qr0 = pall.ql.sum() / pall.ln.sum()
    pall["qc_rate"] = pall.rej / pall.ins; pall["ret_rate"] = pall.rl / pall.ln; pall["qret_rate"] = pall.ql / pall.ln
    pall["qc_z"] = (pall.qc_rate - p0) / np.sqrt(p0 * (1 - p0) / pall.ins); pall["ret_z"] = (pall.ret_rate - pr0) / np.sqrt(pr0 * (1 - pr0) / pall.ln)
    pall["qret_z"] = (pall.qret_rate - qr0) / np.sqrt(qr0 * (1 - qr0) / pall.ln)
    pids = list(pm.Product_ID)
    prods = [dict(p=pids.index(i), qc=r(a.qc_rate, 4), qcz=r(a.qc_z, 2), ret=r(a.ret_rate, 4), retz=r(a.ret_z, 2), qret=r(a.qret_rate, 4), qretz=r(a.qret_z, 2), ins=int(a.ins), ln=int(a.ln), loss=r(a.loss, 0), ref=r(a.ref, 0)) for i, a in pall.iterrows()]
    c1 = stats.pearsonr(pall.qc_rate, pall.qret_rate); c2 = stats.spearmanr(pall.qc_rate, pall.qret_rate)
    # COPQ buckets (LTM)
    ltm_q = q[q.Inspection_Date >= LTM_START].Estimated_Loss_EGP.sum()
    ltm_print = pb[pb.Print_Date >= LTM_START]
    s_ltm = s[s.Order_Date >= LTM_START]
    qref = s_ltm[s_ltm.qret == 1].Refund_Value_EGP.sum(); allref = s_ltm.Refund_Value_EGP.sum()
    pcost = s.groupby("Product_ID").apply(lambda d: d.Estimated_COGS_EGP.sum() / d.Quantity.sum(), include_groups=False)
    po_l = po[po.Completion_Date >= LTM_START]; rej_val = float((po_l.Rejected_Qty * po_l.Product_ID.map(pcost)).sum())
    copq = dict(qc_loss=r(ltm_q, 0), print_rework=r(ltm_print.Rework_Cost_EGP.sum(), 0), production_rejects=r(rej_val, 0), quality_refunds=r(qref, 0), all_refunds=r(allref, 0),
                reprint_units=int(ltm_print.Reprint_Qty.sum()), ltm_net=r(s_ltm.Net_Sales_EGP.sum(), 0))
    copq["total"] = r(copq["qc_loss"] + copq["print_rework"] + copq["production_rejects"] + copq["quality_refunds"], 0)
    # returns by channel & reason (LTM + all)
    rr = s[s.ret == 1]
    ch_ret = []
    for ch, x in s.groupby("Channel"):
        xr = x[x.ret == 1]
        ch_ret.append(dict(ch=ch, lines=int(len(x)), ret=int(len(xr)), rate=r(len(xr) / len(x), 4), refund=r(xr.Refund_Value_EGP.sum(), 0), net=r(x.Net_Sales_EGP.sum(), 0), qual=int(xr.Quality_Related_Return.eq("Yes").sum())))
    # excess online returns vs retail rate
    on = s[s.Channel == "Online"]; rt = s[s.Channel == "Retail"]
    ex_lines = (len(on[on.ret == 1]) - len(on) * len(rt[rt.ret == 1]) / len(rt)); ex_ref = ex_lines * on[on.ret == 1].Refund_Value_EGP.mean()
    ex_ltm = (on[(on.Order_Date >= LTM_START)].ret.mean() - rt.ret.mean()) * len(on[on.Order_Date >= LTM_START]) * on[on.ret == 1].Refund_Value_EGP.mean()
    # return rate by quarter and channel
    rq = s.assign(q=s.Order_Date.dt.to_period("Q").astype(str)).groupby(["q", "Channel"]).ret.mean().unstack().round(4)
    # size-guidance tickets vs size/fit returns
    cs["q"] = cs.Open_Date.dt.to_period("Q").astype(str)
    tk = cs.groupby("Issue_Type").agg(n=("Ticket_ID", "count"), csat=("CSAT_1_to_5", "mean"), res=("Resolution_Hours", "mean"), fr=("First_Response_Minutes", "mean"), unresolved=("Resolved", lambda v: (v == "No").mean())).reset_index()
    tk = [dict(t=a.Issue_Type, n=int(a.n), csat=r(a.csat, 3), res=r(a.res, 2), fr=r(a.fr, 2), unres=r(a.unresolved, 4)) for a in tk.itertuples()]
    csq = cs.groupby("q").agg(n=("Ticket_ID", "count"), csat=("CSAT_1_to_5", "mean"), fr=("First_Response_Minutes", "mean"), res=("Resolution_Hours", "mean"), unres=("Resolved", lambda v: (v == "No").mean())).reset_index()
    csc = cs.groupby("Channel").agg(n=("Ticket_ID", "count"), csat=("CSAT_1_to_5", "mean"), fr=("First_Response_Minutes", "mean")).reset_index()
    csm = cs.assign(mi=mk(cs.Open_Date).map(MI)).groupby("mi").agg(n=("Ticket_ID", "count"), csat=("CSAT_1_to_5", "mean"), fr=("First_Response_Minutes", "mean"), res=("Resolution_Hours", "mean")).reindex(range(36))
    return dict(qc=qtot, pareto=pareto, root=root, stage=stage, stage_defect={a: {b: float(v) for b, v in row.items()} for a, row in heat.iterrows()},
                chi=dict(defect_root=dict(chi2=r(chi.statistic, 1), p=r(chi.pvalue, 4), dof=int(chi.dof)), stage_defect=dict(chi2=r(chi2.statistic, 1), p=r(chi2.pvalue, 4), dof=int(chi2.dof))),
                monthly=dict(rate=[r(a / b, 4) if b == b and b else None for a, b in zip(qm.rej, qm.ins)], loss=[r(x, 0) for x in qm.loss.fillna(0)]),
                products=prods, qc_vs_return=dict(pearson=r(c1[0], 3), p=r(c1[1], 4), spearman=r(c2[0], 3), p_s=r(c2[1], 4), n=int(len(pall))), copq=copq,
                channel_returns=ch_ret, online_excess=dict(lines=r(ex_lines, 0), refund=r(ex_ref, 0), ltm_refund=r(ex_ltm, 0)), return_q=dict(q=list(rq.index), **{c: [r(x, 4) for x in rq[c]] for c in rq.columns}),
                tickets=tk, tickets_q=[dict(q=a.q, n=int(a.n), csat=r(a.csat, 3), fr=r(a.fr, 2), res=r(a.res, 2), unres=r(a.unres, 4)) for a in csq.itertuples()],
                tickets_channel=[dict(c=a.Channel, n=int(a.n), csat=r(a.csat, 3), fr=r(a.fr, 2)) for a in csc.itertuples()],
                tickets_monthly=dict(n=[int(x) for x in csm.n.fillna(0)], csat=[r(x, 3) for x in csm.csat], fr=[r(x, 2) for x in csm.fr], res=[r(x, 2) for x in csm.res]))
