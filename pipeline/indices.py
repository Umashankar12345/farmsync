"""
pipeline/indices.py
───────────────────
Load data/raw/stack.nc, apply cloud mask, compute NDVI/NDRE/NDMI,
save to data/processed/indices.nc, and write api/static/data_quality.json.

Run AFTER fetch.py.  Stops with a clear error if stack.nc is missing.
Creates NO fake data.
"""

import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    STACK_NC, INDICES_NC, DQ_JSON,
    SCL_MASK_CLASSES, INDEX_EPSILON,
    S2_SCALE, S2_OFFSET,
    DATA_PROC, API_STATIC,
)

try:
    import xarray as xr
    import numpy as np
except ImportError as e:
    sys.exit(f"STOP: Missing package — {e}")

def main():
    if not os.path.exists(STACK_NC):
        sys.exit(
            f"STOP: {STACK_NC} not found. "
            "Run python pipeline/fetch.py first."
        )
    os.makedirs(DATA_PROC, exist_ok=True)
    os.makedirs(API_STATIC, exist_ok=True)

    print("\n── PHASE 2: Indices ────────────────────────────────────────────")
    print(f"[1/5] Loading {STACK_NC} …")
    ds = xr.open_dataset(STACK_NC, engine="netcdf4")

    n_times = ds.dims["time"]
    print(f"  Scenes in stack : {n_times}")
    print(f"  Dates           : {list(ds.time.values)}")
    print(f"  Source attrs    : {dict(ds.attrs)}")

    # ── Detect whether odc-stac already applied scale/offset ──────────
    # If values are mostly in 0-1, correction was applied.
    # If values are ~0-10000, we are looking at raw DN.
    b08 = ds["B08"].isel(time=0).values.astype(float)
    median_val = float(np.nanmedian(b08))
    print(f"\n[2/5] Scale/offset check:")
    print(f"  Median B08 (scene 0) = {median_val:.4f}")

    offset_applied = False
    correction_method = "none"
    if median_val < 2.0:
        print("  Interpretation: values appear to be reflectance (0–1). "
              "odc-stac applied scale/offset automatically. NOT applying again.")
        offset_applied = True
        correction_method = "odc-stac scale/offset"
        def to_refl(arr):
            return arr  # already reflectance
    else:
        print(f"  Interpretation: values appear to be raw DN (~0–10000). "
              f"Applying scale={S2_SCALE}, offset={S2_OFFSET} manually.")
        offset_applied = False
        correction_method = "manual DN scale/offset"
        def to_refl(arr):
            return arr.astype(float) * S2_SCALE + S2_OFFSET

    # Print one raw pixel and corrected value for provenance
    raw_px = float(ds["B08"].isel(time=0, y=50, x=50).values)
    corr_px = float(to_refl(np.array([raw_px]))[0])
    print(f"\n  Provenance check (B08, time=0, y=50, x=50):")
    print(f"    raw value       = {raw_px}")
    print(f"    corrected value = {corr_px:.6f}")

    # Assert most corrected values in [0, 1]
    corr_b08 = to_refl(b08)
    frac_in_range = float(np.nanmean((corr_b08 >= -0.05) & (corr_b08 <= 1.05)))
    print(f"    Fraction B08 in [0,1] : {frac_in_range:.3f}")
    assert frac_in_range > 0.80, (
        f"STOP: Only {frac_in_range:.1%} of corrected B08 values are in [0,1]. "
        "Check scale/offset logic."
    )

    # ── Cloud masking ─────────────────────────────────────────────────
    print(f"\n[3/5] Cloud masking (SCL classes {SCL_MASK_CLASSES}) …")
    scl = ds["SCL"]
    valid_mask = scl.copy(data=np.ones(scl.shape, dtype=bool))
    for cls in SCL_MASK_CLASSES:
        valid_mask = valid_mask & (scl != cls)

    # per-date cloud fraction
    per_date_cloud = []
    for t in range(n_times):
        v = valid_mask.isel(time=t).values
        cloud_frac = float(1 - np.mean(v))
        per_date_cloud.append(round(cloud_frac, 4))
        print(f"  Date {t}: cloud-masked fraction = {cloud_frac:.3f}")

    overall_cloud = round(float(np.mean(per_date_cloud)), 4)
    print(f"  Overall cloud-masked fraction = {overall_cloud:.3f}")

    # ── Compute indices ───────────────────────────────────────────────
    print(f"\n[4/5] Computing NDVI, NDRE, NDMI …")

    def safe_index(a, b):
        """Normalized ratio with epsilon to avoid div-by-zero."""
        a = to_refl(ds[a].values.astype(float))
        b = to_refl(ds[b].values.astype(float))
        return (a - b) / (a + b + INDEX_EPSILON)

    # Apply cloud mask (NaN where masked)
    mask3d = valid_mask.values  # shape (time, y, x)

    def masked(arr):
        out = arr.copy()
        out[~mask3d] = np.nan
        return out

    ndvi_raw = safe_index("B08", "B04")   # Tucker 1979
    ndre_raw = safe_index("B8A", "B05")   # Barnes et al. 2000 (to verify)
    ndmi_raw = safe_index("B8A", "B11")   # Gao 1996 / Wilson & Sader 2002

    ndvi = masked(ndvi_raw)
    ndre = masked(ndre_raw)
    ndmi = masked(ndmi_raw)

    coords = {k: ds.coords[k] for k in ["time", "y", "x"] if k in ds.coords}
    dims   = ["time", "y", "x"]

    idx_ds = xr.Dataset({
        "ndvi": xr.DataArray(ndvi, dims=dims, coords=coords,
                             attrs={"long_name": "NDVI = (B08-B04)/(B08+B04)",
                                    "source": "Tucker 1979 RSE 8:127-150"}),
        "ndre": xr.DataArray(ndre, dims=dims, coords=coords,
                             attrs={"long_name": "NDRE = (B8A-B05)/(B8A+B05)",
                                    "source": "Barnes et al. 2000 (to verify)"}),
        "ndmi": xr.DataArray(ndmi, dims=dims, coords=coords,
                             attrs={"long_name": "NDMI = (B8A-B11)/(B8A+B11)",
                                    "source": "Gao 1996 RSE 58:257-266",
                                    "note": "NOT McFeeters 1996 open-water NDWI"}),
        "valid_mask": xr.DataArray(mask3d.astype(np.int8), dims=dims, coords=coords,
                                   attrs={"long_name": "1=valid pixel, 0=cloud/nodata"}),
    }, attrs={
        "offset_applied": str(offset_applied),
        "correction_method": correction_method,
        "scl_mask_classes": str(SCL_MASK_CLASSES),
    })

    print(f"  NDVI range (scene 0): {float(np.nanmin(ndvi[0])):.3f} – {float(np.nanmax(ndvi[0])):.3f}")
    idx_ds.to_netcdf(INDICES_NC)
    print(f"\n  Saved: {INDICES_NC}")

    # ── Write data_quality.json ───────────────────────────────────────
    print(f"\n[5/5] Writing {DQ_JSON} …")
    attrs  = ds.attrs
    dates  = [str(t)[:10] for t in ds.time.values]
    baselines_raw = attrs.get("baselines", "[]")
    try:
        baselines = eval(baselines_raw)  # stored as repr of list
    except Exception:
        baselines = [baselines_raw]

    dq = {
        "scenes_found":            n_times,   # scenes that passed cloud filter
        "scenes_used":             n_times,
        "dates":                   dates,
        "per_date_cloud_masked_fraction": per_date_cloud,
        "overall_cloud_masked_pct": round(overall_cloud * 100, 2),
        "processing_baseline":     baselines[0] if baselines else "unknown",
        "processing_baselines_all": baselines,
        "offset_applied":          offset_applied,
        "correction_method":        correction_method,
        "baseline_offset_status":  (
            f"Applied (baseline {baselines[0]})" if not offset_applied and baselines
            else "Applied by loader" if offset_applied else "Not required"
        ),
        "bands_natively_20m":      ["B05", "B8A", "B11", "SCL"],
        "resampled_to_m":          10,
        "source_comment": (
            "All values computed from real Sentinel-2 L2A scenes via pipeline/indices.py. "
            "No values are typed in or simulated."
        ),
    }
    with open(DQ_JSON, "w") as f:
        json.dump(dq, f, indent=2)
    print(f"  Written: {DQ_JSON}")
    print(f"  scenes_used = {dq['scenes_used']}")
    print(f"  overall_cloud_masked_pct = {dq['overall_cloud_masked_pct']}%")
    print(f"  offset_applied = {dq['offset_applied']}")

    print("\n── PHASE 2 COMPLETE ────────────────────────────────────────────")
    print(f"  Next step: python pipeline/yield_risk.py")

if __name__ == "__main__":
    main()
