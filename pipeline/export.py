"""
pipeline/export.py
──────────────────
For each scene date, write NDVI/NDRE/NDMI/truecolor PNG tiles with
transparent NaN/cloud pixels.  Write api/static/meta.json with real
lat/lon bounds and real scene dates.

Run AFTER yield_risk.py.
Creates NO fake data.
"""

import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    INDICES_NC, STACK_NC, META_JSON, API_STATIC,
    INDEX_CMAP_VMIN, INDEX_CMAP_VMAX, INDEX_CMAP_NAME,
    TARGET_CRS,
)

try:
    import xarray as xr
    import rasterio
    from rasterio.warp import transform_bounds
    from matplotlib import colormaps
    from matplotlib.colors import Normalize
    import matplotlib.pyplot as plt
    from PIL import Image
except ImportError as e:
    sys.exit(f"STOP: Missing package — {e}")

def arr_to_rgba(arr, vmin, vmax, cmap_name):
    """
    Convert a 2-D float array to an RGBA uint8 image.
    NaN pixels become fully transparent.
    """
    cmap = colormaps[cmap_name]
    norm = Normalize(vmin=vmin, vmax=vmax, clip=True)
    rgba = cmap(norm(arr))          # (H, W, 4) float 0-1
    nan_mask = np.isnan(arr)
    rgba[nan_mask, 3] = 0.0         # transparent where NaN / cloud
    return (rgba * 255).astype(np.uint8)


def main():
    for path in [INDICES_NC, STACK_NC]:
        if not os.path.exists(path):
            sys.exit(f"STOP: {path} not found. Run the earlier pipeline steps first.")

    print("\n── PHASE 4: Export layers ──────────────────────────────────────")

    ds_idx = xr.open_dataset(INDICES_NC, engine="netcdf4")
    ds_raw = xr.open_dataset(STACK_NC,   engine="netcdf4")

    times = ds_idx.time.values
    dates = [str(t)[:10] for t in times]
    print(f"  Dates to export: {dates}")

    # ── Derive lat/lon bounds from the raster coordinates ─────────────
    xs = ds_idx["x"].values
    ys = ds_idx["y"].values
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())

    # transform_bounds: (left, bottom, right, top) in src CRS -> dst CRS
    west, south, east, north = transform_bounds(
        TARGET_CRS, "EPSG:4326",
        x_min, y_min, x_max, y_max,
    )
    # Leaflet ImageOverlay bounds: [[south, west], [north, east]]
    leaflet_bounds = [[round(south, 6), round(west, 6)],
                      [round(north, 6), round(east, 6)]]
    print(f"\n  Raster bounds (EPSG:4326):")
    print(f"    south={south:.5f}  west={west:.5f}")
    print(f"    north={north:.5f}  east={east:.5f}")
    print(f"  Centre: lat={(south+north)/2:.4f}  lon={(west+east)/2:.4f}")
    assert 29.0 < (south+north)/2 < 32.5, "Bounds look wrong — not near Ludhiana"
    assert 74.0 < (west+east)/2 < 77.0,   "Bounds look wrong — not near Ludhiana"

    H = len(ds_idx["y"])
    W = len(ds_idx["x"])
    print(f"  Image size: {W} × {H} px")

    # ── Export one folder per date ────────────────────────────────────
    layer_spec = {
        "ndvi": ("ndvi", INDEX_CMAP_VMIN, INDEX_CMAP_VMAX, INDEX_CMAP_NAME),
        "ndre": ("ndre", -0.1, 0.7,  INDEX_CMAP_NAME),
        "ndmi": ("ndmi", -0.2, 0.6,  "RdBu"),
    }

    # detect whether raw stack has reflectance or DN
    b08_sample = float(ds_raw["B08"].isel(time=0, y=50, x=50).values)
    is_refl = b08_sample < 2.0

    for t, date in enumerate(dates):
        out_dir = os.path.join(API_STATIC, date)
        os.makedirs(out_dir, exist_ok=True)

        # ── Index PNGs ────────────────────────────────────────────────
        for layer_name, (var, vmin, vmax, cmap) in layer_spec.items():
            arr = ds_idx[var].isel(time=t).values.astype(float)
            rgba = arr_to_rgba(arr, vmin, vmax, cmap)
            out_path = os.path.join(out_dir, f"{layer_name}.png")
            Image.fromarray(rgba, mode="RGBA").save(out_path)

        # ── True-colour PNG ───────────────────────────────────────────
        def band_to_refl(name):
            arr = ds_raw[name].isel(time=t).values.astype(float)
            if not is_refl:
                arr = arr * 0.0001 + (-0.1)
            return np.clip(arr, 0, 1)

        r = band_to_refl("B04")
        g = band_to_refl("B03")
        b = band_to_refl("B02")

        # Cloud mask: use valid_mask from indices
        valid = ds_idx["valid_mask"].isel(time=t).values.astype(bool)

        # Stretch to 0-255, gamma correction
        def stretch(ch):
            p2, p98 = np.nanpercentile(ch[valid], [2, 98])
            ch = np.clip((ch - p2) / (p98 - p2 + 1e-8), 0, 1)
            return (ch ** 0.5 * 255).astype(np.uint8)

        rgb = np.stack([stretch(r), stretch(g), stretch(b)], axis=-1)
        alpha = (valid * 255).astype(np.uint8)
        rgba_tc = np.dstack([rgb, alpha])
        tc_path = os.path.join(out_dir, "truecolor.png")
        Image.fromarray(rgba_tc, mode="RGBA").save(tc_path)

        print(f"  {date}: ndvi.png  ndre.png  ndmi.png  truecolor.png  → {out_dir}")

    # ── Write meta.json ───────────────────────────────────────────────
    meta = {
        "bounds":  leaflet_bounds,
        "dates":   dates,
        "layers":  list(layer_spec.keys()) + ["truecolor"],
        "crs":     "EPSG:4326",
        "source":  "pipeline/export.py — computed from real Sentinel-2 L2A scenes",
        "note_basemap": (
            "Use OpenStreetMap or CARTO dark tiles (no API key required). "
            "Set tile URL in MapView.jsx. CARTO: "
            "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        ),
    }
    with open(META_JSON, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\n  Written: {META_JSON}")
    print(json.dumps(meta, indent=2))

    print("\n── PHASE 4 COMPLETE ────────────────────────────────────────────")
    print("  Next step: python api/app.py")

if __name__ == "__main__":
    main()
