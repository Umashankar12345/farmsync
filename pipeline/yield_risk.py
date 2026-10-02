"""
pipeline/yield_risk.py
──────────────────────
Build management zones (SLIC), compute per-zone NDVI/NDRE/NDMI,
risk ranking, stress classes, yield-risk shortfall, and rule-based
advisories. Export api/static/fields.geojson and stats.json.

Run AFTER indices.py.
Creates NO fake data.
"""

import os, sys, json, warnings
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    INDICES_NC, FIELDS_GEOJSON, STATS_JSON, API_STATIC,
    BENCHMARK_PERCENTILE, RISK_TIER_QUANTILES, VALID_FRACTION_THRESHOLD,
    NDMI_WATER_THRESHOLD, SLIC_N_SEGMENTS, SLIC_COMPACTNESS,
    TARGET_CRS,
)

try:
    import xarray as xr
    import rasterio, rasterio.features, rasterio.transform
    from rasterio.crs import CRS as RioCRS
    from rasterio.warp import transform_geom
    from skimage.segmentation import slic
    from skimage.measure import label as skimage_label
    from pyproj import Transformer
    import shapely.geometry as sg, shapely.ops
except ImportError as e:
    sys.exit(f"STOP: Missing package — {e}")

# ─────────────────────────────────────────────────────────────────────
def compute_zones(ndvi_stack, ndmi_stack, transform, src_crs_wkt):
    """
    Build data-driven management zones via multi-spectral SLIC segmentation
    on the NDVI & NDMI time stack.
    Clusters pixels into natural contiguous zones following real crop vigour
    and soil moisture gradients.
    """
    T, H, W = ndvi_stack.shape
    # Fill NaN with 0.0 for SLIC feature array
    stack_filled_ndvi = np.nan_to_num(ndvi_stack, nan=0.0)
    stack_filled_ndmi = np.nan_to_num(ndmi_stack, nan=0.0)

    # Feature stack: multi-temporal NDVI + recent NDMI moisture
    features = np.concatenate([stack_filled_ndvi, stack_filled_ndmi[-2:]], axis=0)
    image = np.transpose(features, (1, 2, 0))  # (H, W, C) for SLIC

    try:
        segments = slic(
            image,
            n_segments=SLIC_N_SEGMENTS,
            compactness=SLIC_COMPACTNESS,
            convert2lab=False,
            channel_axis=-1,
            start_label=0,
            enforce_connectivity=True,
            min_size_factor=0.2,
            max_size_factor=5.0,
        )
        if len(np.unique(segments)) < 3:
            raise ValueError("SLIC produced fewer than 3 usable management zones")
        source = "Data-driven multi-spectral SLIC clustering (NDVI & NDMI time-series)"
        print(f"  SLIC succeeded: {len(np.unique(segments))} data-driven zones")
    except Exception as e:
        warnings.warn(f"SLIC failed ({e}). Falling back to regular grid.")
        # 3x3 grid fallback
        rows = np.linspace(0, H, 4, dtype=int)
        cols = np.linspace(0, W, 4, dtype=int)
        segments = np.zeros((H, W), dtype=int)
        idx = 0
        for r in range(3):
            for c in range(3):
                segments[rows[r]:rows[r+1], cols[c]:cols[c+1]] = idx
                idx += 1
        source = "Regular 3x3 grid fallback (SLIC failed)"
        print(f"  Using grid fallback: {len(np.unique(segments))} zones")

    invalid_pixels = ~np.isfinite(ndvi_stack).any(axis=0)
    segments = segments.astype(np.int32, copy=False)
    segments[invalid_pixels] = -1

    return segments, source


def polygonize_zones(segments, raster_transform, src_crs_str):
    """
    Convert raster segments to GeoJSON polygons in EPSG:4326.
    Returns list of (zone_label, shapely_polygon, area_hectares) tuples.
    """
    transformer = Transformer.from_crs(src_crs_str, "EPSG:4326", always_xy=True)
    polys = []
    unique_labels = np.unique(segments)
    for lbl in unique_labels:
        if lbl < 0:
            continue
        mask = (segments == lbl).astype(np.uint8)
        shapes = list(rasterio.features.shapes(mask, transform=raster_transform))
        zone_shapes = [sg.shape(s) for s, v in shapes if v == 1]
        if not zone_shapes:
            continue
        merged = shapely.ops.unary_union(zone_shapes)
        # Smooth raster pixel stair-stepping slightly (15m tolerance preserves field contours)
        smoothed = merged.simplify(15.0, preserve_topology=True)
        if smoothed.geom_type == "MultiPolygon":
            largest = max(smoothed.geoms, key=lambda g: g.area)
        else:
            largest = smoothed
        # 10m pixels: count * 100 m² / 10,000 m²/ha
        pixel_count = int(np.sum(mask))
        area_ha = round(pixel_count / 100.0, 1)

        # Reproject from UTM to WGS84
        xs_p, ys_p = largest.exterior.coords.xy
        lons, lats = transformer.transform(list(xs_p), list(ys_p))
        poly_4326 = sg.Polygon(list(zip(lons, lats)))

        polys.append((int(lbl), poly_4326, area_ha))
    return polys


def advisory(severity, stress_class, ndvi, bench):
    """
    Rule-based advisory. No "urgently", "needed", "disease detected", "will".
    Returns {"text": ..., "evidence": ...}
    """
    evidence = f"NDVI {ndvi:.2f} (zone) vs {bench:.2f} (top-{BENCHMARK_PERCENTILE}% benchmark)"
    if severity == "high" and stress_class == "Water-related stress":
        text = "Consider irrigation check and verify soil moisture in the field."
    elif severity == "high":
        text = "Scout for sowing date, nutrient or soil issues (field verification suggested)."
    elif severity == "medium":
        text = "Monitor canopy development. Early variance from top benchmark."
    else:
        text = "Canopy vigor aligns with top seasonal benchmarks. Normal monitoring."
    return {"text": text, "evidence": evidence}


def main():
    if not os.path.exists(INDICES_NC):
        sys.exit(f"STOP: {INDICES_NC} not found. Run pipeline/indices.py first.")
    os.makedirs(API_STATIC, exist_ok=True)

    print("\n── PHASE 3: Zones + Risk ───────────────────────────────────────")
    ds = xr.open_dataset(INDICES_NC, engine="netcdf4")
    ndvi_stack = ds["ndvi"].values   # (T, H, W)
    ndmi_stack = ds["ndmi"].values
    ndre_stack = ds["ndre"].values
    valid_stack = ds["valid_mask"].values.astype(bool)
    times = ds.time.values
    T, H, W = ndvi_stack.shape
    dates = [str(t)[:10] for t in times]
    print(f"  Scenes: {T}  |  Dates: {dates}")

    # Need rasterio transform from the xarray spatial coords
    xs = ds["x"].values
    ys = ds["y"].values
    res_x = float(xs[1] - xs[0])
    res_y = float(ys[1] - ys[0])
    raster_transform = rasterio.transform.from_origin(
        float(xs[0]) - res_x / 2,
        float(ys[0]) - res_y / 2,
        abs(res_x),
        abs(res_y),
    )

    # ── Build management zones ────────────────────────────────────────
    print("\n[1/6] Building management zones …")
    segments, zone_source = compute_zones(ndvi_stack, ndmi_stack, raster_transform, TARGET_CRS)
    zone_labels = np.unique(segments)
    print(f"  Zone source  : {zone_source}")
    print(f"  Raw segments : {len(zone_labels)}")

    # ── Non-Crop / Built-up Masking ──────────────────────────────────
    # Pixels where seasonal peak NDVI < 0.20 represent permanent non-crop surfaces
    # (concrete roads, urban buildings of Ludhiana, canals, bare wasteland).
    # Masking them prevents urban concrete from depressing crop vigor statistics.
    masked_ndvi = np.where(valid_stack, ndvi_stack, np.nan)
    peak_ndvi = np.nanmax(masked_ndvi, axis=0)
    crop_mask = (peak_ndvi >= 0.20) & np.isfinite(peak_ndvi)
    non_crop_pixels = int(np.sum(~crop_mask))
    total_scene_pixels = H * W
    masked_ha = round(non_crop_pixels * 100 / 10000.0, 1)
    print(f"  Non-crop mask: {non_crop_pixels:,} pixels ({non_crop_pixels/total_scene_pixels*100:.2f}%) = {masked_ha} ha masked (NDVI floor < 0.20)")

    # ── Per-zone, per-date stats ──────────────────────────────────────
    print("\n[2/6] Computing per-zone per-date NDVI/NDRE/NDMI …")
    zone_stats = {}   # label -> {ndvi: [T], ndmi: [T], ndre: [T], valid_frac: [T]}
    for lbl in zone_labels:
        if lbl < 0:
            continue
        mask2d = segments == lbl
        zone_crop_mask = mask2d & crop_mask
        zone_pixels = zone_crop_mask.sum()
        zone_total_pixels = mask2d.sum()
        zone_masked_pixels = zone_total_pixels - zone_pixels

        ndvi_series, ndmi_series, ndre_series, vf_series = [], [], [], []
        for t in range(T):
            valid_px = valid_stack[t] & zone_crop_mask
            vf = float(valid_px.sum() / zone_pixels) if zone_pixels else 0.0
            ndvi_t = float(np.nanmean(ndvi_stack[t][valid_px])) if np.any(valid_px) else np.nan
            ndmi_t = float(np.nanmean(ndmi_stack[t][valid_px])) if np.any(valid_px) else np.nan
            ndre_t = float(np.nanmean(ndre_stack[t][valid_px])) if np.any(valid_px) else np.nan
            ndvi_series.append(ndvi_t)
            ndmi_series.append(ndmi_t)
            ndre_series.append(ndre_t)
            vf_series.append(round(vf, 4))
        zone_stats[lbl] = {
            "ndvi": ndvi_series,
            "ndmi": ndmi_series,
            "ndre": ndre_series,
            "valid_frac": vf_series,
            "total_pixels": int(zone_total_pixels),
            "crop_pixels": int(zone_pixels),
            "masked_pixels": int(zone_masked_pixels),
            "masked_ha": round(zone_masked_pixels * 100 / 10000.0, 1),
            "masked_pct": round(zone_masked_pixels / zone_total_pixels * 100, 1) if zone_total_pixels else 0,
        }

    # ── Per-date benchmark and risk ───────────────────────────────────
    print("\n[3/6] Computing benchmark and risk …")
    bench_per_date = []
    for t in range(T):
        # Only include zones with valid_frac >= threshold on this date
        valid_ndvis = [
            zone_stats[lbl]["ndvi"][t]
            for lbl in zone_labels
            if zone_stats[lbl]["valid_frac"][t] >= VALID_FRACTION_THRESHOLD
            and not np.isnan(zone_stats[lbl]["ndvi"][t])
        ]
        if valid_ndvis:
            bench_t = float(np.nanpercentile(valid_ndvis, BENCHMARK_PERCENTILE))
        else:
            bench_t = np.nan
        bench_per_date.append(bench_t)
        print(f"  Date {dates[t]}: bench={bench_t:.3f}  n_valid_zones={len(valid_ndvis)}")

    bench_peak = float(np.nanmax(bench_per_date))   # for shortfall calc

    # Per-zone risk_t and season score
    weights = np.arange(1, T + 1, dtype=float)      # linear increasing weight
    weights /= weights.sum()                          # normalise (design choice)

    for lbl in zone_labels:
        risk_series = []
        for t in range(T):
            ndvi_t = zone_stats[lbl]["ndvi"][t]
            bench_t = bench_per_date[t]
            vf = zone_stats[lbl]["valid_frac"][t]
            if np.isnan(ndvi_t) or np.isnan(bench_t) or bench_t <= 0 or vf < VALID_FRACTION_THRESHOLD:
                risk_t = np.nan
            else:
                risk_t = float(np.clip((1 - ndvi_t / bench_t) * 100, 0, 100))
            risk_series.append(risk_t)
        zone_stats[lbl]["risk"] = risk_series

        # Season score: weighted mean of non-NaN risk_t
        valid_risks = [(risk_series[t], weights[t]) for t in range(T) if not np.isnan(risk_series[t])]
        if valid_risks:
            total_w = sum(w for _, w in valid_risks)
            season_score = sum(r * w for r, w in valid_risks) / total_w
        else:
            season_score = np.nan
        zone_stats[lbl]["season_score"] = float(season_score) if not np.isnan(season_score) else None

    # ── Risk tiers = tertiles of season score ─────────────────────────
    print("\n[4/6] Computing risk tiers (tertiles) …")
    valid_scores = [zone_stats[l]["season_score"] for l in zone_labels
                    if zone_stats[l]["season_score"] is not None]
    if len(valid_scores) < 3:
        sys.exit("STOP: Fewer than 3 zones with valid season scores. "
                 "Try relaxing VALID_FRACTION_THRESHOLD or MAX_CLOUD_PCT.")
    t1, t2 = float(np.quantile(valid_scores, RISK_TIER_QUANTILES[0])), \
              float(np.quantile(valid_scores, RISK_TIER_QUANTILES[1]))
    print(f"  Tertile cuts: low<{t1:.1f}  medium<{t2:.1f}  high>={t2:.1f}")

    for lbl in zone_labels:
        sc = zone_stats[lbl]["season_score"]
        if sc is None:
            tier = "unknown"
        elif sc <= t1:
            tier = "healthy"
        elif sc <= t2:
            tier = "medium"
        else:
            tier = "high"
        zone_stats[lbl]["tier"] = tier

    # Drop non-crop / zone with no valid data
    def is_crop_zone(lbl):
        ndvi_vals = [v for v in zone_stats[lbl]["ndvi"] if not (v is None or np.isnan(v))]
        if not ndvi_vals:
            return False
        return np.nanmean(ndvi_vals) > 0.15   # design choice

    crop_labels = [l for l in zone_labels if is_crop_zone(l)]
    print(f"\n  Zones after non-crop filter: {len(crop_labels)} / {len(zone_labels)}")

    # ── Stress class + yield-risk shortfall ───────────────────────────
    print("\n[5/6] Stress class + yield-risk shortfall …")
    bench_now = bench_per_date[-1]   # last available date
    for lbl in crop_labels:
        # Latest-date NDMI for stress class
        ndmi_vals = [v for v in zone_stats[lbl]["ndmi"] if not (v is None or np.isnan(v))]
        mean_ndmi  = float(np.nanmean(ndmi_vals)) if ndmi_vals else np.nan

        tier = zone_stats[lbl]["tier"]
        if tier in ("medium", "high"):
            if not np.isnan(mean_ndmi) and mean_ndmi < NDMI_WATER_THRESHOLD:
                stress_class = "Water-related stress"
            else:
                stress_class = "Non-water stress (cause undetermined)"
        else:
            stress_class = "Healthy"
        zone_stats[lbl]["stress_class"] = stress_class

        # Yield-Risk shortfall (design choice — see config.py)
        ndvi_now = zone_stats[lbl]["ndvi"][-1]
        if (not np.isnan(ndvi_now)) and (not np.isnan(bench_now)) and \
           bench_now > 0 and (not np.isnan(bench_peak)) and bench_peak > 0:
            proj_peak  = ndvi_now * (bench_peak / bench_now)
            shortfall  = float(np.clip((1 - proj_peak / bench_peak) * 100, 0, 100))
        else:
            shortfall  = None
        zone_stats[lbl]["shortfall_pct"] = shortfall

        # Advisory
        ndvi_now_val = zone_stats[lbl]["ndvi"][-1]
        bench_for_adv = bench_now if not np.isnan(bench_now) else 0.0
        adv = advisory(tier, stress_class,
                       ndvi_now_val if not np.isnan(ndvi_now_val) else 0.0,
                       bench_for_adv)
        zone_stats[lbl]["advisory"] = adv

    # ── Polygonize and build GeoJSON ──────────────────────────────────
    print("\n[6/6] Polygonizing zones and writing GeoJSON …")
    polys = polygonize_zones(segments, raster_transform, TARGET_CRS)
    poly_map = {lbl: poly for lbl, poly, _ in polys}
    area_map = {lbl: ha for lbl, _, ha in polys}

    features = []
    for lbl in sorted(crop_labels, key=lambda l: -(zone_stats[l]["season_score"] or 0)):
        if lbl not in poly_map:
            continue
        poly = poly_map[lbl]
        zs = zone_stats[lbl]
        ndvi_series_clean = [round(v, 4) if not np.isnan(v) else None
                             for v in zs["ndvi"]]
        mean_ndvi = float(np.nanmean([v for v in zs["ndvi"] if v is not None and not np.isnan(v)]) or 0)
        mean_ndre = float(np.nanmean([v for v in zs["ndre"] if v is not None and not np.isnan(v)]) or 0)
        mean_ndmi = float(np.nanmean([v for v in zs["ndmi"] if v is not None and not np.isnan(v)]) or 0)

        low_conf = any(vf < VALID_FRACTION_THRESHOLD for vf in zs["valid_frac"])

        props = {
            "id":           f"zone-{lbl}",
            "name":         f"Zone {lbl}",
            "crop":         "Wheat (assumed, Rabi)",
            "tier":         zs["tier"],
            "season_score": round(zs["season_score"] or 0, 2),
            "stress_class": zs.get("stress_class", "unknown"),
            "mean_ndvi":    round(mean_ndvi, 4),
            "mean_ndre":    round(mean_ndre, 4),
            "mean_ndmi":    round(mean_ndmi, 4),
            "ndvi_series":  dict(zip(dates, ndvi_series_clean)),
            "valid_frac":   dict(zip(dates, zs["valid_frac"])),
            "shortfall_pct": round(zs["shortfall_pct"], 2) if zs["shortfall_pct"] is not None else None,
            "advisory_text": zs["advisory"]["text"],
            "advisory_evidence": zs["advisory"]["evidence"],
            "low_confidence": low_conf,
            "hectares":           area_map.get(lbl, round(zs["total_pixels"] / 100.0, 1)),
            "crop_hectares":      round(zs["crop_pixels"] / 100.0, 1),
            "masked_noncrop_ha":  zs["masked_ha"],
            "masked_noncrop_pct": zs["masked_pct"],
            "source":             "pipeline/yield_risk.py (data-driven SLIC clustering)",
        }
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": sg.mapping(poly),
        })

    geojson = {"type": "FeatureCollection", "features": features}
    with open(FIELDS_GEOJSON, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"  Written: {FIELDS_GEOJSON}  ({len(features)} zones)")

    # ── Farm composition and stats.json ──────────────────────────────
    tiers = [f["properties"]["tier"] for f in features]
    total = len(tiers)
    comp = {
        "healthy":  round(100 * tiers.count("healthy") / total, 1) if total else 0,
        "medium":   round(100 * tiers.count("medium")  / total, 1) if total else 0,
        "high":     round(100 * tiers.count("high")    / total, 1) if total else 0,
    }
    shortfalls = [f["properties"]["shortfall_pct"] for f in features
                  if f["properties"]["shortfall_pct"] is not None]
    farm_shortfall = round(float(np.mean(shortfalls)), 2) if shortfalls else None

    stats = {
        "zone_count":            total,
        "farm_composition":      comp,
        "farm_shortfall_pct":    farm_shortfall,
        "non_crop_masked_ha":    masked_ha,
        "non_crop_masked_pct":   round(non_crop_pixels / total_scene_pixels * 100, 2),
        "tertile_cuts":          {"low_max": round(t1, 2), "medium_max": round(t2, 2)},
        "benchmark_per_date":    dict(zip(dates, [round(b, 4) if not np.isnan(b) else None
                                                   for b in bench_per_date])),
        "bench_peak":            round(bench_peak, 4),
        "bench_now":             round(bench_now, 4) if not np.isnan(bench_now) else None,
        "source": "pipeline/yield_risk.py",
        "note_composition": "Farm composition derived from the same tier field as zone colours and list dots.",
    }
    with open(STATS_JSON, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"  Written: {STATS_JSON}")
    print(f"  Farm composition: {comp}")
    print(f"  Farm shortfall  : {farm_shortfall}%")

    # ── Sample 5 zones ────────────────────────────────────────────────
    print("\n── PHASE 3 COMPLETE — 5 sample zones ──────────────────────────")
    for feat in features[:5]:
        p = feat["properties"]
        print(f"  {p['name']:10}  tier={p['tier']:7}  "
              f"NDVI={p['mean_ndvi']:.3f}  "
              f"shortfall={p['shortfall_pct']}%  "
              f"stress={p['stress_class'][:30]}")
    print(f"\n  Next step: python pipeline/export.py")

if __name__ == "__main__":
    main()
