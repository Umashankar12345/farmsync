"""
pipeline/fetch.py
─────────────────
Search Planetary Computer STAC for Sentinel-2 L2A scenes over the
Ludhiana farmland bbox, load the required bands, and save to
data/raw/stack.nc.

Run:  python pipeline/fetch.py
STOPS with a clear error message if the network or API is unavailable.
Creates NO fake data.
"""

import os, sys, json
import numpy as np

# ── Imports with clear error messages ────────────────────────────────
try:
    import pystac_client
except ImportError:
    sys.exit("STOP: pystac-client not installed. Run: pip install pystac-client")
try:
    import planetary_computer as pc
except ImportError:
    sys.exit("STOP: planetary-computer not installed. Run: pip install planetary-computer")
try:
    import odc.stac
except ImportError:
    sys.exit("STOP: odc-stac not installed. Run: pip install odc-stac")
try:
    import xarray as xr
except ImportError:
    sys.exit("STOP: xarray not installed. Run: pip install xarray netCDF4")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    BBOX, DATE_START, DATE_END, MAX_CLOUD_PCT,
    BANDS, RESOLUTION, TARGET_CRS,
    DATA_RAW, STACK_NC,
)

def main():
    os.makedirs(DATA_RAW, exist_ok=True)

    print(f"\n── PHASE 1: Fetch ──────────────────────────────────────────────")
    print(f"  bbox       : {BBOX}  (W,S,E,N in EPSG:4326)")
    print(f"  dates      : {DATE_START} → {DATE_END}")
    print(f"  max cloud  : {MAX_CLOUD_PCT}%")
    print(f"  bands      : {BANDS}")
    print(f"  resolution : {RESOLUTION} m  (B05/B8A/B11/SCL natively 20 m)")

    # ── 1. Connect to Planetary Computer STAC ────────────────────────
    print("\n[1/4] Connecting to Planetary Computer STAC …")
    try:
        catalog = pystac_client.Client.open(
            "https://planetarycomputer.microsoft.com/api/stac/v1",
            modifier=pc.sign_inplace,
        )
    except Exception as e:
        sys.exit(f"STOP: Cannot connect to Planetary Computer.\n  {e}")

    # ── 2. Search for scenes ──────────────────────────────────────────
    print("[2/4] Searching for Sentinel-2 L2A scenes …")
    try:
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=BBOX,
            datetime=f"{DATE_START}/{DATE_END}",
            query={"eo:cloud_cover": {"lt": MAX_CLOUD_PCT}},
            sortby=["+datetime"],
        )
        items = list(search.items())
    except Exception as e:
        sys.exit(f"STOP: STAC search failed.\n  {e}")

    if len(items) == 0:
        sys.exit(
            f"STOP: No scenes found for bbox={BBOX}, "
            f"dates={DATE_START}/{DATE_END}, cloud<{MAX_CLOUD_PCT}%. "
            "Try relaxing MAX_CLOUD_PCT in pipeline/config.py."
        )

    print(f"\n  Scenes found: {len(items)}")
    print(f"  {'Date':<25} {'Cloud%':>7}  {'Baseline'}")
    print(f"  {'─'*25} {'─'*7}  {'─'*10}")
    baselines = []
    for item in items:
        dt    = item.datetime.strftime("%Y-%m-%d")
        cloud = item.properties.get("eo:cloud_cover", "n/a")
        base  = item.properties.get("s2:processing_baseline", "n/a")
        baselines.append(base)
        print(f"  {dt:<25} {str(cloud):>7}%  {base}")

    # ── 3. Load bands into xarray dataset ────────────────────────────
    print(f"\n[3/4] Loading {len(items)} scenes with odc.stac …")
    print( "  (This may take several minutes depending on connection speed.)")
    try:
        ds = odc.stac.load(
            items,
            bands=BANDS,
            bbox=BBOX,
            crs=TARGET_CRS,
            resolution=RESOLUTION,
            dtype="float32",   # triggers auto scale/offset via odc-stac
            chunks={},         # load into memory (no dask needed for small bbox)
        )
    except Exception as e:
        sys.exit(f"STOP: odc.stac.load failed.\n  {e}")

    print(f"\n  Dataset dimensions: {dict(ds.dims)}")
    print(f"  CRS              : {TARGET_CRS}")
    print(f"  Spatial shape    : {ds[BANDS[0]].shape}")

    # ── 4. Verify one raw pixel value ────────────────────────────────
    # odc-stac with dtype="float32" applies the STAC raster:bands
    # scale/offset automatically, so values should already be reflectance.
    # We report one pixel to confirm.
    band_sample = "B08"
    raw_val = float(ds[band_sample].isel(time=0, y=50, x=50).values)
    print(f"\n  Sample pixel ({band_sample}, time=0, y=50, x=50): {raw_val:.6f}")
    print(f"  Expected range after correction: 0 – 1  (typical crop NDVI ~0.3–0.9)")

    # Check that most values are plausibly in 0-1 range
    arr = ds[band_sample].isel(time=0).values
    in_range = np.nanmean((arr >= 0) & (arr <= 1))
    print(f"  Fraction of {band_sample} pixels in [0,1]: {in_range:.3f}")
    if in_range < 0.80:
        print(
            f"  WARNING: Only {in_range:.1%} pixels in [0,1]. "
            "Check whether odc-stac applied the scale/offset. "
            "If raw DN (~0–10000), set dtype='uint16' and apply manually in indices.py."
        )
    else:
        print(f"  OK: scale/offset appears applied by odc-stac.")

    # ── 5. Save to NetCDF ─────────────────────────────────────────────
    print(f"\n[4/4] Saving to {STACK_NC} …")
    # Store processing baselines as a coordinate for provenance
    ds = ds.assign_attrs({
        "source":      "Planetary Computer, sentinel-2-l2a",
        "bbox":        str(BBOX),
        "date_start":  DATE_START,
        "date_end":    DATE_END,
        "max_cloud":   MAX_CLOUD_PCT,
        "baselines":   str(baselines),
        "crs":         TARGET_CRS,
        "resolution_m": RESOLUTION,
    })

    # Drop object-dtype coords that NetCDF can't handle
    coords_to_drop = [
        c for c in ds.coords
        if ds.coords[c].dtype == object
    ]
    if coords_to_drop:
        ds = ds.drop_vars(coords_to_drop)

    ds.to_netcdf(STACK_NC)
    size_mb = os.path.getsize(STACK_NC) / 1e6
    print(f"  Saved: {STACK_NC}  ({size_mb:.1f} MB)")

    print("\n── PHASE 1 COMPLETE ────────────────────────────────────────────")
    print(f"  Scenes used : {len(items)}")
    print(f"  Output file : {STACK_NC}")
    print(f"  Next step   : python pipeline/indices.py")

if __name__ == "__main__":
    main()
