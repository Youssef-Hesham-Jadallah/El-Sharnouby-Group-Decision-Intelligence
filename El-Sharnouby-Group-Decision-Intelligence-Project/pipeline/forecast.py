from common import *

H = 6  # forecast horizon (months): Oct-26 .. Mar-27
FUT = [str(p) for p in pd.period_range("2026-10", periods=H, freq="M")]

def _snaive_g(tr, h):
    """Seasonal-naive x trailing-12m growth (clipped). tr: (series, months) array."""
    n = tr.shape[1]
    g = tr[:, -12:].sum(1) / np.maximum(tr[:, -24:-12].sum(1), 1.0)
    g = np.clip(g, 0.6, 1.6)
    out = np.zeros((tr.shape[0], h))
    for i in range(h):
        k = n - 12 + (i % 12)
        out[:, i] = tr[:, k] * g
    return out

def _ma12(tr, h):
    return np.repeat(tr[:, -12:].mean(1, keepdims=True), h, axis=1)

def _blend(tr, h):
    return 0.6 * _snaive_g(tr, h) + 0.4 * _ma12(tr, h)

METHODS = {"snaive_g": _snaive_g, "ma12": _ma12, "blend": _blend}
LABEL = {"snaive_g": "Seasonal-naive × 12m growth", "ma12": "12-month moving average", "blend": "60/40 blend (seasonal + average)"}

def build_forecast(s):
    # series: (channel, product) x 36 months
    m = s.groupby(["ci", "pi", "mi"]).Quantity.sum().unstack(fill_value=0)
    m = m.reindex(columns=range(36), fill_value=0)
    keys = list(m.index); M = m.values.astype(float)
    ch_of = np.array([k[0] for k in keys])
    ORIG = list(range(24, 34))   # forecast origins -> 3-month test windows end by month 36
    # ---- backtest
    bt = {k: {"A": [], "F": [], "o": []} for k in METHODS}
    for k, f in METHODS.items():
        for o in ORIG:
            fc = f(M[:, :o], 3)
            bt[k]["A"].append(M[:, o:o + 3]); bt[k]["F"].append(fc); bt[k]["o"].append(o)
    res = {}
    for k in METHODS:
        A = np.stack(bt[k]["A"], 0); F = np.stack(bt[k]["F"], 0)       # (origin, series, 3)
        row = {}
        for ci, cn in enumerate(CHANNELS):
            sel = ch_of == ci
            a, f = A[:, sel, :], F[:, sel, :]
            row[cn] = dict(wape_sku=float(np.abs(a - f).sum() / a.sum()), bias=float((f.sum() - a.sum()) / a.sum()),
                           # aggregated to channel total per origin-horizon
                           wape_total=float(np.abs(a.sum(1) - f.sum(1)).sum() / a.sum()))
        a, f = A, F
        row["All"] = dict(wape_sku=float(np.abs(a - f).sum() / a.sum()), bias=float((f.sum() - a.sum()) / a.sum()),
                          wape_total=float(np.abs(a.sum(1) - f.sum(1)).sum() / a.sum()))
        res[k] = row
    # pick per-channel best method by SKU-level WAPE
    best = {cn: min(METHODS, key=lambda k: res[k][cn]["wape_sku"]) for cn in CHANNELS}
    # naive baseline comparator = ma12 (flat) and last-year-same-month
    # ---- residual spread per series for the chosen method (for safety stock & intervals)
    sig = np.zeros(len(keys)); ratio_q = {}
    for ci, cn in enumerate(CHANNELS):
        k = best[cn]; sel = np.where(ch_of == ci)[0]
        A = np.stack(bt[k]["A"], 0)[:, sel, :]; F = np.stack(bt[k]["F"], 0)[:, sel, :]
        err = (A - F)                                    # (origin, series, h)
        sig[sel] = np.sqrt((err ** 2).mean(axis=(0, 2)))
        # pooled multiplicative error distribution for intervals (series with meaningful volume)
        mask = F > np.percentile(F[F > 0], 25)
        rr = (A[mask] / np.maximum(F[mask], 1e-9))
        ratio_q[cn] = [float(np.quantile(rr, q)) for q in (0.1, 0.5, 0.9)]
    # ---- final forecast from full history
    fc = np.zeros((len(keys), H))
    for ci, cn in enumerate(CHANNELS):
        sel = ch_of == ci
        fc[sel] = METHODS[best[cn]](M[sel], H)
    # holdout display: train to Jun-26, predict Jul..Sep-26 (chosen method)
    ho = {}
    for ci, cn in enumerate(CHANNELS):
        sel = ch_of == ci
        f = METHODS[best[cn]](M[sel, :33], 3).sum(0); a = M[sel, 33:36].sum(0)
        ho[cn] = dict(actual=a.tolist(), fc=f.tolist())
    hist_tot = {cn: M[ch_of == ci].sum(0).tolist() for ci, cn in enumerate(CHANNELS)}
    fut_tot = {cn: fc[ch_of == ci].sum(0).tolist() for ci, cn in enumerate(CHANNELS)}
    # LTM price per product x channel for revenue conversion
    ltm = s[s.Order_Date >= LTM_START]
    px = ltm.groupby(["ci", "pi"]).agg(q=("Quantity", "sum"), net=("Net_Sales_EGP", "sum"), cg=("Estimated_COGS_EGP", "sum"))
    # rolling-origin accuracy over time (for learning-loop scorecard): per origin WAPE of the chosen method, all channels
    roll = []
    for j, o in enumerate(ORIG):
        a = 0; e = 0
        for ci, cn in enumerate(CHANNELS):
            sel = ch_of == ci; k = best[cn]; i = bt[k]["o"].index(o)
            A = bt[k]["A"][i][sel]; F = bt[k]["F"][i][sel]
            a += A.sum(); e += np.abs(A - F).sum()
        roll.append(dict(origin=MONTHS[o], wape=float(e / a)))
    out = dict(keys=keys, M=M, fc=fc, sig=sig, ch_of=ch_of, px=px,
               meta=dict(best=best, labels=LABEL, results=res, holdout=ho, hist_tot=hist_tot, fut_tot=fut_tot, months_future=FUT,
                         ratio_q=ratio_q, rolling=roll, origins=[MONTHS[o] for o in ORIG]))
    return out
