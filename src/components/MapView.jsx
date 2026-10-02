import { useEffect, useCallback, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, ImageOverlay, useMap } from 'react-leaflet'

// Initial view before the API supplies the pipeline bounds.
const FALLBACK_CENTER  = [30.85, 75.70]

// Layer name → API layer key (must match export.py output)
const LAYER_API_KEY = {
  TrueColor: 'truecolor', NDVI: 'ndvi', NDRE: 'ndre', NDMI: 'ndmi', Stress: null,
}

// ── FitBounds: called once when meta arrives ───────────────────────────
function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return undefined
    map.invalidateSize({ pan: false })
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false })
      map.fitBounds(bounds, { animate: false, padding: [4, 4], minZoom: 12 })
    })
    const retry = window.setTimeout(() => {
      map.invalidateSize({ pan: false })
      map.fitBounds(bounds, { animate: false, padding: [4, 4], minZoom: 12 })
    }, 150)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(retry)
    }
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
  fields = null, // from /api/fields via Dashboard
  apiBase,       // Flask API root
  apiError,      // true when API unreachable
}) {
  const [baseLayer, setBaseLayer] = useState('satellite')

  const baseLayers = {
    street: {
      label: 'Street',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    dark: {
      label: 'Dark',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    satellite: {
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; <a href="https://www.esri.com/en-us/legal/terms/full-master-terms-of-use">Esri</a>',
    },
  }

  // ── GeoJSON: API data from Dashboard ──────────────────────────────
  const geojsonData = fields
  const geoJsonSource = fields ? 'api' : (apiError ? 'unavailable' : 'loading')

  // Dates array from meta (for ImageOverlay URL)
  const dates = meta?.dates || []
  const currentDate = dates[dateIndex] ?? null

  // Leaflet bounds from meta.json ([[south,west],[north,east]])
  const metaBounds = meta?.bounds ?? null

  // ── Style for API zone polygons ───────────────────────────────────
  const tierToColor = {
    healthy: '#10b981',
    medium:  '#fbbf24',
    high:    '#fb7185',
  }

  const getStyleForFeature = useCallback((feature) => {
    const isSelected = feature.properties.id === selectedZone
    const tier = feature.properties.tier || 'healthy'
    const fillColor = tierToColor[tier] ?? '#10b981'

    return {
      fillColor,
      fillOpacity: isSelected ? 0.65 : 0.45,
      weight: isSelected ? 3 : 1.5,
      color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)',
      dashArray: '',
    }
  }, [selectedZone])

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
    } else return

    layer.on({
      click: () => onZoneSelect(zoneId),
      mouseover: e => {
        e.target.setStyle({ weight: 3, color: '#ffffff', fillOpacity: 0.65 })
      },
      mouseout: e => {
        if (zoneId !== selectedZone) {
          e.target.setStyle({ weight: 1.5, color: 'rgba(255,255,255,0.7)', fillOpacity: 0.45 })
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
              pipeline/yield_risk.py
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
        <div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.2rem;font-style:italic">
          Note: 3×3 regional grid zone, not parcel boundary.
        </div>
      `
      return div
    }, { maxWidth: 340 })
  }

  // ── ImageOverlay URL: /api/layer/{date}/{layer} ────────────────────
  const layerKey = LAYER_API_KEY[activeLayer]
  const overlayUrl = (currentDate && !apiError && layerKey)
    ? `${apiBase}/layer/${currentDate}/${layerKey}`
    : null

  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={13}
      zoomSnap={0.25}
      zoomDelta={0.25}
      className={`map-theme-${baseLayer}`}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        key={baseLayer}
        attribution={baseLayers[baseLayer].attribution}
        url={baseLayers[baseLayer].url}
      />

      <div className="basemap-control" role="group" aria-label="Basemap">
        {Object.entries(baseLayers).map(([key, layer]) => (
          <button
            key={key}
            type="button"
            className={baseLayer === key ? 'active' : ''}
            onClick={() => setBaseLayer(key)}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* Issue 7: NDVI raster overlay from pipeline/export.py
          Shown UNDER the zone polygons using zIndex.
          Only visible when API is running and pipeline has been executed. */}
      {overlayUrl && metaBounds && (
        <ImageOverlay
          key={`${currentDate}-${activeLayer}`}
          url={overlayUrl}
          bounds={metaBounds}
          opacity={0.55}
          zIndex={200}
          attribution="Sentinel-2 L2A via Planetary Computer"
        />
      )}

      {/* Zone polygons — sit above the raster overlay */}
      {geojsonData && (
        <GeoJSON
          key={geoJsonKey}
          data={geojsonData}
          style={getStyleForFeature}
          onEachFeature={onEachFeature}
        />
      )}

      {/* Issue 1: fitBounds from meta.json when available */}
      {metaBounds && <FitBounds bounds={metaBounds} />}

      {geojsonData && <FlyToZone selectedZone={selectedZone} geojsonData={geojsonData} />}
    </MapContainer>
  )
}
