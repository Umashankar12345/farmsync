"""
api/app.py
──────────
Flask API serving pipeline outputs to the React frontend.
Returns HTTP 404 with a clear message if any file is missing.
Never returns dummy/fake JSON.
"""

import os, sys, json
from flask import Flask, jsonify, send_file, abort
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import (
    META_JSON, FIELDS_GEOJSON, STATS_JSON, DQ_JSON, API_STATIC
)

app = Flask(__name__, static_folder=API_STATIC, static_url_path="/static")
CORS(app)


def load_json(path, label):
    """Load a JSON file or abort 404 with a clear message."""
    if not os.path.exists(path):
        abort(404, description=(
            f"{label} not found at {path}. "
            "Run the pipeline first: fetch.py → indices.py → yield_risk.py → export.py"
        ))
    with open(path) as f:
        return json.load(f)


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": str(e.description)}), 404


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
    allowed_layers = {"ndvi", "ndre", "ndmi", "truecolor"}
    if layer not in allowed_layers:
        abort(400, description=f"Unknown layer '{layer}'. Must be one of {allowed_layers}")

    img_path = os.path.join(API_STATIC, date, f"{layer}.png")
    if not os.path.exists(img_path):
        abort(404, description=(
            f"Image not found: {img_path}. "
            "Run pipeline/export.py to generate images."
        ))
    return send_file(img_path, mimetype="image/png")


@app.route("/api/health")
def health():
    """Return the presence of required pipeline output files."""
    files = {
        "meta.json":         os.path.exists(META_JSON),
        "fields.geojson":    os.path.exists(FIELDS_GEOJSON),
        "stats.json":        os.path.exists(STATS_JSON),
        "data_quality.json": os.path.exists(DQ_JSON),
    }
    return jsonify(files)


if __name__ == "__main__":
    print("FasalScan API — starting on http://localhost:5050")
    print("Health check: http://localhost:5050/api/health")
    app.run(port=5050, debug=True)
