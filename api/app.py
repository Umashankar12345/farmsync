"""
api/app.py
──────────
Flask API serving pipeline outputs to the React frontend.
Returns HTTP 404 with a clear message if any file is missing.
Never returns dummy/fake JSON.
"""

import os, sys, json, re
from flask import Flask, jsonify, send_file, send_from_directory, abort, request
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    META_JSON, FIELDS_GEOJSON, STATS_JSON, DQ_JSON, API_STATIC, STACK_NC
)

app = Flask(__name__, static_folder=API_STATIC, static_url_path="/static")
CORS(app)

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def load_json(path, label):
    """Load a JSON file or abort 404/500 with a clear message."""
    if not os.path.exists(path):
        abort(404, description=(
            f"{label} not found at {path}. "
            "Run the pipeline first: fetch.py → indices.py → yield_risk.py → export.py"
        ))
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        abort(500, description=f"Failed to read or parse {label}: {exc}")


@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": str(e.description)}), 400


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": str(e.description)}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": str(e.description)}), 500


@app.route("/api/meta")
def get_meta():
    """Bounds and dates from export.py output."""
    return jsonify(load_json(META_JSON, "meta.json"))


@app.route("/api/dates")
def get_dates():
    """Scene dates for the slider, from meta.json."""
    meta = load_json(META_JSON, "meta.json")
    return jsonify({"dates": meta["dates"]})


@app.route("/api/fields")
def get_fields():
    """Management zone GeoJSON from yield_risk.py output."""
    return jsonify(load_json(FIELDS_GEOJSON, "fields.geojson"))


@app.route("/api/stats")
def get_stats():
    """Farm-level stats from yield_risk.py output."""
    return jsonify(load_json(STATS_JSON, "stats.json"))


@app.route("/api/data-quality")
def get_data_quality():
    """Data quality info from indices.py output."""
    return jsonify(load_json(DQ_JSON, "data_quality.json"))


@app.route("/api/layer/<date>/<layer>")
def get_layer_image(date, layer):
    """
    Serve a PNG for a given date and layer (ndvi, ndre, ndmi, truecolor).
    Example: /api/layer/2025-01-15/ndvi
    """
    if not DATE_PATTERN.match(date):
        abort(400, description=f"Invalid date format '{date}'. Expected YYYY-MM-DD.")

    allowed_layers = {"ndvi", "ndre", "ndmi", "truecolor"}
    if layer not in allowed_layers:
        abort(400, description=f"Unknown layer '{layer}'. Must be one of {allowed_layers}")

    # Validate against known scene dates if meta.json exists
    if os.path.exists(META_JSON):
        meta_dates = None
        try:
            with open(META_JSON, "r", encoding="utf-8") as f:
                meta_dates = json.load(f).get("dates")
        except (IOError, json.JSONDecodeError):
            pass
        if meta_dates is not None and date not in meta_dates:
            abort(404, description=f"Date '{date}' not found in available scene dates.")

    date_dir = os.path.join(API_STATIC, date)
    img_path = os.path.join(date_dir, f"{layer}.png")
    if not os.path.exists(img_path):
        abort(404, description=(
            f"Image not found: {img_path}. "
            "Run pipeline/export.py to generate images."
        ))
    return send_from_directory(date_dir, f"{layer}.png", mimetype="image/png")


@app.route("/api/health")
def health():
    """Return the presence of required pipeline output files."""
    files = {
        "meta.json":         os.path.exists(META_JSON),
        "fields.geojson":    os.path.exists(FIELDS_GEOJSON),
        "stats.json":        os.path.exists(STATS_JSON),
        "data_quality.json": os.path.exists(DQ_JSON),
        "stack.nc":          os.path.exists(STACK_NC),
    }
    return jsonify(files)


# Lazy-loaded NetCDF stack dataset & CRS transformer for pixel inspector
_STACK_DATASET = None
_TRANSFORMER = None

SCL_LABELS = {
    0: "No data",
    1: "Saturated / defective",
    2: "Dark area / shadow",
    3: "Cloud shadow",
    4: "Vegetation",
    5: "Not vegetated / bare soil",
    6: "Water",
    7: "Unclassified",
    8: "Cloud (medium prob)",
    9: "Cloud (high prob)",
    10: "Thin cirrus",
    11: "Snow / ice",
}


def _get_stack():
    global _STACK_DATASET, _TRANSFORMER
    if _STACK_DATASET is None:
        if not os.path.exists(STACK_NC):
            abort(404, description=f"stack.nc not found at {STACK_NC}")
        import xarray as xr
        from pyproj import Transformer
        _STACK_DATASET = xr.open_dataset(STACK_NC, engine="netcdf4")
        _TRANSFORMER = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
    return _STACK_DATASET, _TRANSFORMER


@app.route("/api/pixel")
def get_pixel():
    """
    Query raw band values and computed NDVI/NDRE/NDMI for a clicked lat/lon.
    Example: /api/pixel?lat=30.8671&lon=75.6608&date=2025-03-27
    """
    lat_str = request.args.get("lat")
    lon_str = request.args.get("lon")
    date_str = request.args.get("date")

    if not lat_str or not lon_str:
        abort(400, description="Missing 'lat' and 'lon' parameters.")

    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        abort(400, description="Invalid numeric format for 'lat' or 'lon'.")

    ds, transformer = _get_stack()
    x, y = transformer.transform(lon, lat)

    # 50m tolerance for boundary clicks
    min_x, max_x = float(ds.x.min()) - 50.0, float(ds.x.max()) + 50.0
    min_y, max_y = float(ds.y.min()) - 50.0, float(ds.y.max()) + 50.0

    if not (min_x <= x <= max_x and min_y <= y <= max_y):
        return jsonify({
            "in_bounds": False,
            "lat": lat,
            "lon": lon,
            "message": "Selected coordinates are outside the Sentinel-2 scene bounding box."
        })

    dates = [str(t)[:10] for t in ds.time.values]
    if date_str and date_str in dates:
        t_idx = dates.index(date_str)
    else:
        t_idx = -1

    effective_date = dates[t_idx]
    time_utc = str(ds.time.values[t_idx])

    pt = ds.sel(x=x, y=y, method="nearest").isel(time=t_idx)

    b04_raw = float(pt.B04)
    b08_raw = float(pt.B08)
    b05_raw = float(pt.B05) if "B05" in pt else None
    b8a_raw = float(pt.B8A) if "B8A" in pt else None
    b11_raw = float(pt.B11) if "B11" in pt else None
    scl_code = int(pt.SCL) if "SCL" in pt else 0

    def to_refl(v):
        if v is None or v == 0:
            return 0.0
        return max(0.0, round(v * 0.0001 - 0.1, 4))

    b04_refl = to_refl(b04_raw)
    b08_refl = to_refl(b08_raw)
    b05_refl = to_refl(b05_raw)
    b8a_refl = to_refl(b8a_raw)
    b11_refl = to_refl(b11_raw)

    denom_ndvi = b08_refl + b04_refl + 1e-6
    ndvi = round((b08_refl - b04_refl) / denom_ndvi, 4)

    denom_ndre = (b8a_refl + b05_refl + 1e-6) if b8a_refl and b05_refl else None
    ndre = round((b8a_refl - b05_refl) / denom_ndre, 4) if denom_ndre else None

    denom_ndmi = (b8a_refl + b11_refl + 1e-6) if b8a_refl and b11_refl else None
    ndmi = round((b8a_refl - b11_refl) / denom_ndmi, 4) if denom_ndmi else None

    scl_label = SCL_LABELS.get(scl_code, f"Class {scl_code}")
    is_cloud = scl_code in [3, 8, 9, 10]

    return jsonify({
        "in_bounds": True,
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "utm_x": round(x, 1),
        "utm_y": round(y, 1),
        "utm_zone": "43N",
        "date": effective_date,
        "time_utc": time_utc,
        "raw_bands": {
            "B04": int(b04_raw),
            "B08": int(b08_raw),
            "B05": int(b05_raw) if b05_raw is not None else None,
            "B8A": int(b8a_raw) if b8a_raw is not None else None,
            "B11": int(b11_raw) if b11_raw is not None else None,
        },
        "surface_reflectance": {
            "B04": b04_refl,
            "B08": b08_refl,
            "B05": b05_refl,
            "B8A": b8a_refl,
            "B11": b11_refl,
        },
        "scl": {
            "code": scl_code,
            "label": scl_label,
            "is_cloud_masked": is_cloud,
        },
        "indices": {
            "ndvi": ndvi,
            "ndre": ndre,
            "ndmi": ndmi,
        },
        "formula": f"({b08_refl:.4f} − {b04_refl:.4f}) / ({b08_refl:.4f} + {b04_refl:.4f}) = {ndvi:.4f}",
        "provenance": {
            "sensor": "Sentinel-2 MSI",
            "level": "L2A (Bottom of Atmosphere Surface Reflectance)",
            "tile": "T43RER",
            "baseline": "05.11",
            "scale": "DN × 0.0001 − 0.1",
            "platform_url": "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a",
        }
    })


if __name__ == "__main__":
    print("FasalScan API — starting on http://localhost:5050")
    print("Health check: http://localhost:5050/api/health")
    app.run(port=5050, debug=True)
