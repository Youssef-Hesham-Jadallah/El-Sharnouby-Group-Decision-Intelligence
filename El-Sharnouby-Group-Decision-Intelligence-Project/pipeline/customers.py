from common import *
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

SEGS = ["Champions", "Loyal", "Potential", "New", "Needs attention", "At risk", "Hibernating"]

def _score(x, rev=False):
    rk = x.rank(method="first")
    q = pd.qcut(rk, 5, labels=[1, 2, 3, 4, 5]).astype(int)
    return (6 - q) if rev else q

def _seg(R, F, M):
    fm = np.ceil((F + M) / 2)
    if R >= 4 and fm >= 4: return "Champions"
    if R >= 3 and fm >= 4: return "Loyal"
    if R == 5 and F <= 2: return "New"
    if R >= 4 and fm >= 2: return "Potential"
    if R == 3: return "Needs attention"
    if R <= 2 and fm >= 3: return "At risk"
    if R >= 4: return "Potential"
    return "Hibernating"

def build_customers(D, s, mkt_spend):
    c = D["Customers"].copy()
    s = s.copy()
    inv = s.groupby(["Customer_ID", "Invoice_ID"]).agg(d=("Order_Date", "min"), net=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum")).reset_index()
    g = s.groupby("Customer_ID").agg(first=("Order_Date", "min"), last=("Order_Date", "max"), orders=("Invoice_ID", "nunique"), units=("Quantity", "sum"),
                                       net=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum"), lines=("Row_ID", "count"), rl=("ret", "sum"), refund=("Refund_Value_EGP", "sum"))
    ltm = s[s.Order_Date >= LTM_START].groupby("Customer_ID").agg(net12=("Net_Sales_EGP", "sum"), gp12=("Gross_Profit_EGP", "sum"))
    g = g.join(ltm).fillna({"net12": 0, "gp12": 0})
    g["rec"] = (AS_OF - g["last"]).dt.days
    g = g.join(c.set_index("Customer_ID")[["Customer_Type", "Governorate", "Age_Band", "Gender", "Join_Date", "Acquisition_Channel", "Consent_Status"]], how="left")
    # RFM per customer type
    g["R"] = 0; g["F"] = 0; g["M"] = 0
    for t, ix in g.groupby("Customer_Type").groups.items():
        sub = g.loc[ix]
        g.loc[ix, "R"] = _score(sub.rec, rev=True); g.loc[ix, "F"] = _score(sub.orders); g.loc[ix, "M"] = _score(sub.net)
    g["seg"] = [_seg(a, b, d) for a, b, d in zip(g.R, g.F, g.M)]
    # ---- segment table
    def segtab(x):
        out = []
        for sg in SEGS:
            y = x[x.seg == sg]
            if len(y) == 0: out.append(dict(seg=sg, n=0)); continue
            out.append(dict(seg=sg, n=int(len(y)), share=r(len(y) / len(x), 4), net=r(y.net.sum(), 0), net_share=r(y.net.sum() / x.net.sum(), 4), gp=r(y.gp.sum(), 0),
                            gp_share=r(y.gp.sum() / x.gp.sum(), 4), rec=r(y.rec.mean(), 0), orders=r(y.orders.mean(), 2), aov=r(y.net.sum() / y.orders.sum(), 0),
                            margin=r(y.gp.sum() / y.net.sum(), 4), ret=r(y.rl.sum() / y.lines.sum(), 4), consent=r((y.Consent_Status == "Opted-in").mean(), 4),
                            net12=r(y.net12.sum(), 0), gp12=r(y.gp12.sum(), 0)))
        return out
    seg_retail = segtab(g[g.Customer_Type == "Retail"]); seg_whole = segtab(g[g.Customer_Type == "Wholesale"])
    # ---- recency bucket -> repurchase base rate (cutoff 2026-03-31, 6 months forward)
    cut = pd.Timestamp("2026-03-31"); end = AS_OF
    past = s[s.Order_Date <= cut].groupby("Customer_ID").agg(last=("Order_Date", "max"), n=("Invoice_ID", "nunique"))
    fut = set(s[(s.Order_Date > cut) & (s.Order_Date <= end)].Customer_ID)
    past["rec"] = (cut - past["last"]).dt.days; past["back"] = past.index.isin(fut)
    past = past.join(c.set_index("Customer_ID").Customer_Type)
    bks = [(0, 60, "0–60d"), (61, 120, "61–120d"), (121, 180, "121–180d"), (181, 270, "181–270d"), (271, 9999, "271d+")]
    react = []
    for t in ["Retail", "Wholesale"]:
        for lo, hi, lb in bks:
            x = past[(past.Customer_Type == t) & (past.rec >= lo) & (past.rec <= hi)]
            react.append(dict(type=t, bucket=lb, n=int(len(x)), back=r(x.back.mean(), 4) if len(x) else None))
    # ---- retention curve (months since first purchase) retail & wholesale
    first = g["first"].dt.to_period("M"); lastm = pd.Period("2026-09", "M")
    ord_m = s.assign(m=s.Order_Date.dt.to_period("M")).groupby("Customer_ID").m.apply(lambda v: set(v))
    ret_curve = {}
    for t in ["Retail", "Wholesale"]:
        ids = g.index[(g.Customer_Type == t) & (first >= pd.Period("2023-10", "M"))]
        curve = []
        for k in range(1, 13):
            num = den = 0
            for cid in ids:
                f0 = first[cid]
                if f0 + k > lastm: continue
                den += 1; num += (f0 + k) in ord_m[cid]
            curve.append(r(num / den, 4) if den else None)
        ret_curve[t] = curve
    # ---- cohort by join quarter (retail): % active in each quarter offset
    cj = c[c.Customer_Type == "Retail"].copy(); cj["jq"] = cj.Join_Date.dt.to_period("Q")
    sq = s[s.Customer_Type == "Retail"].assign(q=s.Order_Date.dt.to_period("Q")).groupby("Customer_ID").q.apply(set)
    cohorts = []
    qs = list(pd.period_range("2023Q4", "2026Q3", freq="Q"))
    for q0 in qs:
        ids = cj[cj.jq == q0].Customer_ID
        row = []
        for k in range(0, 12):
            q1 = q0 + k
            if q1 > qs[-1]: row.append(None); continue
            row.append(r(sum(1 for i in ids if i in sq.index and q1 in sq[i]) / max(len(ids), 1), 4))
        cohorts.append(dict(q=str(q0), n=int(len(ids)), act=row))
    # ---- activation (joined vs purchased) by acquisition channel + economics
    buyers = set(g.index)
    acq = []
    for ac, x in c.groupby("Acquisition_Channel"):
        b = x[x.Customer_ID.isin(buyers)]; gg = g.loc[b.Customer_ID]
        acq.append(dict(ch=ac, joined=int(len(x)), buyers=int(len(b)), act=r(len(b) / len(x), 4), orders=r(gg.orders.mean(), 2), net=r(gg.net.sum(), 0), gp=r(gg.gp.sum(), 0),
                        gp_cust=r(gg.gp.sum() / max(len(b), 1), 0), repeat=r((gg.orders > 1).mean(), 4), consent=r((x.Consent_Status == "Opted-in").mean(), 4)))
    cac = []
    m2c = {"Paid Social": ["Meta", "TikTok"], "Google Search": ["Google"]}
    for ac, plats in m2c.items():
        sp = sum(mkt_spend.get(p, 0) for p in plats); row = [a for a in acq if a["ch"] == ac][0]
        cac.append(dict(ch=ac, spend=r(sp, 0), joined=row["joined"], buyers=row["buyers"], cac_buyer=r(sp / row["buyers"], 0), gp_cust=row["gp_cust"], payback=r(row["gp_cust"] / (sp / row["buyers"]), 2)))
    # ---- join lag / never purchased
    jl = g.join(c.set_index("Customer_ID").Join_Date.rename("jd"), how="left", rsuffix="_c") if False else None
    lag = (g["first"] - g["Join_Date"]).dt.days
    lag_stats = dict(median=r(lag.median(), 0), p90=r(lag.quantile(.9), 0), neg_share=r((lag < 0).mean(), 4))
    never = int((~c.Customer_ID.isin(buyers)).sum())
    # ---- concentration (wholesale)
    wh = g[g.Customer_Type == "Wholesale"].sort_values("net", ascending=False)
    cumnet = wh.net.cumsum() / wh.net.sum(); cumgp = wh.gp.sort_values(ascending=False).cumsum() / wh.gp.sum() if False else None
    conc = dict(n=int(len(wh)), top10=r(wh.net.head(10).sum() / wh.net.sum(), 4), top50=r(wh.net.head(50).sum() / wh.net.sum(), 4), top100=r(wh.net.head(100).sum() / wh.net.sum(), 4),
                curve=[r(float(cumnet.iloc[min(len(wh) - 1, int(len(wh) * p / 50))]), 4) for p in range(1, 51)])
    # ---- churn model: evaluated, NOT deployed
    def feats(cut_, h):
        cut_ = pd.Timestamp(cut_); e = cut_ + pd.DateOffset(months=h)
        p = s[s.Order_Date <= cut_]
        a = p.groupby("Customer_ID").agg(last=("Order_Date", "max"), first=("Order_Date", "min"), f=("Invoice_ID", "nunique"), m=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum"), ret=("ret", "mean"))
        a["rec"] = (cut_ - a["last"]).dt.days; a["ten"] = (cut_ - a["first"]).dt.days
        a["f180"] = p[p.Order_Date > cut_ - pd.Timedelta(days=180)].groupby("Customer_ID").size().reindex(a.index).fillna(0)
        a = a.join(c.set_index("Customer_ID")[["Customer_Type", "Acquisition_Channel", "Consent_Status"]])
        y = a.index.isin(s[(s.Order_Date > cut_) & (s.Order_Date <= e)].Customer_ID).astype(int)
        X = pd.get_dummies(a[["rec", "ten", "f", "m", "gp", "ret", "f180", "Customer_Type", "Acquisition_Channel", "Consent_Status"]], dtype=float)
        return X, pd.Series(y, index=a.index)
    Xa, ya = feats("2025-09-30", 6); Xb, yb = feats("2026-03-31", 6); Xb = Xb.reindex(columns=Xa.columns, fill_value=0)
    gb = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.05, max_depth=4, random_state=7).fit(Xa, ya)
    pb = gb.predict_proba(Xb)[:, 1]
    rt = Xb["Customer_Type_Retail"] == 1
    churn = dict(auc=r(roc_auc_score(yb, pb), 3), auc_retail=r(roc_auc_score(yb[rt], pb[rt]), 3), auc_recency=r(roc_auc_score(yb, -Xb.rec), 3), auc_freq=r(roc_auc_score(yb, Xb.f), 3),
                 n_train=int(len(Xa)), n_test=int(len(Xb)), base_rate=r(float(yb.mean()), 3), train_cut="2025-09-30", test_cut="2026-03-31", horizon_months=6,
                 verdict="Not deployed: discrimination is barely above a coin flip (AUC 0.5 = random). Lapse is described with RFM recency rules and the observed re-purchase base rates instead.")
    # ---- co-purchase affinity (retail customers)
    rs = s[s.Customer_Type == "Retail"].groupby(["Customer_ID", "pi"]).size().unstack(fill_value=0) > 0
    B = rs.values.astype(float); n = B.shape[0]
    act = s[s.Customer_Type == "Retail"].groupby("Customer_ID").Invoice_ID.nunique().reindex(rs.index).values
    strata = pd.qcut(pd.Series(act).rank(method="first"), 5, labels=False).values
    O = np.zeros((B.shape[1], B.shape[1])); E = np.zeros_like(O)
    for sidx in range(5):
        Bs = B[strata == sidx]; ns = len(Bs); ps = Bs.mean(0)
        O += Bs.T @ Bs; E += ns * np.outer(ps, ps)
    supp = B.mean(0); pairs = []
    for i in range(B.shape[1]):
        for j in range(i + 1, B.shape[1]):
            if O[i, j] / n >= 0.01 and E[i, j] > 0:
                pairs.append((O[i, j] / E[i, j], i, j, O[i, j] / n, int(O[i, j])))
    pairs.sort(reverse=True)
    aff = dict(n_customers=int(n), n_pairs=len(pairs), max_lift=r(pairs[0][0], 3) if pairs else None, median_lift=r(float(np.median([p[0] for p in pairs])), 3) if pairs else None,
               top=[dict(a=int(rs.columns[i]), b=int(rs.columns[j]), lift=r(l, 3), support=r(sp, 4), n=c_) for l, i, j, sp, c_ in pairs[:10]],
               avg_distinct_products=r(float(B.sum(1).mean()), 1), method="Lift adjusted for customer activity (5 strata of order count) so heavy buyers do not inflate every pair.")
    # ---- family mix by segment (retail)
    fam = s[s.Customer_Type == "Retail"].merge(g[["seg"]], left_on="Customer_ID", right_index=True).groupby(["seg", "Product_Family"]).Net_Sales_EGP.sum().unstack(fill_value=0)
    fam = (fam.div(fam.sum(1), axis=0)).round(4)
    fam_mix = {sg: fam.loc[sg].to_dict() for sg in fam.index}
    # ---- top customers + lapse list
    def row(cid, x):
        return dict(id=cid, t="W" if x.Customer_Type == "Wholesale" else "R", gov=x.Governorate, acq=x.Acquisition_Channel, seg=x.seg, orders=int(x.orders), net=r(x.net, 0), gp=r(x.gp, 0),
                    net12=r(x.net12, 0), rec=int(x.rec), last=x["last"].strftime("%Y-%m-%d"), consent=x.Consent_Status == "Opted-in", R=int(x.R), F=int(x.F), M=int(x.M),
                    ret=r(x.rl / x.lines, 3))
    top = g.sort_values("net", ascending=False).head(150)
    lapse = g[(g.seg.isin(["At risk"])) & (g.orders >= 3)].sort_values("net", ascending=False).head(150)
    # lapsing value (retail at-risk + wholesale at-risk)
    lapse_tot = {}
    for t in ["Retail", "Wholesale"]:
        x = g[(g.Customer_Type == t) & (g.seg == "At risk")]
        lapse_tot[t] = dict(n=int(len(x)), hist_net=r(x.net.sum(), 0), hist_gp=r(x.gp.sum(), 0), consented=int((x.Consent_Status == "Opted-in").sum()))
    # headline
    rt_g = g[g.Customer_Type == "Retail"]
    head = dict(customers=int(len(c)), buyers=int(len(g)), never=never, retail_buyers=int(len(rt_g)), wholesale_buyers=int((g.Customer_Type == "Wholesale").sum()),
                repeat_retail=r((rt_g.orders > 1).mean(), 4), repeat_wholesale=r((g[g.Customer_Type == "Wholesale"].orders > 1).mean(), 4),
                aov_retail=r(rt_g.net.sum() / rt_g.orders.sum(), 0), orders_per_cust=r(rt_g.orders.mean(), 2), consent=r((c.Consent_Status == "Opted-in").mean(), 4),
                gp_cust_retail=r(rt_g.gp.sum() / len(rt_g), 0))
    return dict(head=head, seg_retail=seg_retail, seg_wholesale=seg_whole, react=react, ret_curve=ret_curve, cohorts=cohorts, acq=acq, cac=cac, lag=lag_stats, conc=conc, churn=churn, affinity=aff,
                fam_mix=fam_mix, top=[row(i, x) for i, x in top.iterrows()], lapse=[row(i, x) for i, x in lapse.iterrows()], lapse_tot=lapse_tot)
