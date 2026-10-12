from common import *

def build_actions(A, out, I, P, Q, Fa, Mk, C):
    n = A["nums"]; k = A["kpi"]; dg = out["discount_gov"]
    eff = {"S": 1, "M": 2, "L": 3}; cw = {"High": 1.0, "Medium": 0.6, "Low": 0.3}
    sc32 = [x for x in dg["scenarios"] if x["cap"] == 32][0]
    acts = [
     dict(id="ACT-01", module="discount", title="Cap wholesale discounts at 32% and replace per-invoice tiers with a volume ladder", finding="F-01",
          why="Discount depth is unrelated to order size, so deep tiers give margin away without buying volume.", what=f"Approve any wholesale discount above 32% centrally; test a volume-linked ladder (App 14). {sc32['lines_aff']:,} LTM lines are affected.",
          low=n["a1_lo"], high=n["a1_hi"], basis="Annual gross profit at last-12-month run-rate. Low case assumes 25% of affected volume is lost; high case assumes none.",
          kind="profit", conf="High", risk="Large buyers may push back; measured volume response to discount is ~0 so the volume risk is low, but untested for a cap.", effort="M", owner="Sales director + Finance", horizon="30–60 days",
          kpi=dict(name="Wholesale gross margin", base=n["w_gm"], target=n["w_gm"] + 0.03, fmt="pct")),
     dict(id="ACT-02", module="discount", title="Roll online discount depth back toward its 2025 level", finding="F-02",
          why="Average online discount rose in Q2 2026 and eroded gross margin; no volume response has ever been measured.", what="Set an online discount guardrail, hold out half the traffic at the old depth for two weeks, then decide.",
          low=0.5 * n["disc_cost_annual"], high=n["disc_cost_annual"], basis="Annualised extra discount cost on online gross sales (Apr–Sep 2026 × 2). Low case recovers half.",
          kind="profit", conf="High", risk="If the 2026 online growth is discount-driven, volume could dip; the holdout measures this before rollout.", effort="S", owner="E-commerce lead", horizon="14–30 days",
          kpi=dict(name="Online avg discount", base=A["bridge_online"]["d1"], target=A["bridge_online"]["d0"], fmt="pct", lower_better=True)),
     dict(id="ACT-03", module="inventory", title="Move surplus D2C stock to wholesale, freeze D2C replenishment, and produce the wholesale gap", finding="F-03",
          why="Wholesale holds very little stock cover while store/online hold far more; the surplus SKUs rarely match the deficit SKUs.", what=f"Transfer {n['rtot']['units']:,} units (App 11), stop replenishing SKUs above 180 days, open production for ~{n['rec_w']:,} wholesale units.",
          low=n["rtot"]["value"], high=n["excess"], basis="Cash released from stock (one-off, not annual profit): transfers at cost (low) up to all excess above 120 days of cover (high). Avoided wholesale lost sales are ~EGP %0.2fM gross profit per year." % (n["lost_gp"]/1e6),
          kind="cash", conf="Medium", risk="Confirm that wholesale and D2C stock can be shipped between channels; clearance of the remaining excess may require markdowns.", effort="M", owner="Supply chain", horizon="30–90 days",
          kpi=dict(name="Wholesale median days of cover", base=I["summary"]["by_loc"]["Wholesale"]["cover_med"], target=45, fmt="num")),
     dict(id="ACT-04", module="procurement", title="Put the two weakest suppliers on a recovery plan and move trial volume to reliable suppliers", finding="F-04",
          why="They deliver on time far less often than their peers.", what="Contract review, weekly OTIF reporting, and shift 30% of their volume per material to the best three suppliers.",
          low=None, high=None, basis="Risk reduction, not priced: %.0f%% of purchase spend is exposed." % (n["spend_risk"] / P["totals"]["spend"] * 100),
          kind="risk", conf="High", risk="Alternative suppliers may need qualification; price indices are close to peers so cost impact should be small.", effort="M", owner="Procurement", horizon="60–90 days",
          kpi=dict(name="Supplier on-time rate (all)", base=P["totals"]["ontime"], target=0.75, fmt="pct")),
     dict(id="ACT-05", module="factory", title="Attack the sewing bottleneck first", finding="F-05",
          why="Sewing is a small share of orders but a disproportionate share of delay days.", what="Time-study the sewing lines, fix operator availability, and smooth order release across lines.",
          low=None, high=None, basis="Delay days: closing half the gap would save about %.0f delay-days per year." % (n["sew_days_saved"] / 2),
          kind="ops", conf="Medium", risk="Overtime may be a symptom, not a cause; do not add overtime before the study.", effort="M", owner="Plant manager", horizon="30–90 days",
          kpi=dict(name="Late production orders", base=Fa["ltm"]["late"], target=0.10, fmt="pct", lower_better=True)),
     dict(id="ACT-06", module="marketing", title="Fix attribution and judge budgets on blended MER until incrementality is tested", finding="F-06",
          why="Reported revenue is a multiple of actual D2C sales; platform ROAS is not credible.", what="De-duplicate conversions by order ID and run a holdout on WhatsApp/CRM and Meta.",
          low=None, high=None, basis="Measurement fix. Without it, every reallocation decision rests on over-counted revenue.", kind="risk", conf="High", risk="None material; cost is analyst time and a short holdout.", effort="S", owner="Marketing + Analytics", horizon="30 days",
          kpi=dict(name="Attributed ÷ actual D2C sales", base=Mk["recon"]["ratio_rev"], target=1.0, fmt="x", lower_better=True)),
     dict(id="ACT-07", module="quality", title="Cut online size/fit returns with size charts and fit notes", finding="F-07",
          why="Online returns are well above the store rate; size/fit is the biggest reason.", what="Per-product size guides, model measurements and a size-guidance FAQ on the product page.",
          low=0.25 * n["oe"]["ltm_refund"], high=0.5 * n["oe"]["ltm_refund"], basis="Refund value avoided per year: 25–50% of the LTM excess over the store return rate. Returned stock is not assumed to be resold.",
          kind="profit", conf="Medium", risk="Return rate may not respond to content alone.", effort="S", owner="E-commerce + Merchandising", horizon="30–60 days",
          kpi=dict(name="Online return rate", base=Q["channel_returns"][0]["rate"], target=0.06, fmt="pct", lower_better=True)),
     dict(id="ACT-08", module="exec", title="Diagnose the store sales decline before the next replenishment", finding="F-08",
          why="Store sales are declining while stock cover is the highest in the group.", what="Add footfall counters, compare store vs online, and cap store replenishment.",
          low=None, high=None, basis="Diagnostic. Store gross profit is ~EGP %0.1fM a year." % (k["ltm"]["by_ch"]["Retail"]["gp"] / 1e6), kind="risk", conf="Low", risk="Cause is not identifiable from the data.", effort="S", owner="Retail manager", horizon="30 days",
          kpi=dict(name="Store net sales YoY", base=n["retail_yoy"], target=0.0, fmt="pct")),
     dict(id="ACT-09", module="marketing", title="Add a page-speed guardrail (alert above 3.0s)", finding="F-09",
          why="Conversion fell sharply in Q4 2025 when pages were slow.", what="Alert on page load and conversion; log releases and campaign starts on the same timeline.",
          low=0.0, high=n["lost_orders"] * n["online_aov"] * k["ltm"]["gp"] / k["ltm"]["net"], basis="Gross profit protected if a repeat of Q4 2025 is avoided (one-off exposure).", kind="profit", conf="Medium", risk="Low.", effort="S", owner="E-commerce / IT", horizon="14 days",
          kpi=dict(name="Web conversion", base=Mk["web"]["monthly"]["cr"][-1], target=0.029, fmt="pct2")),
     dict(id="ACT-10", module="data", title="Reconcile production, BOM and purchasing data with sales", finding="F-10",
          why="Factory output is a multiple of units sold and several purchases are outside the BOM.", what="Split production by customer/brand, complete the BOM for the materials that are missing from it, and add material stock balances.",
          low=None, high=None, basis="Data foundation. Several procurement and factory conclusions stay provisional until this is done.", kind="risk", conf="High", risk="None.", effort="M", owner="Finance + Operations", horizon="60 days",
          kpi=dict(name="Output ÷ units sold", base=n["prod_ratio"], target=1.0, fmt="x", lower_better=True)),
    ]
    for a in acts:
        mid = ((a["low"] or 0) + (a["high"] or 0)) / 2 if a["kind"] != "cash" else 0
        a["score"] = round((mid / 1e6 if mid else 0.15) * cw[a["conf"]] / eff[a["effort"]], 3)
    return acts
