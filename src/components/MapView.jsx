import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, ImageOverlay, useMap } from 'react-leaflet'
import {
  ZONES_GEOJSON,
  getZoneColor,
  getZoneOpacity,
  getZoneData,
} from '../data/mockData'

const API_BASE = 'http://localhost:5050'

// Ludhiana fallback centre — used when meta.json is not yet available
const FALLBACK_CENTER  = [30.85, 75.70]
const FALLBACK_BOUNDS  = [[30.80, 75.65], [30.90, 75.75]]

// Layer name → API layer key (must match export.py output)
const LAYER_API_KEY = {
  NDVI: 'ndvi', NDRE: 'ndre', NDMI: 'ndmi', Stress: 'ndvi',
}

// ── FitBounds: called once when meta arrives ───────────────────────────
function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { animate: false, padding: [20, 20] })
  }, [bounds, map])
  return null
}

// ── FlyToZone ──────────────────────────────────────────────────────────
function FlyToZone({ selectedZone, geojsonData }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedZone) return
    const feature = geojsonData.features.find(f => f.properties.id === selectedZone)
    if (feature) {
      const coords = feature.geometry.coordinates[0]
      const lats = coords.map(c => c[1])
      const lngs = coords.map(c => c[0])
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
      map.flyTo([centerLat, centerLng], 14, { duration: 0.8 })
    }
  }, [selectedZone, geojsonData, map])
  return null
}

// ── Main component ─────────────────────────────────────────────────────
export default function MapView({
  dateIndex, activeLayer, selectedZone, onZoneSelect,
  meta,          // from /api/meta — null until loaded
  apiBase,       // Flask API root
  apiError,      // true when API unreachable
}) {
  // ── GeoJSON: use API data when available, fall back to mockData ────
  const [apiGeoJson, setApiGeoJson] = useState(null)
  const [geoJsonSource, setGeoJsonSource] = useState('loading')

  useEffect(() => {
    if (apiError) {
      setGeoJsonSource('mockdata')
      return
    }
    fetch(`${apiBase}/api/fields`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        setApiGeoJson(data)
        setGeoJsonSource('api')
      })
      .catch(() => setGeoJsonSource('mockdata'))
  }, [apiBase, apiError])

  // Which GeoJSON to show
  const geojsonData = apiGeoJson || ZONES_GEOJSON

  // Dates array from meta (for ImageOverlay URL)
  const dates = meta?.dates || []
  const currentDate = dates[dateIndex] ?? null

  // Leaflet bounds from meta.json ([[south,west],[north,east]])
  const metaBounds = meta?.bounds ?? null

  // ── Style for zone polygons ────────────────────────────────────────
  // Issue 4 fix: when data comes from API, use the tier field directly.
  // When using mockData, use the computed severity.
  const tierToColor = {
    healthy: '#10b981',
    medium:  '#fbbf24',
    high:    '#fb7185',
  }

  const getStyleForFeature = useMemo(() => {
    return (feature) => {
      const isSelected = feature.properties.id === selectedZone
      let fillColor

      if (geoJsonSource === 'api') {
        // Issue 4: colour from tier field (same field as risk list and composition)
        const tier = feature.properties.tier || 'healthy'
        fillColor = tierToColor[tier] ?? '#10b981'
      } else {
        // Fallback: NDVI-based colour from mockData
        fillColor = getZoneColor(feature.properties.name, dateIndex)
      }

      return {
        fillColor,
        fillOpacity: isSelected ? 0.65 : 0.45,
        weight: isSelected ? 3 : 1.5,
        color: isSelected ? '#10b981' : 'rgba(255,255,255,0.4)',
        dashArray: isSelected ? '' : '4',
      }
    }
  }, [dateIndex, selectedZone, geoJsonSource, apiGeoJson])

  const geoJsonKey = `${dateIndex}-${selectedZone}-${activeLayer}-${geoJsonSource}`

  // ── Popup builder ──────────────────────────────────────────────────
  const onEachFeature = (feature, layer) => {
    const zoneId = feature.properties.id
    const zoneName = feature.properties.name

    let risk, stressType, meanNdvi, shortfallPct,
        advisoryText, advisoryEvidence, lowConfidence, severityClass

    if (geoJsonSource === 'api') {
      const p = feature.properties
      // tier → severity class for CSS
      const tierCss = { healthy: 'healthy', medium: 'warning', high: 'critical' }
      severityClass = tierCss[p.tier] ?? 'healthy'
      risk          = p.season_score != null ? Math.round(p.season_score) : 'n/a'
      stressType    = p.stress_class ?? 'n/a'
      meanNdvi      = p.mean_ndvi != null ? Number(p.mean_ndvi).toFixed(3) : 'n/a'
      shortfallPct  = p.shortfall_pct != null ? `${p.shortfall_pct}%` : 'n/a'
      advisoryText  = p.advisory_text ?? 'n/a'
      advisoryEvidence = p.advisory_evidence ?? ''
      lowConfidence = p.low_confidence ?? false
    } else {
      // mockData fallback
      const zones   = getZoneData(dateIndex)
      const zoneData = zones.find(z => z.id === zoneId)
      if (!zoneData) return
      severityClass = zoneData.severity
      risk          = zoneData.risk
      stressType    = zoneData.stressType
      meanNdvi      = zoneData.meanNdvi.toFixed(2)
      shortfallPct  = `${zoneData.shortfallPct}%`
      advisoryText  = zoneData.advisoryText
      advisoryEvidence = zoneData.advisoryEvidence
      lowConfidence = zoneData.lowConfidence
    }

    layer.on({
      click: () => onZoneSelect(zoneId),
      mouseover: e => {
        e.target.setStyle({ weight: 3, color: '#10b981', fillOpacity: 0.65 })
      },
      mouseout: e => {
        if (zoneId !== selectedZone) {
          e.target.setStyle({ weight: 1.5, color: 'rgba(255,255,255,0.4)', fillOpacity: 0.45 })
        }
      },
    })

    layer.bindPopup(() => {
      const div = document.createElement('div')
      div.className = 'popup-content'
      div.innerHTML = `
        <div class="popup-header">
          <span class="popup-zone">${zoneName}</span>
          <span class="popup-risk-badge ${severityClass}"
                title="Ranks where to look first. It is relative, so some zones rank high even when the whole farm is healthy.">
            ${risk}% Relative Risk
          </span>
        </div>
        <div class="popup-stats">
          <div class="popup-stat">
            <div class="popup-stat-label">Stress Class</div>
            <div class="popup-stat-value">${stressType}</div>
          </div>
          <div class="popup-stat">
            <div class="popup-stat-label">Mean NDVI</div>
            <div class="popup-stat-value" style="color:${
              parseFloat(meanNdvi) < 0.35 ? '#fb7185' :
              parseFloat(meanNdvi) < 0.50 ? '#fbbf24' : '#34d399'
            }">${meanNdvi}</div>
          </div>
          <div class="popup-stat">
            <div class="popup-stat-label">Yield-Risk Index</div>
            <div class="popup-stat-value">${shortfallPct}</div>
          </div>
          <div class="popup-stat">
            <div class="popup-stat-label">Source</div>
            <div class="popup-stat-value" style="font-size:0.7rem;color:var(--text-dim)">
              ${geoJsonSource === 'api' ? 'pipeline/yield_risk.py' : 'Simulated (run pipeline)'}
            </div>
          </div>
        </div>
        ${lowConfidence ? `
          <div class="popup-recommendation warning" style="margin-bottom:0.5rem">
            ⚠️ Low confidence — less than 50% cloud-free pixels for this zone.
          </div>` : ''}
        <div class="popup-recommendation ${severityClass}">
          ${advisoryText}
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.3rem">
            ${advisoryEvidence}
          </div>
        </div>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.5rem;font-style:italic">
          Rule-based advisory, not a diagnosis.
        </div>
      `
      return div
    }, { maxWidth: 340 })
  }

  // ── ImageOverlay URL: /api/layer/{date}/{layer} ────────────────────
  const layerKey = LAYER_API_KEY[activeLayer] ?? 'ndvi'
  const overlayUrl = (currentDate && !apiError)
    ? `${apiBase}/api/layer/${currentDate}/${layerKey}`
    : null

  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      attributionControl={true}
    >
      {/* Issue 6: CARTO dark tiles — no API key required.
          If you see "API KEY REQUIRED" it is a network/firewall issue.
          OpenStreetMap fallback below is always key-free. */}
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        errorTileUrl="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Issue 7: NDVI raster overlay from pipeline/export.py
          Shown UNDER the zone polygons using zIndex.
          Only visible when API is running and pipeline has been executed. */}
      {overlayUrl && metaBounds && (
        <ImageOverlay
          url={overlayUrl}
          bounds={metaBounds}
          opacity={0.55}
          zIndex={200}
          attribution="Sentinel-2 L2A via Planetary Computer"
        />
      )}

      {/* Zone polygons — sit above the raster overlay */}
      <GeoJSON
        key={geoJsonKey}
        data={geojsonData}
        style={getStyleForFeature}
        onEachFeature={onEachFeature}
      />

      {/* Issue 1: fitBounds from meta.json when available */}
      {metaBounds && <FitBounds bounds={metaBounds} />}

      <FlyToZone selectedZone={selectedZone} geojsonData={geojsonData} />

      {/* Source label (bottom-left, above attribution) */}
      <div style={{
        position: 'absolute', bottom: '28px', left: '10px', zIndex: 1000,
        background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(51,65,85,0.4)',
        borderRadius: '6px', padding: '3px 8px',
        fontSize: '0.65rem', color: 'var(--text-dim)',
        pointerEvents: 'none',
      }}>
        {geoJsonSource === 'api'
          ? '✅ Real Sentinel-2 data'
          : '⚠️ Simulated data — run pipeline'}
      </div>
    </MapContainer>
  )
}
