"""Curated findings, alerts and actions assembled from computed evidence. Every number comes from the data."""
from common import *
from insight import *
from rebalance import rebalance

def pct(x, d=1): return f"{x*100:.{d}f}%"
def egp(x):
    a = abs(x)
    if a >= 1e6: return f"EGP {x/1e6:.2f}M"
    if a >= 1e3: return f"EGP {x/1e3:.0f}K"
    return f"EGP {x:.0f}"

def assemble(D, s, out, F, I, C, Fa, Mk, P, Q):
    dg = out["discount_gov"]; meta_p = out["products"]
    ltm = s[s.Order_Date >= LTM_START]; pri = s[(s.Order_Date >= PRIOR_START) & (s.Order_Date < LTM_START)]
    def ch(x, c): return x[x.Channel == c]
    kpi = {}
    for nm, x in [("ltm", ltm), ("prior", pri)]:
        kpi[nm] = dict(net=r(x.Net_Sales_EGP.sum(), 0), gp=r(x.Gross_Profit_EGP.sum(), 0), units=int(x.Quantity.sum()), gross=r(x.Gross_Sales_EGP.sum(), 0), refund=r(x.Refund_Value_EGP.sum(), 0),
                       by_ch={c: dict(net=r(ch(x, c).Net_Sales_EGP.sum(), 0), gp=r(ch(x, c).Gross_Profit_EGP.sum(), 0), units=int(ch(x, c).Quantity.sum())) for c in CHANNELS})
    # ---------- statistical signals
    L = build_series(s, D, I, Fa, Mk, P, Q); sig = detect(L)
    sig = [a for a in sig if not (a["kind"] == "so" and a["recent"] < 5)]
    # ---------- online margin bridge (arithmetic attribution)
    br = gm_bridge(s, "Online", pd.Timestamp("2025-04-01"), pd.Timestamp("2025-09-30"), pd.Timestamp("2026-04-01"), pd.Timestamp("2026-09-30"))
    on = s[(s.Channel == "Online") & (s.Order_Date >= "2026-04-01")]
    gross_6m = on.Gross_Sales_EGP.sum()
    disc_cost_annual = 2 * gross_6m * (br["d1"] - br["d0"])
    # ---------- wholesale
    w_l = ch(ltm, "Wholesale"); w_gm = w_l.Gross_Profit_EGP.sum() / w_l.Net_Sales_EGP.sum()
    sc32 = [x for x in dg["scenarios"] if x["cap"] == 32][0]; sc35 = [x for x in dg["scenarios"] if x["cap"] == 35][0]
    a1_hi = sc32["aff_new"] - sc32["aff_old"]; a1_lo = 0.75 * sc32["aff_new"] - sc32["aff_old"]
    # ---------- inventory
    rows = I["rows"]; dfi = pd.DataFrame(rows)
    d_w = dfi[dfi.l == "Wholesale"]; d_d2c = dfi[dfi.l != "Wholesale"]
    transfers, rtot = rebalance(rows)
    lost_net = float((d_w.so12 * d_w.ads90 * d_w.nu).sum()); lost_gp = float((d_w.so12 * d_w.ads90 * (d_w.nu - d_w.uc)).sum())
    excess = I["summary"]["excess_value"]; rec_w = int(d_w.rec.sum())
    # ---------- supplier
    sup = {x["id"]: x for x in P["suppliers"]}; _worst = sorted(P["suppliers"], key=lambda x: x["ontime"])[:2]; S1, S2 = _worst[0]["id"], _worst[1]["id"]
    peers = [x for x in P["suppliers"] if x["id"] not in (S1, S2)]
    peer_ot = np.mean([x["ontime"] for x in peers]); peer_late5 = np.mean([x["late5"] for x in peers])
    spend_risk = sup[S1]["spend"] + sup[S2]["spend"]
    home_gov = s[s.Channel == "Retail"].Customer_Governorate.mode().iloc[0]
    # ---------- factory
    bn = {b["bn"]: b for b in Fa["bottlenecks"]}; sew = bn["Sewing"]
    po = D["Production_Orders"]; po_l = po[(po.Completion_Date >= LTM_START) & (po.Primary_Bottleneck == "Sewing")]
    sew_days_saved = float(len(po_l) * (sew["delay"] - np.mean([bn[k]["delay"] for k in ("Cutting", "Printing", "Packing")])))
    # ---------- marketing
    rc = Mk["recon"]; infl = [p for p in Mk["platforms"] if p["p"] == "Influencer"][0]
    infl_gp = infl["rev_ltm"] * rc["online_gm"]; infl_net = infl_gp - infl["spend_ltm"]
    # ---------- returns
    oe = Q["online_excess"]
    # ---------- retail
    retail_yoy = kpi["ltm"]["by_ch"]["Retail"]["net"] / kpi["prior"]["by_ch"]["Retail"]["net"] - 1
    online_yoy = kpi["ltm"]["by_ch"]["Online"]["net"] / kpi["prior"]["by_ch"]["Online"]["net"] - 1
    store_cover = I["summary"]["by_loc"]["Store"]["cover_med"]; wh_cover = I["summary"]["by_loc"]["Wholesale"]["cover_med"]
    # web incident
    wq = {q["q"]: q for q in Mk["web"]["quarters"]}; inc = wq["2025Q4"]; base_cr = np.mean([wq[q]["cr"] for q in ("2025Q1", "2025Q2", "2026Q1", "2026Q2")])
    lost_orders = (base_cr - inc["cr"]) * inc["sess"]
    online_aov = kpi["ltm"]["by_ch"]["Online"]["net"] / ltm[ltm.Channel == "Online"].Invoice_ID.nunique()
    prod_ratio = Fa["good_total"] / Fa["sold_total"]

    alerts = []
    def add(**k): alerts.append(k)
    add(id="F-01", module="discount", kind="structural", sev=4, title="Wholesale discounts are not tied to volume, customer or product",
        signal=f"Wholesale earns {pct(w_gm)} gross margin on {egp(kpi['ltm']['by_ch']['Wholesale']['net'])} of LTM sales. Discount tiers of {dg['tiers_all'][0]['d']}–{dg['tiers_all'][-1]['d']}% are assigned with no relationship to order size.",
        evidence=[dict(k="Order quantity vs discount (Spearman ρ)", v=f"{dg['corr_qty_disc']['spearman']:.3f}  (p = {dg['corr_qty_disc']['p']:.2f})"),
                  dict(k="Customer volume vs avg discount (ρ)", v=f"{dg['cust_corr']['spearman']:.3f}  (p = {dg['cust_corr']['p']:.2f}, n = {dg['cust_corr']['n']})"),
                  dict(k=f"Margin at {dg['tiers_all'][0]['d']}% / {dg['tiers_all'][-1]['d']}% discount", v=f"{pct(dg['tiers_all'][0]['gp']/dg['tiers_all'][0]['ne'])} / {pct(dg['tiers_all'][-1]['gp']/dg['tiers_all'][-1]['ne'])}"),
                  dict(k="Loss-making invoice lines (all time)", v=f"{dg['neg_lines']:,}  ·  {egp(dg['neg_loss'])}"),
                  dict(k="Break-even discount (COGS ÷ list)", v=pct(dg["breakeven_disc"]))],
        spark=dict(label="Wholesale gross margin by month", fmt="pct", key=("gm", "Wholesale")),
        hyp=[dict(t=f"Margin is a direct arithmetic function of discount: COGS is a constant ~{dg['cogs_ratio']['mean']*100:.1f}% of list price in every channel, so each extra discount point removes a margin point.", cls="arith"),
             dict(t="Tier assignment looks unmanaged: bigger orders and bigger customers do not receive deeper (or shallower) discounts than small ones.", cls="plaus"),
             dict(t="Discount depth shows no measurable volume response in any channel (fixed-effects estimate, see App 14).", cls="corr")],
        conf="High", steps=["Pull the most recent approvals above the proposed cap and record who authorised them and why.", "Check whether tiers were agreed per customer contract or set per invoice.", "Model a volume-linked ladder (App 14) and test it with a small group of customers first."],
        action="ACT-01")
    add(id="F-02", module="discount", kind="statistical", sev=3, title="Online discounting crept up and is eroding margin",
        signal=f"Online average discount rose from {pct(br['d0'])} (Apr–Sep 2025) to {pct(br['d1'])} (Apr–Sep 2026); gross margin fell {abs(br['gm1']-br['gm0'])*100:.1f} pp to {pct(br['gm1'])}.",
        evidence=[dict(k="Gross margin Apr–Sep 25 → 26", v=f"{pct(br['gm0'])} → {pct(br['gm1'])}"), dict(k="…explained by discount depth", v=f"{br['disc_effect']*100:+.2f} pp (arithmetic)"),
                  dict(k="…explained by cost ratio / product mix", v=f"{br['cost_effect']*100:+.2f} pp"), dict(k="Online net sales LTM vs prior", v=f"{online_yoy*100:+.1f}%"),
                  dict(k="Annualised cost of the extra discount", v=egp(disc_cost_annual))],
        spark=dict(label="Online average discount by month", fmt="pct", key=("disc", "Online")),
        hyp=[dict(t=f"Discount depth explains ~{br['disc_effect']/(br['gm1']-br['gm0'])*100:.0f}% of the margin decline; cost ratio and product mix explain the rest. This is an identity, not a statistical inference.", cls="arith"),
             dict(t="The discount increase began in Q2 2026 and coincides with faster online growth, but growth was already strong and discount shows no volume response historically.", cls="corr"),
             dict(t="Cause of the policy change is not recorded in the data (promotion calendar, marketplace rules or campaign-linked codes are possible).", cls="unk")],
        conf="High", steps=["Match online discount codes and campaigns to the Q2-2026 step change.", "Run a 2-week holdout: keep the current discount on half of the traffic and compare conversion.", "Set a monthly discount-rate guardrail for online (alert when it exceeds its 2025 level)."],
        action="ACT-02")
    add(id="F-03", module="inventory", kind="structural", sev=3, title="Stock sits in the wrong place: wholesale starves while store and online overstock",
        signal=f"Wholesale desk holds {wh_cover:.0f} days of forecast cover and recorded {int(d_w.so12.sum())} SKU stockout days in 12 months. Store and online hold {store_cover:.0f}+ days.",
        evidence=[dict(k="Median days of cover (forecast-based)", v=f"Wholesale {wh_cover:.0f} · Online {I['summary']['by_loc']['Online']['cover_med']:.0f} · Store {store_cover:.0f}"),
                  dict(k="SKUs flagged stock-out risk at wholesale", v=f"{I['summary']['by_loc']['Wholesale']['risk']} of 59"),
                  dict(k="Excess stock (above 120 days cover)", v=f"{egp(excess)}  ·  {I['summary']['excess_units']:,} units"),
                  dict(k="Units transferable D2C → wholesale (default rules)", v=f"{rtot['units']:,} units  ·  {egp(rtot['value'])}"),
                  dict(k="Wholesale units to replenish (model)", v=f"{rec_w:,}")],
        spark=dict(label="Wholesale stockout days by month", fmt="num", key=("so", "Wholesale")),
        hyp=[dict(t="Replenishment appears to be driven by channel history, not forward demand: D2C stock is sized for volumes far above its actual demand.", cls="plaus"),
             dict(t="Rebalancing can only absorb part of the gap because surplus SKUs differ from deficit SKUs; the rest needs new production.", cls="arith")],
        conf="Medium", steps=["Confirm whether the wholesale desk and D2C stock share a physical warehouse (transfer feasibility).", "Freeze replenishment for SKUs above 180 days of cover.", "Open production orders for the SKUs in the wholesale stock-out list."],
        action="ACT-03")
    add(id="F-04", module="procurement", kind="structural", sev=3, title="Two suppliers deliver late far more often than their peers",
        signal=f"{S1} delivers on time {pct(sup[S1]['ontime'],0)} and {S2} {pct(sup[S2]['ontime'],0)} of the time vs ~{pct(peer_ot,0)} for the other ten.",
        evidence=[dict(k="On-time rate", v=f"{S1} {pct(sup[S1]['ontime'])} · {S2} {pct(sup[S2]['ontime'])} · peers {pct(peer_ot)}"),
                  dict(k="Average days late (all POs)", v=f"{S1} {sup[S1]['late_avg']:.1f} · {S2} {sup[S2]['late_avg']:.1f} · peers {np.mean([x['late_avg'] for x in peers]):.1f}"),
                  dict(k="Share of purchase spend exposed", v=pct(spend_risk / P["totals"]["spend"])),
                  dict(k="Lateness vs 'material wait' downtime (monthly r)", v=f"{P['corr_late_matwait']['r']:.2f} (p = {P['corr_late_matwait']['p']:.2f})")],
        spark=dict(label="Supplier on-time rate by month (all suppliers)", fmt="pct", key=("ot", None)),
        hyp=[dict(t="Lateness is measured, not inferred: promised vs actual receipt dates on every purchase order.", cls="arith"),
             dict(t="A link from supplier lateness to factory 'material wait' downtime is NOT supported by the monthly data (no significant correlation).", cls="ruled"),
             dict(t="Both suppliers also run longer lead times than peers, which suggests a capacity or logistics issue on their side.", cls="plaus")],
        conf="High", steps=["Review both suppliers' contracts for delivery penalties.", "Shift a trial share of volume to the three most reliable suppliers per material (App 7 matrix).", "Ask both suppliers for a recovery plan with weekly OTIF reporting."],
        action="ACT-04")
    add(id="F-05", module="factory", kind="structural", sev=3, title="Sewing is the dominant production bottleneck",
        signal=f"Sewing is flagged on {pct(sew['share_orders'])} of orders but drives {pct(sew['share_delay'],0)} of all delay days. Those orders run {sew['eff']:.0f}% efficiency vs {bn['None']['eff']:.0f}% on unflagged orders.",
        evidence=[dict(k="Avg delay when sewing is the bottleneck", v=f"{sew['delay']:.1f} days vs {Fa['tests']['sewing_vs_rest']['mean_rest']:.2f} for all other orders"),
                  dict(k="Share of delay days", v=f"Sewing {pct(sew['share_delay'])} · Finishing {pct(bn['Finishing']['share_delay'])} · others {pct(1-sew['share_delay']-bn['Finishing']['share_delay'])}"),
                  dict(k="Mann-Whitney test, delay days", v="p < 0.001"), dict(k="Overtime > 10h vs < 2h: late-order rate", v=f"{pct(Fa['ot_bins'][3]['late'],0)} vs {pct(Fa['ot_bins'][0]['late'],0)} (direction unproven)"),
                  dict(k="Late orders LTM vs prior", v=f"{pct(Fa['ltm']['late'])} vs {pct(Fa['prior']['late'])}")],
        spark=dict(label="Late production orders % by month", fmt="pct", key=("late", None)),
        hyp=[dict(t="Sewing and finishing capacity limits explain most delay days; flagged orders carry markedly more overtime on average than unflagged ones.", cls="corr"),
             dict(t="Overtime is probably a response to delay (reverse causation), so more overtime is not proven to help.", cls="plaus"),
             dict(t="One production line runs a higher late-order share than the others.", cls="corr")],
        conf="Medium", steps=["Time-study the two sewing lines with the highest flagged-order counts.", "Review operator availability: 'operator shortage' is a recurring downtime cause.", "Rebalance order release so sewing-heavy styles are spread across lines."],
        action="ACT-05")
    add(id="F-06", module="marketing", kind="structural", sev=3, title="Platform-reported marketing revenue cannot be reconciled with actual sales",
        signal=f"Campaigns claim {egp(rc['attributed_rev'])} of revenue, {rc['ratio_rev']:.1f}x the {egp(rc['d2c_net'])} of actual retail+online sales over the same 36 months.",
        evidence=[dict(k="Reported ROAS vs blended MER", v=f"{rc['reported_roas']:.1f}x vs {rc['mer']:.1f}x"), dict(k="Attributed orders vs online invoices vs web orders", v=f"{rc['attributed_orders']:,} · {rc['online_invoices']:,} · {rc['web_orders']:,}"),
                  dict(k="Break-even ROAS at D2C margin", v=f"{rc['breakeven_roas']:.1f}x"), dict(k="Clicks = landing sessions in every row", v="Every row (no independent tracking)"),
                  dict(k="WhatsApp/CRM share of claimed revenue", v=pct([p for p in Mk['platforms'] if p['p']=='WhatsApp / CRM'][0]['share_rev'], 0))],
        spark=dict(label="Attributed revenue ÷ actual D2C net sales, by month", fmt="x", key=("attr_ratio", None)),
        hyp=[dict(t="Over-attribution is certain: claims exceed total sales, so at least part of every channel's revenue is double-counted (arithmetic).", cls="arith"),
             dict(t="WhatsApp/CRM is probably credited for orders that would have happened anyway (existing customers, last-touch logic).", cls="plaus"),
             dict(t="True incremental return is unknown; only a holdout or geo test can measure it.", cls="unk")],
        conf="High", steps=["Export platform-level conversion logs and de-duplicate by order ID.", "Run a geo or audience holdout on WhatsApp/CRM and Meta.", "Judge budgets on MER (D2C sales ÷ total spend) until incrementality is measured."],
        action="ACT-06")
    add(id="F-07", module="quality", kind="structural", sev=2, title="Online returns run well above the store rate; size and fit is the top reason",
        signal=f"Online return rate is {pct(Q['channel_returns'][0]['rate'])} vs {pct(Q['channel_returns'][1]['rate'])} in store and {pct(Q['channel_returns'][2]['rate'])} wholesale.",
        evidence=[dict(k="Online refunds (36 months)", v=egp(Q['channel_returns'][0]['refund'])), dict(k="Excess online refunds vs store rate", v=f"{egp(oe['refund'])}  ·  {oe['lines']:,.0f} lines"),
                  dict(k="Size / fit share of online returns", v=pct([x for x in out['return_reasons'] if x[0]==0 and x[1]=='Size / fit'][0][2] / sum(x[2] for x in out['return_reasons'] if x[0]==0), 0)),
                  dict(k="'Size guidance' tickets", v=f"{[t for t in Q['tickets'] if t['t']=='Size guidance'][0]['n']:,}  (largest ticket type)")],
        spark=dict(label="Online return rate by month", fmt="pct", key=("ret", "Online")),
        hyp=[dict(t="Customers cannot try garments online, so size/fit uncertainty converts to returns; store buyers resolve it at purchase.", cls="plaus"),
             dict(t="Return rate does not differ meaningfully by size or by product family; one product (Σ z>3) is a statistical outlier.", cls="arith")],
        conf="Medium", steps=["Add per-product size charts and fit notes to the online listing.", "Review the one outlier product's cut and measurements.", "Route 'size guidance' tickets into the product page FAQ."],
        action="ACT-07")
    add(id="F-08", module="exec", kind="structural", sev=2, title="Retail store sales are shrinking while its stock cover is the highest in the group",
        signal=f"Store net sales are {retail_yoy*100:+.1f}% vs the prior 12 months while the store holds a median {store_cover:.0f} days of cover.",
        evidence=[dict(k="Store net sales LTM vs prior", v=f"{egp(kpi['ltm']['by_ch']['Retail']['net'])} vs {egp(kpi['prior']['by_ch']['Retail']['net'])}"), dict(k="Online net sales LTM vs prior", v=f"{online_yoy*100:+.1f}%"),
                  dict(k="Store gross margin (LTM)", v=pct(kpi['ltm']['by_ch']['Retail']['gp']/kpi['ltm']['by_ch']['Retail']['net'])), dict(k="Customers shopping in store, living outside the store's home governorate", v=pct(s[(s.Channel=='Retail')&(s.Customer_Governorate!=home_gov)].shape[0]/s[s.Channel=='Retail'].shape[0], 0))],
        spark=dict(label="Retail net sales YoY by month", fmt="pct", key=("sales_yoy", "Retail")),
        hyp=[dict(t=f"Demand may be migrating to online ({online_yoy*100:+.0f}% LTM) rather than disappearing; the data cannot separate migration from loss.", cls="plaus"),
             dict(t="Footfall, store traffic and local competition are not in the dataset.", cls="unk")],
        conf="Low", steps=["Compare store vs online sales for the store's home-governorate customers month by month.", "Add store traffic counters to separate footfall from conversion.", "Stop replenishing the store above 120 days cover."], action="ACT-08")
    add(id="F-09", module="marketing", kind="resolved", sev=1, title="Resolved: the Q4-2025 conversion dip coincided with slow page loads",
        signal=f"In Q4 2025 web conversion fell to {pct(inc['cr'],2)} (baseline {pct(base_cr,2)}) while average page load rose to {inc['load']:.1f}s. Both normalised in Q1 2026.",
        evidence=[dict(k="Orders not converted vs baseline", v=f"~{lost_orders:,.0f} orders  ≈ {egp(lost_orders*online_aov)} net sales"), dict(k="Daily corr(page load, conversion)", v=f"r = {Mk['web']['corr_load_cr']['r']:.2f}"),
                  dict(k="Conversion when load > 3.5s", v=f"{pct(Mk['web']['load_bins'][-1]['cr'],2)} vs {pct(Mk['web']['load_bins'][0]['cr'],2)} when < 2.2s")],
        spark=dict(label="Web conversion by month", fmt="pct2", key=("cr", None)),
        hyp=[dict(t="Slow pages and lower conversion occurred together; the relationship is consistent but cause and effect are not proven.", cls="corr")],
        conf="Medium", steps=["Set a page-load alert at 3.0s.", "Log releases and campaign launches next to the speed series to find the trigger."], action="ACT-09")
    add(id="F-10", module="data", kind="structural", sev=2, title="Factory and purchasing data do not reconcile with sales",
        signal=f"Production output is {prod_ratio:.1f}x the units sold, and purchases exceed BOM requirements for most materials.",
        evidence=[dict(k="Good units produced vs units sold (36 months)", v=f"{Fa['good_total']:,} vs {Fa['sold_total']:,}"), dict(k="Materials bought but absent from BOM", v=", ".join(P["missing_bom"])),
                  dict(k="Purchase spend vs net sales", v=f"{egp(P['totals']['spend'])} vs {egp(kpi['ltm']['net'] + kpi['prior']['net'])} (24 months shown)")],
        spark=None,
        hyp=[dict(t="The Production Hub probably supplies other brands or contract orders that are not in the sales table; the data cannot confirm this.", cls="unk")],
        conf="High", steps=["Ask finance to split production output by customer/brand.", "Complete the BOM for elastic band and carton box.", "Treat production and procurement apps as operating diagnostics, not as a P&L reconciliation."], action="ACT-10")
    # statistical (generic) signals not already covered
    sev_map = {4: 4, 3: 3, 2: 2, 1: 1}
    return dict(kpi=kpi, signals=sig, alerts=alerts, bridge_online=br,
                nums=dict(a1_lo=a1_lo, a1_hi=a1_hi, disc_cost_annual=disc_cost_annual, lost_net=lost_net, lost_gp=lost_gp, excess=excess, rtot=rtot, rec_w=rec_w, sew_days_saved=sew_days_saved,
                          infl_net=infl_net, oe=oe, retail_yoy=retail_yoy, online_yoy=online_yoy, lost_orders=lost_orders, online_aov=online_aov, prod_ratio=prod_ratio, peer_ot=peer_ot,
                          spend_risk=spend_risk, w_gm=w_gm, base_cr=base_cr, infl_gp=infl_gp), transfers=transfers)
