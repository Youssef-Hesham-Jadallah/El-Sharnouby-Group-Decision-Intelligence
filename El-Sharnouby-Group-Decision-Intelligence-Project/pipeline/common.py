"""Shared loaders + helpers for the El-Sharnouby Group Decision Intelligence pipeline."""
import pandas as pd, numpy as np, os, json

RAW = os.environ.get("ESG_RAW", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_raw"))
# Published capacity figures are NOT stored in the code: supply them via environment variables for your own data.
HUB_PER_DAY = int(os.environ.get("HUB_PER_DAY", "1000"))
PRINT_PER_DAY = int(os.environ.get("PRINT_PER_DAY", "1000"))
AS_OF = pd.Timestamp("2026-09-30")
LTM_START = pd.Timestamp("2025-10-01")      # last twelve months = Oct-25 .. Sep-26
PRIOR_START = pd.Timestamp("2024-10-01")    # prior twelve months
MONTHS = [str(p) for p in pd.period_range("2023-10", "2026-09", freq="M")]
MI = {m: i for i, m in enumerate(MONTHS)}
CHANNELS = ["Online", "Retail", "Wholesale"]
CI = {c: i for i, c in enumerate(CHANNELS)}

def load():
    D = {}
    dates = {
        "Sales_Transactions": ["Order_Date", "Return_Date"],
        "Customers": ["Join_Date"],
        "Marketing": ["Start_Date", "End_Date"],
        "Web_Traffic_Daily": ["Date"],
        "Purchase_Orders": ["Order_Date", "Promised_Date", "Actual_Receipt_Date"],
        "Production_Orders": ["Start_Date", "Due_Date", "Completion_Date"],
        "Printing_Batches": ["Print_Date"],
        "Machine_Downtime": ["Date"],
        "Quality": ["Inspection_Date"],
        "Customer_Service": ["Open_Date"],
        "Group_Operations": ["Month"],
        "Inventory_History": ["Snapshot_Month"],
    }
    for f in sorted(os.listdir(RAW)):
        if f.endswith(".csv"):
            n = f[:-4]
            D[n] = pd.read_csv(os.path.join(RAW, f), parse_dates=dates.get(n, []), low_memory=False,
                               encoding="utf-8-sig")
    return D

def r(x, n=2):
    if x is None: return None
    try:
        if isinstance(x, (float, np.floating)):
            if np.isnan(x) or np.isinf(x): return None
            return round(float(x), n)
        if isinstance(x, (np.integer,)): return int(x)
    except Exception:
        pass
    return x

def jsonable(o, n=3):
    if isinstance(o, dict): return {str(k): jsonable(v, n) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [jsonable(v, n) for v in o]
    if isinstance(o, np.ndarray): return jsonable(o.tolist(), n)
    if isinstance(o, (pd.Timestamp,)): return o.strftime("%Y-%m-%d")
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (float, np.floating)):
        if np.isnan(o) or np.isinf(o): return None
        v = round(float(o), n)
        return int(v) if v == int(v) and abs(v) < 1e15 else v
    if o is pd.NaT: return None
    return o

def sdiv(a, b):
    return float(a) / float(b) if b not in (0, None) and not (isinstance(b, float) and np.isnan(b)) else None

def mk(d):  # month key string from datetime series
    return d.dt.strftime("%Y-%m")
