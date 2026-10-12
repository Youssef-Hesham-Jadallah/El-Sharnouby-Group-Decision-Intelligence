from common import *
from scipy import stats

def build_marketing(D, s):
    m = D["Marketing"].copy(); w = D["Web_Traffic_Daily"].copy(); pm = D["Product_Master"]; fam = dict(zip(pm.Product_ID, pm.Product_Family))
    m["fam"] = m.Product_ID.map(fam); m["sm"] = mk(m.Start_Date); m["mi"] = m.sm.map(MI)
    m["roas"] = m.Attributed_Revenue_EGP / m.Spend_EGP; m["cpa"] = m.Spend_EGP / m.Orders_Attributed
    m["ctr"] = m.Clicks / m.Impressions; m["cvr"] = m.Orders_Attributed / m.Clicks; m["aov"] = m.Attributed_Revenue_EGP / m.Orders_Attributed
    m["dur"] = (m.End_Date - m.Start_Date).dt.days + 1
    d2c = s[s.Channel != "Wholesale"]; online = s[s.Channel == "Online"]
    d2c_net = d2c.Net_Sales_EGP.sum(); online_net = online.Net_Sales_EGP.sum()
    d2c_gm = d2c.Gross_Profit_EGP.sum() / d2c_net; online_gm = online.Gross_Profit_EGP.sum() / online_net
    tot_sp = m.Spend_EGP.sum(); tot_rev = m.Attributed_Revenue_EGP.sum()
    # reconciliation
    inv_online = online.Invoice_ID.nunique()
    recon = dict(spend=r(tot_sp, 0), attributed_rev=r(tot_rev, 0), attributed_orders=int(m.Orders_Attributed.sum()), d2c_net=r(d2c_net, 0), online_net=r(online_net, 0),
                 online_invoices=int(inv_online), web_orders=int(w.Orders.sum()), ratio_rev=r(tot_rev / d2c_net, 3), ratio_orders_inv=r(m.Orders_Attributed.sum() / inv_online, 3),
                 ratio_orders_web=r(m.Orders_Attributed.sum() / w.Orders.sum(), 3), mer=r(d2c_net / tot_sp, 3), mer_online=r(online_net / tot_sp, 3), reported_roas=r(tot_rev / tot_sp, 3),
                 haircut=r(d2c_net / tot_rev, 4), d2c_gm=r(d2c_gm, 4), online_gm=r(online_gm, 4), breakeven_roas=r(1 / d2c_gm, 3),
                 clicks_eq_sessions=r((m.Clicks == m.Landing_Page_Sessions).mean(), 3))
    # by platform
    plats = []
    for p, x in m.groupby("Platform"):
        sp = x.Spend_EGP.sum(); rv = x.Attributed_Revenue_EGP.sum()
        lx = np.log(x.Spend_EGP); ly = np.log(x.Attributed_Revenue_EGP)
        res = stats.linregress(lx, ly)
        ltm = x[x.Start_Date >= LTM_START]
        plats.append(dict(p=p, n=int(len(x)), spend=r(sp, 0), rev=r(rv, 0), orders=int(x.Orders_Attributed.sum()), impr=int(x.Impressions.sum()), clicks=int(x.Clicks.sum()),
                          roas=r(rv / sp, 3), roas_med=r(x.roas.median(), 3), cpa=r(sp / x.Orders_Attributed.sum(), 1), ctr=r(x.Clicks.sum() / x.Impressions.sum(), 4), cvr=r(x.Orders_Attributed.sum() / x.Clicks.sum(), 4),
                          aov=r(rv / x.Orders_Attributed.sum(), 0), cpm=r(sp / x.Impressions.sum() * 1000, 1), share_spend=r(sp / tot_sp, 4), share_rev=r(rv / tot_rev, 4),
                          b=r(res.slope, 3), b_se=r(res.stderr, 3), r2=r(res.rvalue ** 2, 3), a=r(res.intercept, 3), spend_ltm=r(ltm.Spend_EGP.sum(), 0), rev_ltm=r(ltm.Attributed_Revenue_EGP.sum(), 0),
                          spend_med=r(x.Spend_EGP.median(), 0)))
    # monthly spend & attributed revenue (by start month)
    mm = m.groupby("mi").agg(sp=("Spend_EGP", "sum"), rv=("Attributed_Revenue_EGP", "sum"), o=("Orders_Attributed", "sum")).reindex(range(36)).fillna(0)
    d2c_m = d2c.groupby("mi").Net_Sales_EGP.sum().reindex(range(36)).fillna(0)
    pm_ = m.groupby(["mi", "Platform"]).Spend_EGP.sum().unstack(fill_value=0).reindex(range(36)).fillna(0)
    # by product family / product
    fams = [dict(f=f, spend=r(x.Spend_EGP.sum(), 0), rev=r(x.Attributed_Revenue_EGP.sum(), 0), roas=r(x.Attributed_Revenue_EGP.sum() / x.Spend_EGP.sum(), 2), n=int(len(x))) for f, x in m.groupby("fam")]
    # campaign outliers: robust z on log ROAS within platform
    m["lroas"] = np.log(m.roas)
    med = m.groupby("Platform").lroas.transform("median"); mad = m.groupby("Platform").lroas.transform(lambda v: np.median(np.abs(v - np.median(v))) * 1.4826)
    m["rz"] = (m.lroas - med) / mad
    out_hi = m[m.rz > 3].sort_values("roas", ascending=False); out_lo = m[m.rz < -2.5].sort_values("roas")
    def crow(x): return dict(id=x.Campaign_ID, name=x.Campaign_Name, p=x.Platform, pid=x.Product_ID, start=x.Start_Date.strftime("%Y-%m-%d"), dur=int(x.dur), spend=r(x.Spend_EGP, 0), rev=r(x.Attributed_Revenue_EGP, 0), orders=int(x.Orders_Attributed),
                            roas=r(x.roas, 2), cpa=r(x.cpa, 1), ctr=r(x.ctr, 4), cvr=r(x.cvr, 4), disc=r(x.Discount_Pct, 2), z=r(x.rz, 2))
    campaigns = [crow(x) for x in m.sort_values("Spend_EGP", ascending=False).itertuples()]
    # discount level vs ROAS
    dd = m.groupby("Discount_Pct").agg(n=("roas", "count"), med=("roas", "median"), mean=("roas", "mean"), sp=("Spend_EGP", "sum")).reset_index()
    disc_roas = [dict(d=r(a.Discount_Pct, 2), n=int(a.n), med=r(a.med, 2), sp=r(a.sp, 0)) for a in dd.itertuples()]
    # ---- web funnel
    w["mi"] = mk(w.Date).map(MI); w["dow"] = w.Date.dt.dayofweek
    w["atc"] = w.Sessions * w.Add_To_Cart_Rate; w["chk"] = w.Sessions * w.Checkout_Rate
    wm = w.groupby("mi").agg(sess=("Sessions", "sum"), users=("Users", "sum"), orders=("Orders", "sum"), atc=("atc", "sum"), chk=("chk", "sum"), load=("Avg_Page_Load_Sec", "mean"), mob=("Mobile_Pct", "mean"), newu=("New_User_Pct", "mean")).reindex(range(36))
    wm["cr"] = wm.orders / wm.sess
    w["lb"] = pd.cut(w.Avg_Page_Load_Sec, [0, 2.2, 2.6, 3.0, 3.5, 10], labels=["<2.2s", "2.2–2.6", "2.6–3.0", "3.0–3.5", ">3.5s"])
    lb = w.groupby("lb", observed=True).agg(n=("Orders", "count"), cr=("Conversion_Rate", "mean"), sess=("Sessions", "mean")).reset_index()
    rcorr = stats.pearsonr(w.Avg_Page_Load_Sec, w.Conversion_Rate)
    dow = w.groupby("dow").agg(sess=("Sessions", "mean"), cr=("Conversion_Rate", "mean")).reset_index()
    ltmw = w[w.Date >= LTM_START]
    funnel = dict(sessions=int(w.Sessions.sum()), atc=r(w.atc.sum(), 0), chk=r(w.chk.sum(), 0), orders=int(w.Orders.sum()),
                  ltm=dict(sessions=int(ltmw.Sessions.sum()), atc=r(ltmw.atc.sum(), 0), chk=r(ltmw.chk.sum(), 0), orders=int(ltmw.Orders.sum())))
    # conversion anomaly window
    wq = w.assign(q=w.Date.dt.to_period("Q").astype(str)).groupby("q").agg(cr=("Conversion_Rate", "mean"), load=("Avg_Page_Load_Sec", "mean"), sess=("Sessions", "sum"), orders=("Orders", "sum")).reset_index()
    # weekly series for the anomaly view
    w["wk"] = w.Date.dt.to_period("W").astype(str)
    wk = w.groupby("wk").agg(cr=("Conversion_Rate", "mean"), load=("Avg_Page_Load_Sec", "mean"), sess=("Sessions", "sum")).reset_index()
    cs = D["Customer_Service"]
    return dict(recon=recon, platforms=plats, monthly=dict(sp=[r(x, 0) for x in mm.sp], rv=[r(x, 0) for x in mm.rv], o=[int(x) for x in mm.o], d2c_net=[r(x, 0) for x in d2c_m],
                                                            by_platform={p: [r(x, 0) for x in pm_[p]] for p in pm_.columns}),
                families=fams, campaigns=campaigns, outliers_hi=[x.Campaign_ID for x in out_hi.itertuples()], outliers_lo=[x.Campaign_ID for x in out_lo.itertuples()], disc_roas=disc_roas,
                web=dict(monthly=dict(sess=[int(x) if x == x else 0 for x in wm.sess], orders=[int(x) if x == x else 0 for x in wm.orders], cr=[r(x, 4) for x in wm.cr], load=[r(x, 3) for x in wm.load], mob=[r(x, 3) for x in wm.mob]),
                         load_bins=[dict(b=str(a.lb), n=int(a.n), cr=r(a.cr, 4)) for a in lb.itertuples()], corr_load_cr=dict(r=r(rcorr[0], 3), p=r(rcorr[1], 4)),
                         dow=[dict(d=int(a.dow), sess=r(a.sess, 0), cr=r(a.cr, 4)) for a in dow.itertuples()], funnel=funnel, quarters=[dict(q=a.q, cr=r(a.cr, 4), load=r(a.load, 2), sess=int(a.sess), orders=int(a.orders)) for a in wq.itertuples()],
                         weekly=dict(wk=list(wk.wk), cr=[r(x, 4) for x in wk.cr], load=[r(x, 2) for x in wk.load])))
