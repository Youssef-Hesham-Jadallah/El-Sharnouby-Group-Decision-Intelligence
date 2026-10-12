from common import *
from scipy import stats

SEV = {4: "Critical", 3: "High", 2: "Medium", 1: "Low"}

def robust_z(series, n_recent=3, n_base=12):
    x = np.array([np.nan if v is None else v for v in series], dtype=float)
    rec = x[-n_recent:]; base = x[-(n_recent + n_base):-n_recent]
    base = base[~np.isnan(base)]
    if len(base) < 8 or np.isnan(rec).all(): return None
    med = np.median(base); mad = np.median(np.abs(base - med)) * 1.4826
    sd = mad if mad > 0 else base.std()
    if sd == 0: return None
    sd = max(sd, 0.5 * base.std())     # guard against an over-tight MAD
    zl = (x[-1] - med) / sd
    z3 = (np.nanmean(rec) - med) / (sd / np.sqrt(n_recent))
    persist = int(sum(1 for v in rec if not np.isnan(v) and abs(v - med) > 1.5 * sd and np.sign(v - med) == np.sign(np.nanmean(rec) - med)))
    return dict(med=float(med), sd=float(sd), z_last=float(zl), z3=float(z3), persist=persist, last=float(x[-1]), recent=float(np.nanmean(rec)))

def build_series(s, D, I, Fa, Mk, P, Q):
    """Monthly metric library: name -> dict(module, unit, bad (+1 higher is bad / -1 lower is bad), series, fmt)"""
    L = {}
    mi = np.arange(36)
    for ci, ch in enumerate(CHANNELS):
        x = s[s.ci == ci].groupby("mi").agg(net=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum"), gr=("Gross_Sales_EGP", "sum"), rl=("ret", "mean")).reindex(mi)
        yoy = [None] * 12 + [float(x["net"].iloc[i] / x["net"].iloc[i - 12] - 1) for i in range(12, 36)]
        L[f"Net sales YoY · {ch}"] = dict(module="exec", unit="pct", bad=-1, series=yoy, ch=ch, kind="sales_yoy")
        L[f"Gross margin · {ch}"] = dict(module="profit", unit="pct", bad=-1, series=(x.gp / x["net"]).tolist(), ch=ch, kind="gm")
        L[f"Avg discount · {ch}"] = dict(module="discount", unit="pct", bad=+1, series=(1 - x["net"] / x.gr).tolist(), ch=ch, kind="disc")
        L[f"Return rate · {ch}"] = dict(module="quality", unit="pct", bad=+1, series=x.rl.tolist(), ch=ch, kind="ret")
    for loc, d in I["trend"].items():
        L[f"Stockout days · {loc}"] = dict(module="inventory", unit="num", bad=+1, series=d["so"], ch=loc, kind="so")
    L["Unplanned downtime hours"] = dict(module="factory", unit="num", bad=+1, series=Fa["downtime_monthly"]["u"], kind="dt")
    L["Production efficiency %"] = dict(module="factory", unit="num", bad=-1, series=Fa["monthly"]["eff"], kind="eff")
    L["Late production orders %"] = dict(module="factory", unit="pct", bad=+1, series=Fa["monthly"]["late"], kind="late")
    L["Supplier on-time rate"] = dict(module="procurement", unit="pct", bad=-1, series=P["monthly"]["ot"], kind="ot")
    L["QC reject rate"] = dict(module="quality", unit="pct", bad=+1, series=Q["monthly"]["rate"], kind="qc")
    L["Print yield"] = dict(module="factory", unit="pct", bad=-1, series=Fa["print_trend"]["yield_"], kind="py")
    L["Customer satisfaction (CSAT)"] = dict(module="quality", unit="num", bad=-1, series=Q["tickets_monthly"]["csat"], kind="csat")
    L["First response (min)"] = dict(module="quality", unit="num", bad=+1, series=Q["tickets_monthly"]["fr"], kind="fr")
    L["Web conversion"] = dict(module="marketing", unit="pct", bad=-1, series=Mk["web"]["monthly"]["cr"], kind="cr")
    L["Page load (s)"] = dict(module="marketing", unit="num", bad=+1, series=Mk["web"]["monthly"]["load"], kind="load")
    sp = np.array(Mk["monthly"]["sp"], dtype=float); d2c = np.array(Mk["monthly"]["d2c_net"], dtype=float)
    L["Marketing efficiency (D2C sales ÷ spend)"] = dict(module="marketing", unit="num", bad=-1, series=[float(d / s_) if s_ > 0 else None for d, s_ in zip(d2c, sp)], kind="mer")
    return L

def level_shift(series, n_recent=6, n_base=12):
    x = np.array([np.nan if v is None else v for v in series], dtype=float)
    a = x[-n_recent:]; b = x[-(n_recent + n_base):-n_recent]
    a = a[~np.isnan(a)]; b = b[~np.isnan(b)]
    if len(a) < 4 or len(b) < 8: return None
    t_, p_ = stats.ttest_ind(a, b, equal_var=False)
    return dict(t=float(t_), p=float(p_), a=float(a.mean()), b=float(b.mean()))

def detect(L):
    out = []
    for name, m in L.items():
        z = robust_z(m["series"]); ls = level_shift(m["series"])
        if z is None: continue
        bad = m["bad"] * z["z3"]       # positive = deterioration
        shift_bad = (m["bad"] * ls["t"]) if ls else 0
        if not (bad >= 2.5 or shift_bad >= 3.5): continue
        z["persist"] = max(z["persist"], 2 if shift_bad >= 3.5 else 0)
        bad = max(bad, shift_bad)
        sev = 4 if bad >= 6 else 3 if bad >= 4 else 2 if bad >= 3 else 1
        out.append(dict(name=name, module=m["module"], unit=m["unit"], kind=m["kind"], ch=m.get("ch"), sev=sev, z3=r(z["z3"], 2), z_last=r(z["z_last"], 2), persist=z["persist"],
                        base=r(z["med"], 4), recent=r(z["recent"], 4), last=r(z["last"], 4), series=[None if (v is None or v != v) else round(v, 5) for v in m["series"]], bad=m["bad"]))
    return sorted(out, key=lambda a: (-a["sev"], -abs(a["z3"])))

def gm_bridge(s, ch, a_lo, a_hi, b_lo, b_hi):
    """Arithmetic attribution of a gross-margin change into discount vs cost-ratio/mix. GM = 1 - c/(1-d)."""
    x = s[s.Channel == ch]
    def dc(lo, hi):
        y = x[(x.Order_Date >= lo) & (x.Order_Date <= hi)]
        gr = y.Gross_Sales_EGP.sum(); return 1 - y.Net_Sales_EGP.sum() / gr, y.Estimated_COGS_EGP.sum() / gr, y.Net_Sales_EGP.sum()
    d0, c0, n0 = dc(a_lo, a_hi); d1, c1, n1 = dc(b_lo, b_hi)
    gm = lambda d, c: 1 - c / (1 - d)
    return dict(gm0=gm(d0, c0), gm1=gm(d1, c1), d0=d0, d1=d1, c0=c0, c1=c1, disc_effect=gm(d1, c0) - gm(d0, c0), cost_effect=gm(d1, c1) - gm(d1, c0), net1=n1)
