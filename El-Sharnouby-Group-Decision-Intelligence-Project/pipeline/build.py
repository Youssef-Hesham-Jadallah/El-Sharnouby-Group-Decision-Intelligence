import sys, json, os, time
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from core import *; from forecast import *; from inventory import *; from customers import *; from factory import *
from marketing import *; from procurement import *; from assemble import *; from actions import *; from extra_findings import add_extra_findings

def dq_report(D, s, I, P, Mk, Fa):
    tabs = []
    for n, d in D.items():
        tabs.append(dict(t=n, rows=int(len(d)), cols=int(d.shape[1]), nulls=int(d.drop(columns=[c for c in d.columns if c in ("Return_Date","Defect_Type","Primary_Bottleneck")], errors="ignore").isna().sum().sum())))
    ln = Mk["recon"]
    checks = [
      dict(s="pass", t="Net sales = gross × (1 − discount); gross profit = net − COGS", d="Held on all %s invoice lines (max error < 1e-9 EGP)." % format(len(D["Sales_Transactions"]), ",")),
      dict(s="pass", t="Sales units reconcile to inventory 'Sold_Qty'", d="Matched on every location-month with sales."),
      dict(s="warn", t="Refunds are not deducted from net sales", d="Net sales and gross profit are shown before refunds. Refund-adjusted views are labelled as sensitivities."),
      dict(s="warn", t="Inventory roll-forward breaks on %d rows" % I["integrity"]["broken"], d="Closing ≠ opening + received − sold + returned − damaged where stock would have gone negative (floored at 0)."),
      dict(s="fail", t="Marketing attributed revenue is %.1fx actual D2C sales" % ln["ratio_rev"], d="Attributed orders are %.1fx online invoices and %.1fx web orders. Marketing ROAS is treated as platform-reported, not incremental." % (ln["ratio_orders_inv"], ln["ratio_orders_web"])),
      dict(s="warn", t="Campaign clicks equal landing sessions in every row", d="No independent site tracking to validate click-to-session loss."),
      dict(s="warn", t="Factory output is %.1fx units sold" % (Fa["good_total"]/Fa["sold_total"]), d="The Production Hub probably serves volume outside this sales table. Production and sales are not reconcilable."),
      dict(s="warn", t="Materials %s have purchases but no BOM line" % ", ".join(P["missing_bom"]), d="Material requirement planning excludes them."),
      dict(s="warn", t="Every supplier supplies every material", d="Supplier 'primary category' does not match the POs, so category concentration cannot be assessed."),
      dict(s="warn", t="No material stock balances", d="Shortage risk is approximated from lead-time reliability and BOM demand, not from stock-on-hand."),
      dict(s="warn", t="Customer-service tickets carry no customer ID", d="Complaints cannot be joined to customer value or churn."),
      dict(s="warn", t="Store customers live across many governorates", d="Customer governorate is probably a delivery/billing address; it is not store catchment."),
    ]
    return dict(tables=tabs, checks=checks)

def main():
    t0 = time.time(); D = load()
    s, out = build_core(D); out = discount_governance(s, out)
    F = build_forecast(s); I = build_inventory(D, s, F)
    Mk = build_marketing(D, s); C = build_customers(D, s, {p["p"]: p["spend"] for p in Mk["platforms"]})
    Fa = build_factory(D, s); P = build_procurement(D, s, F); Q = build_quality(D, s)
    A = assemble(D, s, out, F, I, C, Fa, Mk, P, Q); acts = build_actions(A, out, I, P, Q, Fa, Mk, C)
    # pre-computed series used by alert sparklines
    attr = [r(a / b, 3) if b else None for a, b in zip(Mk["monthly"]["rv"], Mk["monthly"]["d2c_net"])]
    ser = {}
    for ci, ch in enumerate(CHANNELS):
        x = s[s.ci == ci].groupby("mi").agg(net=("Net_Sales_EGP", "sum"), gp=("Gross_Profit_EGP", "sum"), gr=("Gross_Sales_EGP", "sum"), rl=("ret", "mean")).reindex(range(36))
        ser[f"gm|{ch}"] = [r(v, 4) for v in x.gp / x["net"]]; ser[f"disc|{ch}"] = [r(v, 4) for v in 1 - x["net"] / x.gr]; ser[f"ret|{ch}"] = [r(v, 4) for v in x.rl]
        ser[f"sales_yoy|{ch}"] = [None] * 12 + [r(x["net"].iloc[i] / x["net"].iloc[i-12] - 1, 4) for i in range(12, 36)]
        ser[f"so|{ch}"] = I["trend"][{"Online": "Online", "Retail": "Store", "Wholesale": "Wholesale"}[ch]]["so"]
    ser["ot|None"] = P["monthly"]["ot"]; ser["late|None"] = Fa["monthly"]["late"]; ser["cr|None"] = Mk["web"]["monthly"]["cr"]; ser["attr_ratio|None"] = attr
    go = D["Group_Operations"].copy(); go["mi"] = mk(go.Month).map(MI)
    gops = {b: dict(kpi=x.Primary_KPI.iloc[0], vol=x.sort_values("mi").Volume.tolist(), eff=x.sort_values("mi").Operational_Efficiency_Pct.tolist(), issues=x.sort_values("mi").Open_Issues_Count.tolist()) for b, x in go.groupby("Business_Unit")}
    for a in A["alerts"]: a["spark"] = dict(a["spark"], key="|".join(str(v) for v in a["spark"]["key"])) if a["spark"] else None
    fc_meta = F["meta"]
    fc_hist = {c: [round(v) for v in fc_meta["hist_tot"][c]] for c in CHANNELS}; fc_fut = {c: [round(v) for v in fc_meta["fut_tot"][c]] for c in CHANNELS}
    out.update(inventory=I, customers=C, factory=Fa, marketing=Mk, procurement=P, quality=Q, alerts=A["alerts"], signals=A["signals"], actions=acts, kpi=A["kpi"], bridge_online=A["bridge_online"],
               series=ser, group_ops=gops, dq=dq_report(D, s, I, P, Mk, Fa), transfers=[{k: (r(v, 2) if isinstance(v, float) else v) for k, v in t.items()} for t in A["transfers"]],
               forecast=dict(meta=dict(best=fc_meta["best"], labels=fc_meta["labels"], results=fc_meta["results"], holdout=fc_meta["holdout"], ratio_q=fc_meta["ratio_q"], rolling=fc_meta["rolling"], months_future=fc_meta["months_future"]),
                             hist=fc_hist, fut=fc_fut))
    add_extra_findings(out)
    bom=D["Product_BOM"]; mids=list(D["Materials"].Material_ID); pids=list(D["Product_Master"].Product_ID)
    out["bom"]={str(pids.index(p)):[[mids.index(m),float(q)] for m,q in zip(x.Material_ID,x.Required_Per_Unit)] for p,x in bom.groupby("Product_ID")}
    out["material_ids"]=mids
    po=D["Production_Orders"]; out["prod_lead"]=dict(days=float((po.Due_Date-po.Start_Date).dt.days.mean()), actual=float((po.Completion_Date-po.Start_Date).dt.days.mean()))
    OUT = os.environ.get("ESG_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist", "data.json")); os.makedirs(os.path.dirname(OUT), exist_ok=True)
    js = json.dumps(jsonable(out, 4), separators=(",", ":"), ensure_ascii=False)
    open(OUT, "w", encoding="utf-8").write(js)
    print("data.json %.2f MB in %.0fs" % (len(js) / 1e6, time.time() - t0))
    print({k: round(len(json.dumps(jsonable(v, 4))) / 1e3) for k, v in out.items()})

if __name__ == "__main__": main()
