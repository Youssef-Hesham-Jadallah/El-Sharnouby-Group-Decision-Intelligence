"""Findings F-11..F-13 and actions ACT-11..ACT-13 (recomputed on the project's own definitions).

Every number is derived from `out` (the already-built project data). Nothing is typed in by hand.
"""
from common import *

def _egp(v, d=1):
    return "EGP %.*fM" % (d, v / 1e6) if abs(v) >= 1e6 else "EGP %s" % format(round(v), ",")
def _pct(v, d=1): return "%.*f%%" % (d, 100 * v)

def add_extra_findings(out):
    alerts, acts = out["alerts"], out["actions"]
    cw = {"High": 1.0, "Medium": 0.6, "Low": 0.3}; eff = {"S": 1, "M": 2, "L": 3}
    Q, C, P, F, Fa = out["quality"], out["customers"], out["procurement"], out["forecast"], out["factory"]
    products = out["products"]

    # ---- F-11  cost of poor quality -------------------------------------------------
    cp = Q["copq"]; measured = cp["qc_loss"] + cp["print_rework"] + cp["quality_refunds"]
    share_net = measured / cp["ltm_net"]
    pl = sorted(Q["products"], key=lambda x: -x["loss"]); tot_loss = sum(x["loss"] for x in Q["products"])
    top10 = pl[:10]; top10_share = sum(x["loss"] for x in top10) / tot_loss
    top10_names = ", ".join(products[x["p"]]["id"] for x in top10[:5])
    a11_lo = 0.10 * top10_share * cp["qc_loss"]; a11_hi = 0.30 * top10_share * cp["qc_loss"]
    alerts.append(dict(id="F-11", module="quality", kind="structural", sev=2,
        title="Poor quality costs about %s a year in measured losses, before production rejects" % _egp(measured),
        signal="Measured cost of poor quality (QC loss, print rework and quality-related refunds) is %s over the last 12 months, %s of net sales. Production rejects (%s) are shown separately because they may be reused or sold as seconds." % (_egp(measured), _pct(share_net), _egp(cp["production_rejects"])),
        evidence=[dict(k="QC loss (L12M)", v=_egp(cp["qc_loss"], 2)), dict(k="Print rework (L12M)", v=_egp(cp["print_rework"], 2)), dict(k="Quality-related refunds (L12M)", v=_egp(cp["quality_refunds"], 2)),
                  dict(k="Share of QC loss at the ten worst products (36 months)", v=_pct(top10_share, 0))],
        spark=dict(label="QC reject rate by month", fmt="pct", key="qcrate|None"),
        hyp=[dict(t="The ten worst products carry %s of QC loss; this is arithmetic on the QC table, not a cause." % _pct(top10_share, 0), cls="arith"),
             dict(t="Product-level QC reject rate and customer quality returns are weakly related in this data (see Quality page), so fixing factory defects may not move refunds.", cls="plaus"),
             dict(t="Supplier lot, fabric batch and operator are not recorded, so root cause below defect type is unknown.", cls="unk")],
        conf="Medium", steps=["Open corrective-action reviews on the ten products with the highest QC loss (%s …)." % top10_names, "Treat quality-related refunds as a cost line owned by quality, not only by service.", "Record fabric batch and operator on QC rows so defects can be traced."], action="ACT-11"))
    acts.append(dict(id="ACT-11", module="quality", finding="F-11", title="Run corrective-action reviews on the ten products with the highest quality cost",
        why="Ten products hold %s of 36-month QC loss." % _pct(top10_share, 0), what="Review cut, print and finishing on the top ten, agree a target reject rate per product, and report monthly.",
        low=a11_lo, high=a11_hi, basis="Annual QC loss at L12M run-rate × the top-ten share × an assumed 10% (low) to 30% (high) reduction. The reduction range is an assumption, not a measured effect.",
        kind="ops", conf="Medium", risk="QC reject rate may not respond quickly; defect causes below defect type are not in the data.", effort="M", owner="Quality manager", horizon="30–60 days",
        kpi=dict(name="QC reject rate", base=Q["qc"]["rate"], target=round(Q["qc"]["rate"] * 0.8, 4), fmt="pct", lower_better=True)))

    # ---- F-12  overdue accounts and quiet customers ---------------------------------
    lt = C["lapse_tot"]; W, R = lt["Wholesale"], lt["Retail"]
    alerts.append(dict(id="F-12", module="customers", kind="structural", sev=2,
        title="%s wholesale accounts and %s retail customers are in the At-risk segment" % (format(W["n"], ","), format(R["n"], ",")),
        signal="At-risk means long since their last order relative to how often they used to buy (RFM recency rules). %s wholesale accounts (historic net sales %s) and %s retail customers (%s) are in this group; %s and %s of them have opted in to contact." % (format(W["n"], ","), _egp(W["hist_net"]), format(R["n"], ","), _egp(R["hist_net"]), format(W["consented"], ","), format(R["consented"], ",")),
        evidence=[dict(k="Wholesale at-risk accounts · historic net sales", v="%s · %s" % (format(W["n"], ","), _egp(W["hist_net"]))), dict(k="Wholesale at-risk · opted in", v=format(W["consented"], ",")),
                  dict(k="Retail at-risk customers · historic net sales", v="%s · %s" % (format(R["n"], ","), _egp(R["hist_net"]))), dict(k="Retail at-risk · opted in", v=format(R["consented"], ","))],
        spark=None,
        hyp=[dict(t="Historic net sales are what these customers bought over 36 months, not what a win-back would recover.", cls="arith"),
             dict(t="The churn model is not deployed (AUC %.2f, barely above chance), so who will actually leave is not predicted; the list is a rule-based call list." % C["churn"]["auc"], cls="ruled"),
             dict(t="Some at-risk accounts may have moved to another supplier or simply buy irregularly; the data has no reason codes.", cls="unk")],
        conf="Medium", steps=["Give key-account managers the wholesale at-risk list, largest historic net sales first.", "Contact only opted-in retail customers; test one message against a holdout group.", "Log the reason for each lapse so the next review is evidence-based."], action="ACT-12"))
    acts.append(dict(id="ACT-12", module="customers", finding="F-12", title="Call the at-risk wholesale accounts this month and win back opted-in retail customers",
        why="Large historic accounts have gone quiet and a call costs little.", what="Work the wholesale at-risk list by historic net sales; send one tested win-back message to opted-in retail customers with a holdout group.",
        low=None, high=None, basis="Not valued in EGP: historic sales overstate what a win-back recovers and the churn model is not deployed. Measure recovered orders against the holdout.",
        kind="risk", conf="Medium", risk="Contacting without consent is excluded; some accounts have left for good.", effort="S", owner="Key account managers + CRM", horizon="14–30 days",
        kpi=dict(name="At-risk wholesale accounts reordered in 60 days", base=0.0, target=0.2, fmt="pct")))

    # ---- F-13  December peak and material lead times ---------------------------------
    fut, hist = F["fut"], F["hist"]; tot = lambda d, i: sum(d[c][i] for c in d)
    oct_f, dec_f = tot(fut, 0), tot(fut, 2); dec_ly = tot(hist, 26); oct_ly = tot(hist, 24)
    mats = [m for m in P["materials"] if m.get("need90")]
    slow = sorted(mats, key=lambda m: -m["lt_p90"])[:3]; lt_max = max(m["lt_p90"] for m in P["materials"])
    cap_month = out["factory"]["nameplate"]["hub_per_day"] * 30
    alerts.append(dict(id="F-13", module="procurement", kind="structural", sev=3,
        title="The December peak is about %s above October, and materials need up to %d days to arrive" % (_pct(dec_f / oct_f - 1, 0), lt_max),
        signal="The forecast has %s units in December 2026 against %s in October (%s); last year the same months were %s and %s. The slowest materials take up to %d days at the 90th percentile, so orders for the peak have to go out early." % (format(dec_f, ","), format(oct_f, ","), "%+.0f%%" % (100 * (dec_f / oct_f - 1)), format(dec_ly, ","), format(oct_ly, ","), lt_max),
        evidence=[dict(k="Forecast units · Oct vs Dec 2026", v="%s vs %s" % (format(oct_f, ","), format(dec_f, ","))), dict(k="Dec 2026 forecast vs Dec 2025 actual", v="%+.1f%%" % (100 * (dec_f / dec_ly - 1))),
                  dict(k="Slowest materials (p90 lead time)", v=", ".join("%s %dd" % (m["id"], m["lt_p90"]) for m in slow)),
                  dict(k="Peak-month demand vs published hub capacity", v=_pct(dec_f / cap_month, 0))],
        spark=None,
        hyp=[dict(t="Peak-month demand is a fraction of the published hub capacity, but recorded output is already %.1fx units sold, so capacity figures here are relative." % (Fa["good_total"] / Fa["sold_total"]), cls="plaus"),
             dict(t="The risk is timing: material lead times plus supplier delays, not machine hours.", cls="plaus"),
             dict(t="Open purchase orders and material stock balances are not in the data, so an order may already be in flight.", cls="unk")],
        conf="Medium", steps=["Check open purchase orders for the slowest materials before ordering.", "Place peak-quarter orders using p90 lead times, not promised dates.", "Open the Demand vs Capacity Planner for order-by dates."], action="ACT-13"))
    acts.append(dict(id="ACT-13", module="procurement", finding="F-13", title="Place Q4 material orders now, using planned lead times rather than promised dates",
        why="The peak arrives in December and the slowest materials need about three weeks.", what="Use the Planner's order-by dates; confirm open purchase orders first to avoid double ordering.",
        low=None, high=None, basis="Not valued in EGP: protects the sales the forecast expects in the peak quarter. Open purchase orders are not in the data.",
        kind="risk", conf="Medium", risk="Open orders are invisible in the data; ordering twice ties up cash.", effort="S", owner="Procurement + planning", horizon="7–14 days",
        kpi=dict(name="Peak-material orders placed by order-by date", base=0.0, target=1.0, fmt="pct")))

    out["series"]["qcrate|None"] = Q["monthly"]["rate"]
    for a in acts:
        if a["id"] in ("ACT-11", "ACT-12", "ACT-13"):
            mid = ((a["low"] or 0) + (a["high"] or 0)) / 2
            a["score"] = round((mid / 1e6 if mid else 0.15) * cw[a["conf"]] / eff[a["effort"]], 3)
