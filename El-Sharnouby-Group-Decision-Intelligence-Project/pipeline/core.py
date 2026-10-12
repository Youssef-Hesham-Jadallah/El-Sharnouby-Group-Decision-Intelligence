from common import *
from scipy import stats

def build_core(D):
    s = D["Sales_Transactions"].copy()
    pm = D["Product_Master"]
    s["mi"] = s.Month_Key.map(MI); s["ci"] = s.Channel.map(CI)
    pids = list(pm.Product_ID); PI = {p: i for i, p in enumerate(pids)}
    s["pi"] = s.Product_ID.map(PI)
    govs = sorted(s.Customer_Governorate.unique(), key=lambda g: (g == "Other", g)); GI = {g: i for i, g in enumerate(govs)}
    s["gi"] = s.Customer_Governorate.map(GI)
    s["ret"] = (s.Returned == "Yes").astype(int); s["qret"] = (s.Quality_Related_Return == "Yes").astype(int)
    out = {}
    out["meta"] = dict(as_of=str(AS_OF.date()), months=MONTHS, channels=CHANNELS,
                       governorates=govs, locations=D["Locations"][["Location_ID","Location_Name","Location_Type","Channel","Governorate","City"]].to_dict("records"),
                       business_units=D["Business_Units"][["Business_Unit","Function","Public_Capacity"]].to_dict("records"))
    out["products"] = [dict(id=pr.Product_ID, sku=pr.SKU, name=pr.Product_Name, family=pr.Product_Family, gender=pr.Gender,
                            aud=pr.Audience, season=pr.Catalog_Season, price=float(pr.Public_Retail_Price_EGP)) for pr in pm.itertuples()]
    # --- main cube: month x channel x product
    g = s.groupby(["mi","ci","pi"]).agg(q=("Quantity","sum"), gr=("Gross_Sales_EGP","sum"), ne=("Net_Sales_EGP","sum"),
        cg=("Estimated_COGS_EGP","sum"), rf=("Refund_Value_EGP","sum"), rl=("ret","sum"), ql=("qret","sum"), ln=("Row_ID","count")).reset_index()
    out["cube"] = dict(cols=["m","c","p","q","gr","ne","cg","rf","rl","ql","ln"],
                       rows=[[int(a),int(b),int(c),int(d),r(e,1),r(f,1),r(h,1),r(i,1),int(j),int(k),int(l)] for a,b,c,d,e,f,h,i,j,k,l in g.values])
    # --- discount cube: month x channel x discount pct (int)
    s["dp"] = (s.Discount_Pct*100).round().astype(int)
    g = s.groupby(["mi","ci","dp"]).agg(q=("Quantity","sum"), gr=("Gross_Sales_EGP","sum"), ne=("Net_Sales_EGP","sum"),
        cg=("Estimated_COGS_EGP","sum"), ln=("Row_ID","count"), neg=("Gross_Profit_EGP", lambda x:(x<0).sum())).reset_index()
    out["dcube"] = dict(cols=["m","c","d","q","gr","ne","cg","ln","neg"], rows=[[int(a),int(b),int(c),int(d),r(e,1),r(f,1),r(h,1),int(i),int(j)] for a,b,c,d,e,f,h,i,j in g.values])
    # --- governorate cube
    g = s.groupby(["mi","ci","gi"]).agg(ne=("Net_Sales_EGP","sum"), gp=("Gross_Profit_EGP","sum"), ln=("Row_ID","count"), rl=("ret","sum"), q=("Quantity","sum")).reset_index()
    out["gcube"] = dict(cols=["m","c","g","ne","gp","ln","rl","q"], rows=[[int(a),int(b),int(c),r(d,1),r(e,1),int(f),int(h),int(i)] for a,b,c,d,e,f,h,i in g.values])
    # unique customers & invoices by gov x channel x year window
    for nm, lo, hi in [("ltm", LTM_START, AS_OF), ("prior", PRIOR_START, LTM_START - pd.Timedelta(days=1))]:
        x = s[(s.Order_Date >= lo) & (s.Order_Date <= hi)]
        gg = x.groupby(["ci","gi"]).agg(cust=("Customer_ID","nunique"), inv=("Invoice_ID","nunique")).reset_index()
        out["gcust_"+nm] = [[int(a),int(b),int(c),int(d)] for a,b,c,d in gg.values]
    # --- returns detail
    rr = s[s.ret == 1].groupby(["ci","Return_Reason"]).agg(n=("Row_ID","count"), ref=("Refund_Value_EGP","sum")).reset_index()
    out["return_reasons"] = [[int(a),b,int(c),r(d,0)] for a,b,c,d in rr.values]
    sz = s.groupby(["ci","Size"]).agg(ln=("Row_ID","count"), rl=("ret","sum")).reset_index()
    out["return_size"] = [[int(a),b,int(c),int(d)] for a,b,c,d in sz.values]
    # monthly returns by reason x channel for trend
    # payment mix
    pay = s.groupby(["ci","Payment_Method"]).agg(n=("Row_ID","count"), ne=("Net_Sales_EGP","sum")).reset_index()
    out["payment_mix"] = [[int(a),b,int(c),r(d,0)] for a,b,c,d in pay.values]
    return s, out

def discount_governance(s, out):
    """Wholesale discount structure analysis (hidden-value module)."""
    w = s[s.Channel == "Wholesale"].copy()
    ltm = w[(w.Order_Date >= LTM_START)]
    def tier_tbl(x):
        g = x.groupby("dp").agg(lines=("Row_ID","count"), q=("Quantity","sum"), gr=("Gross_Sales_EGP","sum"), ne=("Net_Sales_EGP","sum"),
                                cg=("Estimated_COGS_EGP","sum"), gp=("Gross_Profit_EGP","sum"), neg=("Gross_Profit_EGP", lambda v:(v<0).sum()), negloss=("Gross_Profit_EGP", lambda v:v[v<0].sum()),
                                avgq=("Quantity","mean")).reset_index()
        return [dict(d=int(a.dp), lines=int(a.lines), q=int(a.q), gr=r(a.gr,0), ne=r(a.ne,0), cg=r(a.cg,0), gp=r(a.gp,0), neg=int(a.neg), negloss=r(a.negloss,0), avgq=r(a.avgq,2)) for a in g.itertuples()]
    # quantity band x discount (ltm and all)
    bands = [(12,23),(24,35),(36,47),(48,60)]
    def band_tbl(x):
        rows = []
        for bi,(lo,hi) in enumerate(bands):
            xb = x[(x.Quantity>=lo)&(x.Quantity<=hi)]
            for d,gx in xb.groupby("dp"):
                rows.append([bi,int(d),int(len(gx)),int(gx.Quantity.sum()),r(gx.Gross_Sales_EGP.sum(),0),r(gx.Estimated_COGS_EGP.sum(),0)])
        return rows
    corr, p = stats.pearsonr(w.Quantity, w.Discount_Pct)
    rho, p2 = stats.spearmanr(w.Quantity, w.Discount_Pct)
    # customer-level: avg discount vs total volume
    cu = w.groupby("Customer_ID").agg(lines=("Row_ID","count"), q=("Quantity","sum"), avgd=("Discount_Pct","mean"), ne=("Net_Sales_EGP","sum"), gp=("Gross_Profit_EGP","sum"),
                                      hi=("Discount_Pct", lambda v:(v>=0.35).mean())).reset_index()
    cu10 = cu[cu.lines >= 10]
    cc, cp = stats.spearmanr(cu10.q, cu10.avgd)
    # expected sd of mean discount for random assignment
    pop_sd = w.Discount_Pct.std()
    hist = np.histogram(cu10.avgd*100, bins=np.arange(28,39,1))
    # top-volume deciles of wholesale customers vs avg discount
    cu["dec"] = pd.qcut(cu.q.rank(method="first"), 5, labels=False)
    quint = cu.groupby("dec").agg(cust=("Customer_ID","count"), q=("q","sum"), avgd=("avgd","mean"), margin=("gp","sum")).reset_index()
    quint["margin"] = quint.margin / cu.groupby("dec").ne.sum().values
    # margin by month tier mix
    mm = w.groupby(["mi"]).apply(lambda d: pd.Series(dict(hi=(d.Discount_Pct>=0.35).mean(), avgd=d.Discount_Pct.mean())), include_groups=False)
    # neg lines
    neg = w[w.Gross_Profit_EGP < 0]
    negp = neg.groupby("Product_ID").agg(n=("Row_ID","count"), loss=("Gross_Profit_EGP","sum")).sort_values("loss").head(10).reset_index()
    # cost ratio check: cogs/list by product
    cr = (s.Estimated_COGS_EGP/(s.Quantity*s.List_Price_EGP))
    # price response (fixed effects), per channel, product-month level
    el = []
    for ch in CHANNELS:
        d = s[s.Channel==ch].groupby(["Product_ID","Month_Key"]).agg(q=("Quantity","sum"), gr=("Gross_Sales_EGP","sum"), ne=("Net_Sales_EGP","sum")).reset_index()
        d["disc"] = 1 - d["ne"]/d["gr"]; d["lq"] = np.log(d.q + 1)
        for c in ["lq","disc"]:
            d[c+"_d"] = d[c] - d.groupby("Product_ID")[c].transform("mean") - d.groupby("Month_Key")[c].transform("mean") + d[c].mean()
        x = d.disc_d.values*100; y = d.lq_d.values
        b = (x*y).sum()/(x*x).sum(); res = y - b*x
        dof = len(d) - d.Product_ID.nunique() - d.Month_Key.nunique()
        se = np.sqrt((res**2).sum()/dof/(x*x).sum())
        el.append(dict(channel=ch, beta=r(b,5), se=r(se,5), lo=r(b-1.96*se,5), hi=r(b+1.96*se,5), n=int(len(d)), disc_sd_pp=r(np.std(d.disc_d*100),2)))
    # scenario: cap wholesale discount (ltm, constant volume)
    scen = []
    base_gp = ltm.Gross_Profit_EGP.sum(); base_ne = ltm.Net_Sales_EGP.sum()
    for cap in [38,35,32,30,28]:
        newd = np.minimum(ltm.Discount_Pct, cap/100)
        newne = ltm.Gross_Sales_EGP*(1-newd)
        gp = (newne - ltm.Estimated_COGS_EGP).sum()
        lines_aff = int((ltm.Discount_Pct > cap/100).sum())
        # breakeven volume loss on affected lines: lose fraction f of affected lines' GP at new price vs gain on remaining
        aff = ltm[ltm.Discount_Pct > cap/100]
        gain = ((aff.Gross_Sales_EGP*(1-np.minimum(aff.Discount_Pct,cap/100)) - aff.Estimated_COGS_EGP).sum() - aff.Gross_Profit_EGP.sum())
        gp_aff_new = (aff.Gross_Sales_EGP*(1-cap/100) - aff.Estimated_COGS_EGP).sum()
        be = gain / gp_aff_new if gp_aff_new>0 else None   # fraction of affected volume that could be lost before GP falls below base
        scen.append(dict(cap=cap, gp=r(gp,0), d_gp=r(gp-base_gp,0), d_ne=r(newne.sum()-base_ne,0), lines_aff=lines_aff, breakeven_loss=r(be,4),
                         aff_old=r(aff.Gross_Profit_EGP.sum(),0), aff_new=r(gp_aff_new,0), aff_units=int(aff.Quantity.sum()), aff_net=r(aff.Net_Sales_EGP.sum(),0)))
    # monthly series for tier mix
    gm = w.groupby("mi").agg(ne=("Net_Sales_EGP","sum"), gp=("Gross_Profit_EGP","sum"), gr=("Gross_Sales_EGP","sum")).reset_index()
    out["discount_gov"] = dict(
        tiers_all=tier_tbl(w), tiers_ltm=tier_tbl(ltm), bands=[f"{a}–{b}" for a,b in bands], band_ltm=band_tbl(ltm), band_all=band_tbl(w),
        corr_qty_disc=dict(pearson=r(corr,4), p=r(p,4), spearman=r(rho,4), n=int(len(w))),
        cust_corr=dict(spearman=r(cc,4), p=r(cp,4), n=int(len(cu10)), sd_of_avg=r(cu10.avgd.std()*100,2), pop_sd=r(pop_sd*100,2)),
        cust_hist=dict(edges=[int(x) for x in hist[1]], counts=[int(x) for x in hist[0]]),
        quintiles=[dict(q=int(a.dec)+1, cust=int(a.cust), avgd=r(a.avgd*100,2), margin=r(a.margin*100,2)) for a in quint.itertuples()],
        neg_lines=int(len(neg)), neg_loss=r(neg.Gross_Profit_EGP.sum(),0), neg_ltm=int((ltm.Gross_Profit_EGP<0).sum()), neg_ltm_loss=r(ltm.Gross_Profit_EGP[ltm.Gross_Profit_EGP<0].sum(),0),
        neg_products=[dict(p=a.Product_ID, n=int(a.n), loss=r(a.loss,0)) for a in negp.itertuples()],
        cogs_ratio=dict(mean=r(cr.mean(),4), sd=r(cr.std(),4), min=r(cr.min(),3), max=r(cr.max(),3)),
        elasticity=el, scenarios=scen, ltm_base=dict(gp=r(base_gp,0), ne=r(base_ne,0), gr=r(ltm.Gross_Sales_EGP.sum(),0), cg=r(ltm.Estimated_COGS_EGP.sum(),0), q=int(ltm.Quantity.sum())),
        breakeven_disc=r(1-cr.mean(),4),
    )
    return out
