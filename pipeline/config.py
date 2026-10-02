# pipeline/config.py
# All constants are marked with their source or "design choice".
# None are claimed to come from literature unless cited.

# ── Spatial extent ─────────────────────────────────────────────────
# Ludhiana farmland bbox [west, south, east, north] in EPSG:4326
# Start point — adjust if true-colour shows city not farmland.
# Design choice: chosen to cover irrigated wheat fields west of Ludhiana city.
BBOX = [75.65, 30.80, 75.75, 30.90]

# Target CRS for processing (UTM zone 43N — covers Ludhiana)
TARGET_CRS = "EPSG:32643"

# ── Date range ──────────────────────────────────────────────────────
# Rabi wheat season near Ludhiana: sown Nov-Dec, harvested Apr-May.
# Jan-Mar 2025 covers tillering → heading, the period with strongest
# NDVI-yield signal. Design choice.
DATE_START = "2025-01-01"
DATE_END   = "2025-03-31"

# ── Scene filter ────────────────────────────────────────────────────
# Maximum cloud cover at scene level. Design choice — relaxed enough
# to get ≥4 scenes but tight enough to avoid mostly-cloudy scenes.
MAX_CLOUD_PCT = 20

# ── Band list ───────────────────────────────────────────────────────
# B02,B03,B04 = RGB (truecolor)
# B08 = NIR 10 m (for NDVI)
# B05,B8A = Red-edge and NIR narrow 20 m (for NDRE)
# B11 = SWIR 20 m (for NDMI)
# SCL = Scene Classification Layer 20 m (for cloud masking)
BANDS = ["B02", "B03", "B04", "B05", "B08", "B8A", "B11", "SCL"]

# ── Resolution ──────────────────────────────────────────────────────
# Resample all bands to 10 m. B05, B8A, B11, SCL are natively 20 m.
RESOLUTION = 10  # metres

# ── Reflectance correction ──────────────────────────────────────────
# Sentinel-2 L2A stores DN as uint16. The STAC item's raster:bands
# metadata includes scale (0.0001) and offset (-0.1) for baseline ≥04.00.
# odc-stac.load() can apply this automatically if dtype="float32" is set.
# We detect whether correction was applied and never apply it twice.
# Source: ESA Sentinel-2 L2A Product Specification.
S2_SCALE  = 0.0001   # source: ESA L2A spec
S2_OFFSET = -0.1     # source: ESA L2A spec, baseline ≥04.00 only

# ── Cloud masking ───────────────────────────────────────────────────
# SCL classes to mask (treat as invalid):
# 0=No data, 1=Saturated/Defective, 3=Cloud shadow,
# 8=Cloud medium prob, 9=Cloud high prob, 10=Thin cirrus
# Source: ESA SCL class definitions.
SCL_MASK_CLASSES = [0, 1, 3, 8, 9, 10]

# ── NDVI / NDRE / NDMI formulas ─────────────────────────────────────
# NDVI = (B08 - B04) / (B08 + B04)   Tucker 1979, RSE 8:127-150
# NDRE = (B8A - B05) / (B8A + B05)   Barnes et al. 2000 (to verify)
#        Note: B07/B05 is also used in the literature.
# NDMI = (B8A - B11) / (B8A + B11)   Gao 1996, RSE 58:257-266
#        Also called NDMI by Wilson & Sader 2002, RSE 80:385-396.
#        NOT McFeeters (1996) open-water NDWI.
# Small epsilon added to denominators to avoid divide-by-zero.
INDEX_EPSILON = 1e-6

# ── NDVI thresholds for stress classification ────────────────────────
# These are design choices tuned for Ludhiana wheat, not cited values.
NDVI_HEALTHY  = 0.70   # design choice
NDVI_STRESSED = 0.50   # design choice
NDVI_CRITICAL = 0.35   # design choice

# ── NDMI threshold for water-related stress ──────────────────────────
# Zones with mean NDMI < this value are labelled "water-related stress"
# when also in Medium/High risk tier. Design choice.
NDMI_WATER_THRESHOLD = 0.10   # design choice

# ── Risk benchmark ───────────────────────────────────────────────────
# Benchmark = nanpercentile of zone NDVI across valid crop zones per date.
# Inspired by Kogan (1995) VCI concept, but applied spatially per date,
# not temporally per pixel. Design choice.
BENCHMARK_PERCENTILE = 90   # design choice

# ── Risk tier boundaries ─────────────────────────────────────────────
# Low / Medium / High = bottom / middle / top tertile of the season score.
# Design choice — tertiles ensure roughly equal zone counts per tier.
RISK_TIER_QUANTILES = [1/3, 2/3]   # design choice

# ── Season weighting ─────────────────────────────────────────────────
# Season score = weighted mean of per-date risk, with weights proportional
# to date index + 1 (later dates weighted more). Design choice, motivated
# by studies reporting stronger NDVI-yield correlation near heading/anthesis.
# No specific R2 values claimed.
SEASON_WEIGHT_MODE = "linear_increasing"   # design choice

# ── Valid fraction threshold ─────────────────────────────────────────
# Zones with < 50% non-cloud pixels on a given date are marked
# "low confidence" and excluded from the benchmark on that date.
# Design choice.
VALID_FRACTION_THRESHOLD = 0.50   # design choice

# ── Management zones (SLIC segmentation) ────────────────────────────
# Applied to the NDVI time stack (y, x, T).
# n_segments: approximate zone count. Design choice.
# compactness: higher = more square zones. Design choice.
SLIC_N_SEGMENTS  = 8     # design choice
SLIC_COMPACTNESS = 10.0  # design choice

# ── Yield-Risk shortfall ─────────────────────────────────────────────
# proj_peak  = zone_ndvi_now × (bench_peak / bench_now)
# shortfall  = clip((1 − proj_peak / bench_peak) × 100, 0, 100)
# Assumes zones keep their current ratio to the benchmark until peak.
# Design choice. Not a validated yield forecast.
# bench_peak = max of bench_t across all processed dates (from data).

# ── Raster export colormap ───────────────────────────────────────────
# Index value range for PNG export (clip before colormap).
# Design choice — chosen to span typical wheat NDVI in Rabi season.
INDEX_CMAP_VMIN = -0.1   # design choice
INDEX_CMAP_VMAX =  0.9   # design choice
INDEX_CMAP_NAME = "RdYlGn"   # design choice

# ── Output paths ─────────────────────────────────────────────────────
import os
ROOT          = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_RAW      = os.path.join(ROOT, "data", "raw")
DATA_PROC     = os.path.join(ROOT, "data", "processed")
API_STATIC    = os.path.join(ROOT, "api", "static")
STACK_NC      = os.path.join(DATA_RAW,  "stack.nc")
INDICES_NC    = os.path.join(DATA_PROC, "indices.nc")
DQ_JSON       = os.path.join(API_STATIC, "data_quality.json")
FIELDS_GEOJSON = os.path.join(API_STATIC, "fields.geojson")
STATS_JSON    = os.path.join(API_STATIC, "stats.json")
META_JSON     = os.path.join(API_STATIC, "meta.json")
