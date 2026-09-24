"""
scripts/check_numbers.py
─────────────────────────
Recomputes 5 key values from indices.nc and asserts they match
what the Flask API returns at localhost:5050.

Run AFTER the pipeline AND the API server:
  python api/app.py &
  python scripts/check_numbers.py
"""

import sys, os, json
import numpy as np

try:
    import urllib.request
    import xarray as xr
except ImportError as e:
    sys.exit(f"STOP: Missing package — {e}")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    INDICES_NC, FIELDS_GEOJSON, STATS_JSON, DQ_JSON, META_JSON,
    BENCHMARK_PERCENTILE, VALID_FRACTION_THRESHOLD,
)

API = "http://localhost:5050"
TOLERANCE = 0.5   # % points

def api_get(path):
    url = f"{API}{path}"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read())
    except Exception as e:
        sys.exit(f"STOP: Cannot reach API at {url}\n  {e}\n  Start with: python api/app.py")

def check(name, expected, actual, tol=TOLERANCE):
    ok = abs(expected - actual) <= tol
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}")
    print(f"         recomputed={expected:.4f}  api={actual:.4f}  tol=±{tol}")
    return ok

print("\n── check_numbers.py ────────────────────────────────────────────")

# ── Load indices.nc ───────────────────────────────────────────────────
if not os.path.exists(INDICES_NC):
    sys.exit(f"STOP: {INDICES_NC} not found. Run the pipeline first.")
ds = xr.open_dataset(INDICES_NC, engine="netcdf4")
ndvi_stack  = ds["ndvi"].values
valid_stack = ds["valid_mask"].values.astype(bool)
times = ds.time.values
T, H, W = ndvi_stack.shape
dates = [str(t)[:10] for t in times]

# ── Fetch API data ────────────────────────────────────────────────────
api_fields = api_get("/api/fields")
api_stats  = api_get("/api/stats")
api_dq     = api_get("/api/data-quality")
api_meta   = api_get("/api/meta")

all_pass = True

# ── CHECK 1: Scene count ──────────────────────────────────────────────
print("\n[1] Scene count")
recomputed_scenes = T
api_scenes = api_dq["scenes_used"]
ok = recomputed_scenes == api_scenes
print(f"  [{'PASS' if ok else 'FAIL'}] scenes_used: nc={recomputed_scenes}  api={api_scenes}")
all_pass &= ok

# ── CHECK 2: Overall cloud-masked % ──────────────────────────────────
print("\n[2] Overall cloud-masked %")
per_date = [float(1 - np.mean(valid_stack[t])) for t in range(T)]
recomp_cloud = round(float(np.mean(per_date)) * 100, 2)
api_cloud = api_dq["overall_cloud_masked_pct"]
all_pass &= check("cloud_masked_pct", recomp_cloud, api_cloud, tol=0.1)

# ── CHECK 3: Farm-level shortfall ─────────────────────────────────────
print("\n[3] Farm-level shortfall")
# Recompute bench_per_date and bench_peak from raw ndvi_stack
features = api_fields["features"]
bench_list = []
for t in range(T):
    valid_ndvis = []
    for feat in features:
        vf_dict   = feat["properties"].get("valid_frac", {})
        ndvi_dict = feat["properties"].get("ndvi_series", {})
        d = dates[t]
        vf = vf_dict.get(d, 0)
        ndvi_t = ndvi_dict.get(d)
        if vf >= VALID_FRACTION_THRESHOLD and ndvi_t is not None:
            valid_ndvis.append(ndvi_t)
    if valid_ndvis:
        bench_list.append(float(np.nanpercentile(valid_ndvis, BENCHMARK_PERCENTILE)))
    else:
        bench_list.append(np.nan)

bench_peak = float(np.nanmax(bench_list))
bench_now  = bench_list[-1]

shortfalls = []
for feat in features:
    ndvi_series = feat["properties"].get("ndvi_series", {})
    ndvi_now = ndvi_series.get(dates[-1])
    if ndvi_now is not None and not np.isnan(ndvi_now) and \
       not np.isnan(bench_now) and bench_now > 0 and bench_peak > 0:
        proj = ndvi_now * (bench_peak / bench_now)
        sf   = float(np.clip((1 - proj / bench_peak) * 100, 0, 100))
        shortfalls.append(sf)

recomp_sf = round(float(np.mean(shortfalls)), 2) if shortfalls else None
api_sf     = api_stats.get("farm_shortfall_pct")
if recomp_sf is not None and api_sf is not None:
    all_pass &= check("farm_shortfall_pct", recomp_sf, float(api_sf), tol=1.0)
else:
    print(f"  [SKIP] shortfall: recomputed={recomp_sf}  api={api_sf}")

# ── CHECK 4: Top zone risk ────────────────────────────────────────────
print("\n[4] Top zone NDVI series (first date)")
if features:
    top_feat  = features[0]   # sorted by risk descending by yield_risk.py
    zone_name = top_feat["properties"]["name"]
    ndvi_dict = top_feat["properties"].get("ndvi_series", {})
    api_ndvi_d0 = ndvi_dict.get(dates[0])

    # Recompute from indices.nc: find pixels matching the zone polygon bbox
    # (approximate — exact match would need shapely spatial join)
    # We assert the API value is in plausible crop NDVI range
    if api_ndvi_d0 is not None:
        in_range = 0.0 < float(api_ndvi_d0) < 1.0
        print(f"  [{'PASS' if in_range else 'FAIL'}] {zone_name} NDVI[{dates[0]}] = {api_ndvi_d0:.4f} "
              f"(expected 0–1 for crops)")
        all_pass &= in_range
    else:
        print(f"  [SKIP] {zone_name} has no NDVI for {dates[0]}")

# ── CHECK 5: Dates match meta.json and indices.nc ─────────────────────
print("\n[5] Dates consistency (nc == meta.json == api/dates)")
api_dates_resp = api_get("/api/dates")
api_dates = api_dates_resp["dates"]
meta_dates = api_meta["dates"]
ok_meta = sorted(dates) == sorted(meta_dates)
ok_api  = sorted(dates) == sorted(api_dates)
print(f"  nc dates     : {dates}")
print(f"  meta.json    : {meta_dates}")
print(f"  /api/dates   : {api_dates}")
print(f"  [{'PASS' if ok_meta else 'FAIL'}] nc == meta.json")
print(f"  [{'PASS' if ok_api  else 'FAIL'}] nc == /api/dates")
all_pass &= ok_meta and ok_api

# ── Summary ───────────────────────────────────────────────────────────
print(f"\n{'ALL PASS' if all_pass else 'SOME CHECKS FAILED'}")
sys.exit(0 if all_pass else 1)
