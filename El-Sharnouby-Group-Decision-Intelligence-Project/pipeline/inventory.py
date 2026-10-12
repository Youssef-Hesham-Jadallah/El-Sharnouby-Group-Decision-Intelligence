from common import *

LOC_CH = {"LOC001": "Retail", "LOC002": "Online", "LOC003": "Wholesale"}
LOC_SHORT = {"LOC001": "Store", "LOC002": "Online", "LOC003": "Wholesale"}
Z95 = 1.645

def _window(fcm, days, start_dim=30.4):
    """cumulative forecast demand over the next `days` days from monthly forecast array fcm (len H)."""
    tot = 0.0; rem = days
    for v in fcm:
        take = min(rem, start_dim)
        tot += v * take / start_dim; rem -= take
        if rem <= 0: break
    return tot

def build_inventory(D, s, F):
    inv = D["Inventory_History"].copy()
    inv["mk"] = inv.Snapshot_Month.dt.strftime("%Y-%m")
    inv["mi"] = inv.mk.map(MI); inv["ch"] = inv.Location_ID.map(LOC_CH)
    pm = D["Product_Master"]; pids = list(pm.Product_ID); PI = {p: i for i, p in enumerate(pids)}
    keys = F["keys"]; kidx = {k: i for i, k in enumerate(keys)}
    ltm = s[s.Order_Date >= LTM_START]
    ux = ltm.groupby(["ci", "pi"]).agg(q=("Quantity", "sum"), net=("Net_Sales_EGP", "sum"), cg=("Estimated_COGS_EGP", "sum"))
    pcost = s.groupby("pi").apply(lambda d: d.Estimated_COGS_EGP.sum() / d.Quantity.sum(), include_groups=False)
    # ABC / XYZ at product level (all channels)
    pr = ltm.groupby("pi").agg(net=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum")).sort_values("net", ascending=False)
    cum = pr["net"].cumsum() / pr["net"].sum()
    abc = {int(i): ("A" if c - pr["net"][i]/pr["net"].sum() < 0.8 else "B" if c - pr["net"][i]/pr["net"].sum() < 0.95 else "C") for i, c in cum.items()}
    mon = s[s.mi >= 12].groupby(["pi", "mi"]).Quantity.sum().unstack(fill_value=0)
    cv = (mon.std(axis=1) / mon.mean(axis=1))
    xyz = {int(i): ("X" if v <= 0.5 else "Y" if v <= 1.0 else "Z") for i, v in cv.items()}
    rows = []
    last = inv[inv.mk == "2026-09"]
    for r_ in last.itertuples():
        ch = r_.ch; ci = CHANNELS.index(ch); pi = PI[r_.Product_ID]
        k = kidx.get((ci, pi))
        if k is None: continue
        fcm = F["fc"][k]; sg = F["sig"][k]
        lt = int(r_.Supplier_Lead_Time_Days)
        d30 = _window(fcm, 30); d60 = _window(fcm, 60); d90 = _window(fcm, 90)
        dd = d30 / 30.4
        ss_model = Z95 * sg * np.sqrt(max(lt, 1) / 30.4)
        target = _window(fcm, lt + 30) + ss_model
        stock = int(r_.Closing_Stock)
        rec = max(0, int(np.ceil(target - stock)))
        so12 = int(inv[(inv.Location_ID == r_.Location_ID) & (inv.Product_ID == r_.Product_ID) & (inv.mi >= 24)].Stockout_Days_In_Month.sum())
        u = ux.loc[(ci, pi)] if (ci, pi) in ux.index else None
        unit_net = float(u["net"] / u.q) if u is not None and u.q > 0 else None
        unit_cogs = float(pcost.get(pi, 0))
        cover_f = stock / dd if dd > 0.01 else 999
        if stock < _window(fcm, lt) and dd > 0.01: status = "Stockout risk"
        elif so12 > 0 and cover_f < 30: status = "Stockout risk"
        elif cover_f > 150: status = "Overstock"
        else: status = "Healthy"
        rows.append(dict(p=pi, l=LOC_SHORT[r_.Location_ID], ch=ci, stock=stock, ads90=float(r_.Avg_Daily_Sales_90D), cover=min(cover_f, 999), cover_sys=min(float(r_.Days_of_Cover), 999),
                         ss=int(r_.Safety_Stock_Units), rop=int(r_.Reorder_Point_Units), lt=lt, so12=so12, so_last=int(r_.Stockout_Days_In_Month),
                         f30=d30, f60=d60, f90=d90, sig=float(sg), ssm=float(ss_model), tgt=float(target), rec=rec,
                         nu=unit_net, uc=unit_cogs, val=stock * unit_cogs, status=status, abc=abc.get(pi, "C"), xyz=xyz.get(pi, "Z"),
                         fm=[float(x) for x in fcm]))
    # monthly trend by location
    tr = inv.groupby(["Location_ID", "mi"]).agg(close=("Closing_Stock", "sum"), so=("Stockout_Days_In_Month", "sum"), dam=("Damaged_Qty", "sum"),
                                                 sold=("Sold_Qty", "sum"), rec=("Received_Qty", "sum")).reset_index()
    trend = {LOC_SHORT[l]: dict(close=g.sort_values("mi").close.tolist(), so=g.sort_values("mi").so.tolist(), dam=g.sort_values("mi").dam.tolist(), sold=g.sort_values("mi").sold.tolist())
             for l, g in tr.groupby("Location_ID")}
    # inventory roll-forward integrity
    resid = (inv.Opening_Stock + inv.Received_Qty - inv.Sold_Qty + inv.Returned_Qty - inv.Damaged_Qty - inv.Closing_Stock)
    integrity = dict(rows=int(len(inv)), broken=int((resid != 0).sum()), clipped_neg=int((resid < 0).sum()), min=int(resid.min()))
    dfr = pd.DataFrame(rows)
    # summary
    sm = {}
    for l, g in dfr.groupby("l"):
        sm[l] = dict(units=int(g.stock.sum()), value=r(g.val.sum(), 0), cover_med=r(g.cover.median(), 1), so12=int(g.so12.sum()),
                     risk=int((g.status == "Stockout risk").sum()), over=int((g.status == "Overstock").sum()), rec_units=int(g.rec.sum()), skus=int(len(g)))
    # excess cash: units above 120d forecast cover
    dfr["excess_u"] = np.maximum(0, dfr.stock - dfr.f90 * (120 / 91.2))
    dfr["excess_v"] = dfr.excess_u * dfr.uc
    summary = dict(by_loc=sm, excess_value=r(dfr.excess_v.sum(), 0), excess_units=int(dfr.excess_u.sum()), total_value=r(dfr.val.sum(), 0))
    # unit-level fields rounding
    for x in rows:
        for k in ("ads90","cover","cover_sys","sig","ssm","tgt","f30","f60","f90","nu","uc","val"):
            if x[k] is not None: x[k] = round(x[k], 2)
        x["fm"] = [round(v, 1) for v in x["fm"]]
    return dict(rows=rows, trend=trend, summary=summary, integrity=integrity, abc_count={k: sum(1 for v in abc.values() if v == k) for k in "ABC"},
                xyz_count={k: sum(1 for v in xyz.values() if v == k) for k in "XYZ"})
