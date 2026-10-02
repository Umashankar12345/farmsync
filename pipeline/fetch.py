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

import os, sys, json, time
import numpy as np
from PIL import Image

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
    DATA_RAW, STACK_NC, SCL_MASK_CLASSES,
)


def _serialisable_attrs(attrs):
    safe_types = (str, int, float, bool, type(None))
    return {
        key: value if isinstance(value, safe_types) else str(value)
        for key, value in attrs.items()
    }


def _serialisable_dataset(ds, date_label, baselines):
    ds = ds.assign_attrs({
        "source": "Planetary Computer, sentinel-2-l2a",
        "bbox": str(BBOX),
        "date_start": DATE_START,
        "date_end": DATE_END,
        "max_cloud": MAX_CLOUD_PCT,
        "baselines": str(baselines),
        "crs": "EPSG:32643",
        "resolution_m": RESOLUTION,
        "part_date": date_label,
    })
    ds.attrs = _serialisable_attrs(ds.attrs)
    for name in ds.variables:
        ds[name].attrs = _serialisable_attrs(ds[name].attrs)
    return ds


def _save_truecolor_preview(ds):
    clear_mask = ~ds["SCL"].isin(SCL_MASK_CLASSES)
    clear_dates = clear_mask.any(dim=("y", "x")).values
    clear_index = int(np.flatnonzero(clear_dates)[0]) if np.any(clear_dates) else 0
    channels = []
    for band in ("B04", "B03", "B02"):
        values = ds[band].isel(time=clear_index).astype("float32")
        reflectance = np.clip((values - 1000) / 10000, 0, 1)
        channels.append(np.asarray(reflectance.values))
    rgb = np.stack(channels, axis=-1)
    Image.fromarray((rgb * 255).astype(np.uint8), "RGB").save(
        os.path.join(DATA_RAW, "preview_truecolor.png")
    )
    preview_date = str(ds.time.isel(time=clear_index).values)
    print(f"  Preview date: {preview_date}")
    print(f"  Saved: {os.path.join(DATA_RAW, 'preview_truecolor.png')}")


def _has_clear_pixels(ds):
    clear_mask = ~ds["SCL"].isin(SCL_MASK_CLASSES)
    return bool(clear_mask.any().values)


def main():
    os.makedirs(DATA_RAW, exist_ok=True)
    parts_dir = os.path.join(DATA_RAW, "parts")
    os.makedirs(parts_dir, exist_ok=True)

    os.environ["GDAL_HTTP_MAX_RETRY"] = "5"
    os.environ["GDAL_HTTP_RETRY_DELAY"] = "2"
    os.environ["GDAL_HTTP_TIMEOUT"] = "60"

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
    print(f"\n[3/4] Loading {len(items)} scenes one date at a time …")
    odc.stac.configure_rio(cloud_defaults=True)
    item_by_date = {item.datetime.strftime("%Y-%m-%d"): item for item in items}
    part_paths = []
    first_clear_ds = None

    for date, item in item_by_date.items():
        part_path = os.path.join(parts_dir, f"{date}.nc")
        part_paths.append(part_path)
        if os.path.exists(part_path):
            print(f"  {date}: exists, skipping")
            continue

        last_error = None
        for attempt in range(1, 4):
            started = time.perf_counter()
            try:
                date_ds = odc.stac.load(
                    [item],
                    bands=BANDS,
                    bbox=BBOX,
                    crs=TARGET_CRS,
                    resolution=RESOLUTION,
                    dtype="uint16",
                    nodata=0,
                    chunks={"x": 512, "y": 512, "time": 1},
                ).compute(scheduler="threads", num_workers=4)
                if first_clear_ds is None and _has_clear_pixels(date_ds):
                    first_clear_ds = date_ds
                date_ds = _serialisable_dataset(date_ds, date, baselines)
                encoding = {
                    name: {"zlib": True, "complevel": 4}
                    for name in date_ds.data_vars
                }
                date_ds.to_netcdf(part_path, encoding=encoding)
                elapsed = time.perf_counter() - started
                print(f"  {date}: {os.path.getsize(part_path) / 1e6:.1f} MB in {elapsed:.1f}s")
                break
            except Exception as exc:
                last_error = exc
                if os.path.exists(part_path):
                    os.remove(part_path)
                print(f"  {date}: attempt {attempt}/3 failed: {exc}")
                if attempt == 3:
                    sys.exit(f"STOP: date {date} failed after 3 attempts.\n  {last_error}")

    # ── 4. Merge parts and write a first-date true-color preview ─────
    print("\n[4/4] Merging downloaded date files …")
    datasets = [xr.open_dataset(path) for path in part_paths]
    try:
        ds = xr.concat(datasets, dim="time")
        ds = _serialisable_dataset(ds, "merged", baselines)
        encoding = {
            name: {"zlib": True, "complevel": 4}
            for name in ds.data_vars
        }
        ds.to_netcdf(STACK_NC, encoding=encoding)
    finally:
        for dataset in datasets:
            dataset.close()

    if first_clear_ds is None:
        for part_path in part_paths:
            candidate = xr.open_dataset(part_path).load()
            if _has_clear_pixels(candidate):
                first_clear_ds = candidate
                break
            candidate.close()
    if first_clear_ds is None:
        first_clear_ds = xr.open_dataset(part_paths[0]).load()
    _save_truecolor_preview(first_clear_ds)
    if first_clear_ds is not None:
        first_clear_ds.close()
    size_mb = os.path.getsize(STACK_NC) / 1e6
    print(f"  Saved: {STACK_NC}  ({size_mb:.1f} MB)")

    print("\n── PHASE 1 COMPLETE ────────────────────────────────────────────")
    print(f"  Scenes used : {len(items)}")
    print(f"  Output file : {STACK_NC}")
    print(f"  Next step   : python pipeline/indices.py")

if __name__ == "__main__":
    main()
