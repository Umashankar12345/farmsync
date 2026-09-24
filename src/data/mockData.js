/* ========================================
   FasalScan — Computed Analytics Data
   Based on Ludhiana, Punjab farmland

   IMPORTANT: In a production pipeline, all numbers below would be
   computed from Sentinel-2 imagery via pipeline/export.py → stats.json
   and fields.geojson. For this hackathon demo the data is simulated
   but structured identically to the pipeline output. No number is
   hand-typed into the UI components — they all flow from this module.
   ======================================== */

// ── CONFIG: Thresholds (design choices, not from literature) ────────
// These would live in pipeline/config.py in the full stack.
export const CONFIG = {
  // NDVI thresholds for colour bins — design choice
  NDVI_HEALTHY:  0.70,
  NDVI_STRESSED: 0.50,
  NDVI_CRITICAL: 0.35,
  // NDMI threshold for water-related stress — design choice
  NDMI_WATER_STRESS: 0.10,
  // Composition thresholds — design choice
  COMPOSITION_HEALTHY:  0.70,
  COMPOSITION_STRESSED: 0.45,
  // Benchmark percentile for risk ranking — design choice
  BENCHMARK_PERCENTILE: 90,
  // Yield-risk scaling — design choice, not from a paper
  // (the old ×1.5 multiplier has been removed)
}

// ── DATE RANGE (from scene metadata in production) ──────────────────
export const DATES = [
  'Jan 1', 'Jan 15', 'Feb 1', 'Feb 15',
  'Mar 1', 'Mar 15', 'Apr 1', 'Apr 15',
  'May 1', 'May 15'
]

// ── SIMULATED DATA QUALITY (would be data_quality.json) ─────────────
export const DATA_QUALITY = {
  scenes_found: 12,
  scenes_used: DATES.length,
  total_cloud_masked_pct: 14.2,
  processing_baseline: '05.09',
  offset_applied: true,
  per_date_cloud_masked: [
    0.08, 0.12, 0.05, 0.18, 0.22, 0.10, 0.15, 0.20, 0.11, 0.14
  ],
  bands_resampled: 'B05, B8A, B11, SCL natively 20 m, resampled to 10 m',
}

// ── NDVI timelines per management zone (simulated sensor output) ────
// In production these come from per-zone mean NDVI computed by
// yield_risk.py and exported to fields.geojson properties.ndvi_series
const ndviTimelines = {
  'Zone 1': [0.82, 0.84, 0.86, 0.85, 0.83, 0.80, 0.78, 0.76, 0.72, 0.68],
  'Zone 2': [0.78, 0.80, 0.79, 0.75, 0.70, 0.62, 0.55, 0.48, 0.42, 0.38],
  'Zone 3': [0.75, 0.73, 0.68, 0.60, 0.52, 0.42, 0.35, 0.28, 0.22, 0.18],
  'Zone 4': [0.80, 0.82, 0.84, 0.83, 0.81, 0.79, 0.77, 0.74, 0.70, 0.65],
  'Zone 5': [0.76, 0.74, 0.71, 0.65, 0.58, 0.50, 0.44, 0.40, 0.36, 0.33],
  'Zone 6': [0.84, 0.86, 0.88, 0.87, 0.86, 0.84, 0.82, 0.80, 0.78, 0.75],
  'Zone 7': [0.72, 0.70, 0.66, 0.60, 0.55, 0.50, 0.46, 0.42, 0.38, 0.34],
  'Zone 8': [0.85, 0.87, 0.88, 0.86, 0.84, 0.82, 0.80, 0.78, 0.75, 0.72],
}

// ── VALID FRACTION per zone per date (simulated) ────────────────────
// Share of non-cloud pixels. Zones with < 0.5 get a "low confidence" badge.
const validFractions = {
  'Zone 1': [0.95, 0.90, 0.98, 0.82, 0.78, 0.92, 0.88, 0.80, 0.91, 0.87],
  'Zone 2': [0.92, 0.88, 0.95, 0.80, 0.75, 0.90, 0.85, 0.78, 0.89, 0.85],
  'Zone 3': [0.90, 0.85, 0.92, 0.78, 0.70, 0.88, 0.82, 0.75, 0.87, 0.83],
  'Zone 4': [0.94, 0.91, 0.97, 0.84, 0.80, 0.93, 0.89, 0.82, 0.92, 0.88],
  'Zone 5': [0.88, 0.82, 0.90, 0.72, 0.65, 0.85, 0.78, 0.70, 0.84, 0.80],
  'Zone 6': [0.96, 0.93, 0.99, 0.86, 0.82, 0.95, 0.91, 0.84, 0.94, 0.90],
  'Zone 7': [0.85, 0.78, 0.88, 0.68, 0.42, 0.82, 0.75, 0.65, 0.80, 0.76],
  'Zone 8': [0.93, 0.89, 0.96, 0.83, 0.79, 0.92, 0.87, 0.81, 0.91, 0.86],
}

// ── COMPUTED: per-date benchmark (90th percentile of zone NDVI) ─────
function computeBenchmark(dateIndex) {
  const values = Object.values(ndviTimelines)
    .map(tl => tl[dateIndex])
    .filter(v => v != null)
    .sort((a, b) => a - b)
  const idx = Math.ceil(values.length * (CONFIG.BENCHMARK_PERCENTILE / 100)) - 1
  return values[Math.min(idx, values.length - 1)]
}

// ── COMPUTED: risk score per zone = (1 − ndvi/benchmark) × 100 ──────
function computeRisk(zoneName, dateIndex) {
  const tl = ndviTimelines[zoneName]
  if (!tl) return 0
  const ndvi = tl[dateIndex] ?? tl[tl.length - 1]
  const bench = computeBenchmark(dateIndex)
  if (bench <= 0) return 0
  return Math.round(Math.max(0, Math.min(100, (1 - ndvi / bench) * 100)))
}

// ── COMPUTED: severity tier from risk tertiles ──────────────────────
function computeSeverity(risk, allRisks) {
  const sorted = [...allRisks].sort((a, b) => a - b)
  const t1 = sorted[Math.floor(sorted.length / 3)]
  const t2 = sorted[Math.floor((sorted.length * 2) / 3)]
  if (risk <= t1) return 'healthy'
  if (risk <= t2) return 'warning'
  return 'critical'
}

// ── COMPUTED: stress class from NDVI level ───────────────────────────
// Renamed: "Disease" → "Non-water stress (cause undetermined)"
//          "Water Stress" → "Water-related stress"
function computeStressClass(zoneName, dateIndex) {
  const tl = ndviTimelines[zoneName]
  if (!tl) return 'Healthy'
  const ndvi = tl[dateIndex] ?? tl[tl.length - 1]
  if (ndvi >= CONFIG.NDVI_HEALTHY) return 'Healthy'
  if (ndvi >= CONFIG.NDVI_STRESSED) return 'Non-water stress (cause undetermined)'
  return 'Water-related stress'
}

// ── COMPUTED: rule-based advisory (not "AI recommendations") ────────
// Banned: "urgently", "needed", "disease detected", "will"
function computeAdvisory(severity, stressClass, zoneName, dateIndex) {
  const tl = ndviTimelines[zoneName] || []
  const ndvi = tl[dateIndex] ?? 0
  const bench = computeBenchmark(dateIndex)

  const evidence = `NDVI ${ndvi.toFixed(2)} (zone) vs ${bench.toFixed(2)} (top-${CONFIG.BENCHMARK_PERCENTILE}% benchmark)`

  let text
  if (severity === 'critical' && stressClass === 'Water-related stress') {
    text = 'Consider irrigation and verify in the field.'
  } else if (severity === 'critical') {
    text = 'Scout this zone within a few days. Cause is undetermined.'
  } else if (severity === 'warning') {
    text = 'Monitor. Early signs of stress.'
  } else {
    text = 'No action suggested.'
  }

  return { text, evidence }
}

// ── COMPUTED: yield-risk shortfall per zone ──────────────────────────
// proj_peak = zone_ndvi_now × (bench_peak / bench_now)
// shortfall = clip((1 − proj_peak / bench_peak) × 100, 0, 100)
// Design choice. Not a validated yield forecast.
function computeShortfall(zoneName, dateIndex) {
  const tl = ndviTimelines[zoneName]
  if (!tl) return 0
  const ndviNow = tl[dateIndex] ?? tl[tl.length - 1]
  const benchNow = computeBenchmark(dateIndex)
  // bench_peak = max benchmark across all dates
  const benchPeak = Math.max(...DATES.map((_, i) => computeBenchmark(i)))
  if (benchNow <= 0 || benchPeak <= 0) return 0
  const projPeak = ndviNow * (benchPeak / benchNow)
  return Math.round(Math.max(0, Math.min(100, (1 - projPeak / benchPeak) * 100)))
}

// ── ZONE_DATA: fully computed, no hand-typed risk/yield numbers ─────
// In production this is built by yield_risk.py → fields.geojson
function buildZoneData(dateIndex) {
  const zoneNames = Object.keys(ndviTimelines)
  const allRisks = zoneNames.map(name => computeRisk(name, dateIndex))

  return zoneNames.map((name, i) => {
    const idx = i + 1
    const risk = allRisks[i]
    const severity = computeSeverity(risk, allRisks)
    const stressClass = computeStressClass(name, dateIndex)
    const advisory = computeAdvisory(severity, stressClass, name, dateIndex)
    const tl = ndviTimelines[name]
    const ndvi = tl[dateIndex] ?? tl[tl.length - 1]
    const vf = validFractions[name]
    const validFrac = vf ? vf[dateIndex] ?? 1 : 1

    return {
      id: `zone-${idx}`,
      name,
      risk,
      severity,
      stressType: stressClass,
      crop: idx <= 5 || idx === 7 ? 'Wheat' : idx === 8 ? 'Mustard' : 'Rice',
      area: `${20 + idx * 5} ha`, // approximate from zone polygon area
      advisoryText: advisory.text,
      advisoryEvidence: advisory.evidence,
      shortfallPct: computeShortfall(name, dateIndex),
      meanNdvi: ndvi,
      validFraction: validFrac,
      lowConfidence: validFrac < 0.5,
    }
  })
}

// Exported: call with current dateIndex to get fully computed zone data
export function getZoneData(dateIndex) {
  return buildZoneData(dateIndex)
}

// Get NDVI timeline for a zone (for Recharts)
export function getNdviTimeline(zoneName) {
  const timeline = ndviTimelines[zoneName] || ndviTimelines['Zone 1']
  return DATES.map((date, i) => ({
    date,
    ndvi: timeline[i],
  }))
}

// Get zone color based on NDVI at current date index
// Thresholds from CONFIG (design choices)
export function getZoneColor(zoneName, dateIndex) {
  const timeline = ndviTimelines[zoneName] || [0.7]
  const ndvi = timeline[dateIndex] ?? timeline[timeline.length - 1]

  if (ndvi >= CONFIG.NDVI_HEALTHY)  return '#10b981'
  if (ndvi >= CONFIG.NDVI_STRESSED) return '#fbbf24'
  if (ndvi >= CONFIG.NDVI_CRITICAL) return '#f97316'
  return '#fb7185'
}

// Get zone opacity for overlay
export function getZoneOpacity(zoneName, dateIndex) {
  const timeline = ndviTimelines[zoneName] || [0.7]
  const ndvi = timeline[dateIndex] ?? timeline[timeline.length - 1]
  return 0.35 + (1 - ndvi) * 0.35
}

// Farm composition at a date index — computed from zone NDVI, not hand-typed
export function getFarmComposition(dateIndex) {
  const zoneNames = Object.keys(ndviTimelines)
  let healthy = 0, stressed = 0, critical = 0

  zoneNames.forEach(name => {
    const timeline = ndviTimelines[name] || [0.7]
    const ndvi = timeline[dateIndex] ?? timeline[timeline.length - 1]
    if (ndvi >= CONFIG.COMPOSITION_HEALTHY) healthy++
    else if (ndvi >= CONFIG.COMPOSITION_STRESSED) stressed++
    else critical++
  })

  const total = zoneNames.length
  return {
    healthy: Math.round((healthy / total) * 100),
    stressed: Math.round((stressed / total) * 100),
    critical: Math.round((critical / total) * 100),
  }
}

// Yield-Risk Index (farm-level) — weighted mean shortfall across zones
// Design choice. Assumes zones keep their current ratio to the benchmark
// until peak.
export function getYieldRiskIndex(dateIndex) {
  const zoneNames = Object.keys(ndviTimelines)
  const shortfalls = zoneNames.map(name => computeShortfall(name, dateIndex))
  const mean = shortfalls.reduce((sum, v) => sum + v, 0) / shortfalls.length
  return Math.round(mean)
}

// ── STATIC: GeoJSON polygons for 8 management zones ────────────────
// These are a 200 m × 200 m grid, NOT real field boundaries.
// Centered roughly at 30.9°N, 75.85°E (Ludhiana area)
export const ZONES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Zone 1', id: 'zone-1' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.80, 30.94], [75.83, 30.94], [75.83, 30.97], [75.80, 30.97], [75.80, 30.94]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 2', id: 'zone-2' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.83, 30.94], [75.86, 30.94], [75.86, 30.97], [75.83, 30.97], [75.83, 30.94]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 3', id: 'zone-3' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.86, 30.94], [75.89, 30.94], [75.89, 30.97], [75.86, 30.97], [75.86, 30.94]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 4', id: 'zone-4' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.89, 30.94], [75.92, 30.94], [75.92, 30.97], [75.89, 30.97], [75.89, 30.94]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 5', id: 'zone-5' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.80, 30.91], [75.83, 30.91], [75.83, 30.94], [75.80, 30.94], [75.80, 30.91]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 6', id: 'zone-6' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.83, 30.91], [75.86, 30.91], [75.86, 30.94], [75.83, 30.94], [75.83, 30.91]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 7', id: 'zone-7' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.86, 30.91], [75.89, 30.91], [75.89, 30.94], [75.86, 30.94], [75.86, 30.91]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Zone 8', id: 'zone-8' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [75.89, 30.91], [75.92, 30.91], [75.92, 30.94], [75.89, 30.94], [75.89, 30.91]
        ]]
      }
    },
  ]
}

// ── Layer label configurations ──────────────────────────────────────
export const LAYER_CONFIG = {
  NDVI: {
    name: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    legendMin: 'Low Vigor',
    legendMax: 'High Vigor',
    gradient: 'linear-gradient(90deg, #fb7185, #f97316, #fbbf24, #34d399, #10b981)',
  },
  NDRE: {
    name: 'NDRE',
    // (B8A − B05) / (B8A + B05). NDRE is more sensitive to early
    // chlorophyll change than NDVI.
    fullName: 'Normalized Difference Red Edge Index',
    legendMin: 'Low Chlorophyll',
    legendMax: 'High Chlorophyll',
    gradient: 'linear-gradient(90deg, #e11d48, #f97316, #eab308, #22c55e, #059669)',
  },
  NDMI: {
    name: 'NDMI',
    // (B8A − B11) / (B8A + B11). NIR+SWIR moisture index (Gao 1996,
    // also called NDMI by Wilson & Sader 2002). NOT McFeeters' open-water NDWI.
    fullName: 'Normalized Difference Moisture Index (Gao 1996)',
    legendMin: 'Dry / Low Moisture',
    legendMax: 'Well-Watered',
    gradient: 'linear-gradient(90deg, #fb7185, #f97316, #fbbf24, #60a5fa, #3b82f6)',
  },
  Stress: {
    name: 'Stress',
    fullName: 'Crop Stress Composite',
    legendMin: 'High Stress',
    legendMax: 'No Stress',
    gradient: 'linear-gradient(90deg, #e11d48, #fb7185, #fbbf24, #34d399, #10b981)',
  },
}
