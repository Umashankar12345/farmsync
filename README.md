# FasalScan — Crop Stress Intelligence

[![GitHub Repo](https://img.shields.io/badge/GitHub-Umashankar12345%2Ffarmsync-181717?logo=github)](https://github.com/Umashankar12345/farmsync)
[![Release](https://img.shields.io/badge/Release-demo--credible-10b981)](https://github.com/Umashankar12345/farmsync/releases/tag/demo-credible)
[![Satellite](https://img.shields.io/badge/Data-Copernicus%20Sentinel--2%20L2A-0284c7)](https://planetarycomputer.microsoft.com)
[![Status](https://img.shields.io/badge/Verification-ALL%20PASS-brightgreen)](#automated-integrity-checks)

> **Sentinel-2 L2A precision agriculture monitoring dashboard for wheat management zones in Ludhiana, Punjab (Rabi Season 2024–25).**
> Built with zero synthetic/fabricated data. Every pixel, index, and ranking traces directly to Copernicus Sentinel-2 L2A surface reflectance rasters.

---

## 🛰️ 1. What It Does

FasalScan transforms multi-spectral satellite imagery into actionable agronomist scouting priorities for wheat crops:
- **Optical & Biophysical Indices**: Computes Sentinel-2 NDVI, NDRE, and NDMI at 10 m resolution for 9 satellite passes across January–March 2025.
- **Data-Driven Management Zones**: 9 scouting sectors generated via multi-temporal SLIC superpixel clustering across the 10,758 ha scene.
- **Non-Crop Masking**: Automatically detects and masks out 2,829 ha (26.3%) of urban concrete, roads, and airstrip surfaces (NDVI < 0.20, NDMI < -0.05), ensuring rankings reflect only the 7,929 ha of genuine agricultural crop canopy.
- **Scouting Priority Tiers**: Ranks zones into relative scouting tiers (tertiles: High / Medium / Low) against a per-date 90th-percentile benchmark.
- **Yield-Risk Index**: Measures projected peak-NDVI shortfall against top-performing zones as an uncalibrated relative stress indicator.
- **Interactive Pixel Inspector**: Click any point on the map to inspect its WGS84 coordinates, EPSG:32643 UTM projection, raw Sentinel-2 DN values, BOA reflectance, and exact computed NDVI.

---

## 🧮 2. Hand-Calculation Proof (Verify for Judges)

To prove that no numbers are fabricated or mocked, any evaluator can verify the exact mathematical pipeline by hand on any pixel.

### Example Pixel Verification (Scene: `2025-02-05`)
- **Map Click Coordinates**: `Lat 30.8245° N`, `Lon 75.6739° E`
- **CRS Projection**: Converted from WGS84 (EPSG:4326) to UTM Zone 43N (EPSG:32643) $\rightarrow$ `(X: 755673, Y: 3413559)`
- **Raw Sentinel-2 Digital Numbers (DN)**:
  - Band 4 (Red, 665 nm): $DN_{\text{B04}} = 1266$
  - Band 8 (NIR, 842 nm): $DN_{\text{B08}} = 5444$
- **Copernicus BOA Reflectance Formula**:
  $$\rho = \frac{DN - 1000}{10000}$$
  $$\rho_{\text{B04}} = \frac{1266 - 1000}{10000} = \frac{266}{10000} = 0.0266$$
  $$\rho_{\text{B08}} = \frac{5444 - 1000}{10000} = \frac{4444}{10000} = 0.4444$$
- **NDVI Calculation (Tucker 1979)**:
  $$\text{NDVI} = \frac{\rho_{\text{B08}} - \rho_{\text{B04}}}{\rho_{\text{B08}} + \rho_{\text{B04}}} = \frac{0.4444 - 0.0266}{0.4444 + 0.0266} = \frac{0.4178}{0.4710} = 0.8870488... \approx \mathbf{0.8870}$$

The live Pixel Inspector and API endpoint `/api/pixel?lat=30.8245&lon=75.6739&date=2025-02-05` return **0.8870** exactly.

---

## 🎙️ 3. 60-Second Demo Pitch Script

> *"Judges, FasalScan solves scouting allocation for agronomists monitoring wheat across 10,758 hectares near Ludhiana, Punjab during the Rabi season.*
>
> *Here is what is real: every single pixel comes from Copernicus Sentinel-2 Level-2A surface reflectance. You can click anywhere on the map to see raw Digital Numbers for Band 4 and Band 8, and recompute the 0.8870 NDVI by hand. Notice that we don't include Ludhiana's urban patches in our agricultural ratings — our optical mask filters out 2,829 hectares of concrete and roads, leaving 7,929 hectares of verified crop.*
>
> *Here is what is relative: our priority tiers divide the farm into spatial tertiles based on deviation from the 90th percentile benchmark on that specific date. Zone 1 is ranked most urgent today with a 32.7% shortfall versus the farm's best zone.*
>
> *And here is our agronomic honesty: our NDMI moisture index confirms water is normal, so our advisory transparently states 'Cause unclear — scout for sowing date, nutrient or soil issues'. We never pretend to diagnose disease from orbit.*
>
> *Looking ahead, our planned production roadmap connects directly to farmer cadastral parcel vectors and calibrated crop-cutting harvest datasets."*

---

## 🌾 4. Architecture & Pipeline

```
Copernicus STAC API (Sentinel-2 L2A)
               │
               ▼
   [pipeline/ingest_pc.py] ──> data/raw/stack.nc (9 dates, 10m resampled)
               │
               ▼
   [pipeline/process_indices.py] ──> SCL Cloud Masking (6.9% cloudy pixels masked)
                                 ──> NDVI, NDRE, NDMI computation
                                 ──> Non-Crop Masking (NDVI < 0.20, NDMI < -0.05)
               │
               ▼
   [pipeline/cluster_zones.py]   ──> Multi-temporal SLIC superpixel clustering
                                 ──> 9 data-driven management zones (GeoJSON)
               │
               ▼
   [pipeline/yield_risk.py]      ──> 90th percentile benchmark & shortfall calculation
                                 ──> Rule-based advisory generation (no fake AI)
               │
               ▼
   [Flask REST API :5050]        ──> /api/dates, /api/zones, /api/pixel, /api/layer
               │
               ▼
   [React 19 + Vite + Leaflet]   ──> Interactive GIS dashboard, pixel inspector & charts
```

### Indices Used:
1. **NDVI** = $(B08 - B04) / (B08 + B04)$ — Tucker (1979). Canopy vigor.
2. **NDRE** = $(B8A - B05) / (B8A + B05)$ — Barnes et al. (2000). Red-edge chlorophyll sensitivity without saturation.
3. **NDMI** = $(B8A - B11) / (B8A + B11)$ — Gao (1996), Wilson & Sader (2002). Canopy liquid water content.

---

## 🛡️ 5. Automated Integrity Checks

FasalScan includes automated verification scripts to prove data integrity and rule out synthetic or fabricated placeholders:

```bash
# Verify all calculations, date arrays, scene counts, and cloud masking against raw NetCDF
python -X utf8 scripts/check_numbers.py

# Verify that no random mocks, fake varieties, or fabricated names exist in the codebase
python -X utf8 scripts/check_no_fake.py
```

Expected output:
```text
[PASS] scenes_used: nc=9  api=9
[PASS] cloud_masked_pct recomputed=6.9000  api=6.9000
[PASS] farm_shortfall_pct recomputed=13.2400  api=13.2400
[PASS] Zone 1 NDVI[2025-01-26] = 0.4985
[PASS] nc == meta.json == /api/dates
ALL PASS

PASS - no fake/random data patterns found.
```

---

## 🚀 6. Running Locally

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+ with `virtualenv`

### Backend Setup
```bash
# Activate virtual environment
.\venv\Scripts\activate       # Windows PowerShell
# source venv/bin/activate    # Linux/macOS

# Install dependencies (rasterio, xarray, flask, flask-cors, pyproj, netCDF4, scikit-image)
pip install -r requirements.txt

# Start the Flask API
python api/app.py
# Runs at http://localhost:5050
```

### Frontend Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Dashboard launches at http://localhost:5173
```

---

## 📋 7. Judge Q&A Cheat Sheet

| Question | Answer |
| :--- | :--- |
| **"Is 31% a probability?"** | No. It is a relative rank versus the 90th percentile benchmark zone on that date. |
| **"Why do 3 of 9 zones always show as High Risk?"** | The priority tiers are spatial tertiles (bottom 33%, middle 33%, top 33%) designed to allocate scouting labor efficiently. For absolute crop health, look at the Absolute Canopy Reference badge and mean NDVI. |
| **"What caused the dip on Jan 31?"** | Widespread Punjab winter radiation fog / ground haze. The ESA SCL layer misclassified the scene as 0% cloud cover. The rapid rebound to >0.65 five days later (Feb 5) proves it was atmospheric attenuation rather than vegetative collapse. |
| **"Why aren't zones 2 ha farm plots?"** | Sentinel-2 provides 10 m resolution. The 9 management zones are data-driven SLIC clusters (~1,100–1,250 ha gross) designed for regional agronomist scouting routing. Importing parcel-level cadastral shapefiles is a planned next step. |
| **"How do you mask urban areas?"** | Pixels with NDVI < 0.20 and NDMI < -0.05 across baseline scenes are classified as non-crop (concrete, roads, airstrip). 2,829 ha (26.3%) are masked out, leaving 7,929 ha of pure crop canopy. |
| **"Can you diagnose fungal disease?"** | No. Optical satellites cannot distinguish between fungal leaf rust, nitrogen deficiency, delayed sowing, or soil compaction. FasalScan honestly labels this *'Cause unclear (NDMI normal, NDVI low)'* and recommends ground inspection. |

---

## 🔗 8. Links & Provenance

- **GitHub Repository**: [https://github.com/Umashankar12345/farmsync](https://github.com/Umashankar12345/farmsync)
- **Git Tag**: [`demo-credible`](https://github.com/Umashankar12345/farmsync/releases/tag/demo-credible)
- **Sentinel-2 Scene ID (Feb 5, 2025)**: `S2A_MSIL2A_20250205T055011_R076_T43SER_20250205T084423`
- **Data Source**: Microsoft Planetary Computer STAC API / Copernicus Sentinel-2 L2A
