"""Cross-location rebalancing (default parameters). Mirrors the JS implementation used in the app."""
from common import *

def rebalance(inv_rows, keep_days=120, transit_days=3, transport_cost=4.0):
    by_p = {}
    for x in inv_rows: by_p.setdefault(x["p"], []).append(x)
    transfers = []
    for p, rows in by_p.items():
        info = {}
        for x in rows:
            dd90 = x["f90"] / 91.2
            keep = max(x["tgt"], dd90 * keep_days)
            deficit = max(0.0, x["tgt"] - x["stock"])
            # shortage that will occur before a normal replenishment lands (lead time) minus what stock covers
            d_lt = x["f30"] / 30.4 * x["lt"]
            shortage = max(0.0, d_lt - x["stock"])
            info[x["l"]] = dict(x=x, surplus=max(0.0, x["stock"] - keep), deficit=deficit, shortage=shortage)
        donors = sorted([(k, v) for k, v in info.items() if v["surplus"] >= 1], key=lambda kv: -kv[1]["surplus"])
        recv = sorted([(k, v) for k, v in info.items() if v["deficit"] >= 1], key=lambda kv: -kv[1]["deficit"])
        for rk, rv in recv:
            need = rv["deficit"]
            for dk, dv in donors:
                if dk == rk or need < 1: continue
                q = int(min(dv["surplus"], need))
                if q < 1: continue
                dv["surplus"] -= q; need -= q
                covered_short = min(q, rv["shortage"]); rv["shortage"] -= covered_short
                u = rv["x"]
                transfers.append(dict(p=p, frm=dk, to=rk, qty=q, short_cov=covered_short, value=q * dv["x"]["uc"], gp_unit=(u["nu"] - u["uc"]) if u["nu"] else 0.0,
                                      lost_gp=covered_short * ((u["nu"] - u["uc"]) if u["nu"] else 0.0), cost=q * transport_cost))
    tot = dict(lines=len(transfers), units=sum(t["qty"] for t in transfers), value=sum(t["value"] for t in transfers), short_cov=sum(t["short_cov"] for t in transfers),
               lost_gp=sum(t["lost_gp"] for t in transfers), cost=sum(t["cost"] for t in transfers))
    return transfers, tot
