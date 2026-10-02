import { useEffect, useCallback, useState } from 'react'
import {
  MapContainer, TileLayer, GeoJSON, ImageOverlay, useMap,
  ZoomControl, ScaleControl, CircleMarker, useMapEvents
} from 'react-leaflet'
import { LAYER_CONFIG } from '../data/layerConfig'
import { Crosshair, X, ExternalLink, Sparkles, Play, Pause } from 'lucide-react'

// Metadata for Sentinel-2 passes (Rabi 2024-25 season, Tile 43REQ Punjab)
const SATELLITE_PASS_META = {
  '2025-01-26': { satellite: 'Sentinel-2B', cloudPct: 0.0, label: '0% Cloud', status: 'clear' },
  '2025-01-31': { satellite: 'Sentinel-2B', cloudPct: 0.0, label: '0% (Fog/Haze)', status: 'fog', note: 'Winter haze' },
  '2025-02-05': { satellite: 'Sentinel-2A', cloudPct: 0.0, label: '0% Cloud', status: 'clear' },
  '2025-03-02': { satellite: 'Sentinel-2B', cloudPct: 0.0, label: '0% Cloud', status: 'clear' },
  '2025-03-07': { satellite: 'Sentinel-2A', cloudPct: 9.4, label: '9% Masked', status: 'masked' },
  '2025-03-12': { satellite: 'Sentinel-2B', cloudPct: 52.7, label: '53% Masked', status: 'heavy-cloud', note: 'Low confidence' },
  '2025-03-17': { satellite: 'Sentinel-2A', cloudPct: 0.0, label: '0% Cloud', status: 'clear' },
  '2025-03-22': { satellite: 'Sentinel-2B', cloudPct: 0.0, label: '0% Cloud', status: 'clear' },
  '2025-03-27': { satellite: 'Sentinel-2A', cloudPct: 0.0, label: '0% Cloud', status: 'clear', isLatest: true },
}

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

// ── MapEventsHandler: click for pixel inspector & mousemove for coordinates ──
function MapEventsHandler({ onPixelClick, onMouseMove }) {
  useMapEvents({
    click(e) {
      onPixelClick(e.latlng)
    },
    mousemove(e) {
      if (onMouseMove) onMouseMove(e.latlng)
    },
  })
  return null
}

// ── Main component ─────────────────────────────────────────────────────
export default function MapView({
  dateIndex, setDateIndex, dates: propDates, isPlaying, togglePlay,
  activeLayer, setActiveLayer, selectedZone, onZoneSelect,
  meta,          // from /api/meta — null until loaded
  fields = null, // from /api/fields via Dashboard
  apiBase,       // Flask API root
  apiError,      // true when API unreachable
}) {
  const [baseLayer, setBaseLayer] = useState('satellite')
  const [cursorCoords, setCursorCoords] = useState(null)
  const [inspectedPixel, setInspectedPixel] = useState(null)
  const [inspectorLoading, setInspectorLoading] = useState(false)
  const [inspectorError, setInspectorError] = useState(null)

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

  // Dates array from props or meta (for ImageOverlay URL and timeline)
  const dates = (propDates && propDates.length > 0) ? propDates : (meta?.dates || [])
  const currentDate = dates[dateIndex] ?? null

  // Leaflet bounds from meta.json ([[south,west],[north,east]])
  const metaBounds = meta?.bounds ?? null

  // ── Pixel Inspector query ──────────────────────────────────────────
  const handlePixelClick = useCallback((latlng) => {
    if (!latlng) return

    // Bounding box check: keep inspector closed unless clicked within scene bounds
    const bounds = metaBounds || [[30.799, 75.649], [30.901, 75.751]]
    const south = Math.min(bounds[0][0], bounds[1][0])
    const north = Math.max(bounds[0][0], bounds[1][0])
    const west = Math.min(bounds[0][1], bounds[1][1])
    const east = Math.max(bounds[0][1], bounds[1][1])

    if (latlng.lat < south || latlng.lat > north || latlng.lng < west || latlng.lng > east) {
      return
    }

    setInspectorLoading(true)
    setInspectorError(null)
    setInspectedPixel({
      lat: latlng.lat,
      lon: latlng.lng,
      loading: true,
    })

    const dateParam = currentDate ? `&date=${currentDate}` : ''
    fetch(`${apiBase}/pixel?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}${dateParam}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setInspectedPixel(data)
        setInspectorLoading(false)
      })
      .catch((err) => {
        console.error('Pixel inspect error:', err)
        setInspectorError('Failed to query pixel from stack.nc')
        setInspectorLoading(false)
      })
  }, [apiBase, currentDate, metaBounds])

  // ── Style for Field Polygons (Clear boundaries with subtle tier indication) ──
  const getStyleForFeature = useCallback((feature) => {
    const isSelected = feature.properties.id === selectedZone
    const tier = feature.properties.tier

    // Crisp field polygon boundaries corresponding to relative risk tier
    const tierColor = {
      high: '#f43f5e',
      medium: '#fbbf24',
      healthy: '#34d399',
    }[tier] || '#60a5fa'

    if (isSelected) {
      return {
        fillColor: '#38bdf8',
        fillOpacity: 0.22,
        weight: 3.5,
        color: '#ffffff',
        dashArray: '',
      }
    }

    return {
      fillColor: tier === 'high' ? 'rgba(244, 63, 94, 0.05)' : 'transparent',
      fillOpacity: 0.05,
      weight: 1.8,
      color: tierColor,
      opacity: 0.85,
    }
  }, [selectedZone])

  const geoJsonKey = `${dateIndex}-${selectedZone}-${activeLayer}-${geoJsonSource}`

  // ── Popup & Tooltip builder ──────────────────────────────────────────
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
      click: (e) => {
        onZoneSelect(zoneId)
        handlePixelClick(e.latlng)
      },
      mouseover: (e) => {
        e.target.setStyle({
          weight: 3.2,
          color: '#ffffff',
          fillColor: '#38bdf8',
          fillOpacity: 0.25,
        })
      },
      mouseout: (e) => {
        const style = getStyleForFeature(feature)
        e.target.setStyle(style)
      },
    })

    // Rich Leaflet tooltip showing Zone name, crop, hectares, and latest NDVI
    const haText = feature.properties.hectares ? `${Math.round(feature.properties.hectares).toLocaleString()} ha` : ''
    const cropText = 'Wheat (assumed, Rabi)'
    layer.bindTooltip(
      `<div style="font-weight:700;font-size:11px;color:#f8fafc">${zoneName}</div>` +
      `<div style="font-size:10px;color:#cbd5e1">${cropText} · ${haText}</div>`,
      { permanent: false, direction: 'center', opacity: 0.95, className: 'field-leaflet-tooltip' }
    )

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
          Note: Data-driven SLIC multi-spectral cluster (${feature.properties.hectares ? Math.round(feature.properties.hectares).toLocaleString() : 1200} ha), derived from Sentinel-2 L2A.
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
      zoomControl={false}
      attributionControl={true}
    >
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />

      {/* Location Provenance Pill (Top Center) */}
      <div className="map-location-badge">
        <span className="location-pin">📍</span>
        <span className="location-name">Ludhiana Agri-Cluster, Punjab, India</span>
        <span className="location-separator">·</span>
        <span className="location-coords">30.85° N, 75.70° E</span>
        <span className="location-tag">Sentinel-2 L2A · 10m GSD</span>
      </div>

      <MapEventsHandler
        onPixelClick={handlePixelClick}
        onMouseMove={setCursorCoords}
      />

      {/* Layer Toggle: compact control at top-left */}
      {setActiveLayer && (
        <div className="map-layer-control" role="group" aria-label="Layer Toggle">
          {Object.keys(LAYER_CONFIG).map((key) => (
            <button
              key={key}
              type="button"
              className={`map-layer-btn ${activeLayer === key ? 'active' : ''}`}
              onClick={() => setActiveLayer(key)}
              id={`map-layer-btn-${key}`}
            >
              {LAYER_CONFIG[key].name}
            </button>
          ))}
        </div>
      )}

      {/* Zone-Level Notice when Stress layer is active */}
      {activeLayer === 'Stress' && (
        <div style={{
          position: 'absolute',
          top: '46px',
          left: '12px',
          zIndex: 998,
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(244, 63, 94, 0.35)',
          borderRadius: '6px',
          padding: '4px 10px',
          fontSize: '0.72rem',
          color: '#cbd5e1',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#fb7185' }}>ℹ️</span>
          <span><strong>Zone-Level Layer:</strong> Categorical tiers shown on zone polygons (derived from NDVI + NDMI; no pixel raster).</span>
        </div>
      )}

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

      {/* Live cursor coordinates badge */}
      {cursorCoords && (
        <div className="cursor-coords-badge">
          <span>📍 Lat {cursorCoords.lat.toFixed(4)}° N, Lon {cursorCoords.lng.toFixed(4)}° E</span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ color: '#38bdf8' }}>Click pixel to inspect</span>
        </div>
      )}

      {/* Date Strip of Real Satellite Passes (Agromonitoring style) */}
      {dates && dates.length > 0 && setDateIndex && (
        <div className="satellite-strip-container" role="region" aria-label="Satellite Passes Timeline">
          {togglePlay && (
            <button
              type="button"
              className="strip-play-btn"
              onClick={togglePlay}
              title={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
              aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
            </button>
          )}
          <div className="satellite-cards-track">
            {dates.map((dateStr, idx) => {
              const isActive = idx === dateIndex
              const passMeta = SATELLITE_PASS_META[dateStr] || { satellite: 'Sentinel-2', cloudPct: 0, label: 'Clear', status: 'clear' }
              const isHaze = passMeta.status === 'fog'
              const isCloudy = passMeta.status === 'heavy-cloud'
              const monthDay = new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setDateIndex(idx)}
                  className={`satellite-pass-card ${isActive ? 'active' : ''} ${isHaze ? 'haze' : ''} ${isCloudy ? 'cloudy' : ''}`}
                  title={`${dateStr} · ${passMeta.satellite} · ${passMeta.label}${passMeta.note ? ` (${passMeta.note})` : ''}`}
                >
                  <div className="pass-header">
                    <span className="pass-date">{monthDay}</span>
                    <span className="pass-sensor">{passMeta.satellite === 'Sentinel-2B' ? 'S2B' : 'S2A'}</span>
                  </div>
                  <div className="pass-footer">
                    {isHaze ? (
                      <span className="pass-condition fog">🌫️ Haze</span>
                    ) : isCloudy ? (
                      <span className="pass-condition cloud">☁️ 53%</span>
                    ) : passMeta.cloudPct > 0 ? (
                      <span className="pass-condition partial">⛅ 9%</span>
                    ) : (
                      <span className="pass-condition clear">☀️ 0%</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Inspected pixel marker */}
      {inspectedPixel && inspectedPixel.lat && inspectedPixel.lon && (
        <CircleMarker
          center={[inspectedPixel.lat, inspectedPixel.lon]}
          radius={7}
          pathOptions={{
            color: '#38bdf8',
            fillColor: '#38bdf8',
            fillOpacity: 0.7,
            weight: 2,
          }}
        />
      )}

      {/* Pixel Inspector Floating Card */}
      {inspectedPixel && (
        <div
          className="pixel-inspector-card"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          role="region"
          aria-label="Pixel Inspector"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', paddingBottom: '0.45rem', marginBottom: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Crosshair size={15} style={{ color: '#38bdf8' }} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff' }}>Pixel Inspector</span>
              <span style={{ fontSize: '0.62rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>10m GSD</span>
            </div>
            <button
              onClick={() => setInspectedPixel(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex' }}
              title="Close inspector"
              aria-label="Close inspector"
            >
              <X size={15} />
            </button>
          </div>

          {inspectorLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
              Querying raw bands from stack.nc...
            </div>
          ) : inspectorError ? (
            <div style={{ color: '#fb7185', fontSize: '0.78rem', padding: '0.5rem 0' }}>
              ⚠️ {inspectorError}
            </div>
          ) : !inspectedPixel.in_bounds ? (
            <div style={{ color: '#fbbf24', fontSize: '0.78rem', lineHeight: 1.4, padding: '0.4rem 0' }}>
              ⚠️ {inspectedPixel.message || 'Coordinates are outside the Sentinel-2 scene footprint.'}
            </div>
          ) : (
            <div>
              {/* Coordinates & Timestamp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                <span>📍 {inspectedPixel.lat.toFixed(5)}° N, {inspectedPixel.lon.toFixed(5)}° E</span>
                <span>UTM {inspectedPixel.utm_zone}</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.65rem' }}>
                Acquisition: <strong style={{ color: '#e2e8f0' }}>{inspectedPixel.date} {inspectedPixel.time_utc?.slice(11, 19)} UTC</strong>
              </div>

              {/* SCL classification */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.7)', padding: '0.4rem 0.55rem', borderRadius: '6px',
                fontSize: '0.72rem', marginBottom: '0.65rem', border: '1px solid rgba(51, 65, 85, 0.4)',
              }}>
                <span style={{ color: '#94a3b8' }}>Scene Classification (SCL)</span>
                <span style={{ fontWeight: 600, color: inspectedPixel.scl?.code === 4 ? '#34d399' : '#fbbf24' }}>
                  {inspectedPixel.scl?.label}
                </span>
              </div>

              {/* Raw Bands Table */}
              <div style={{ marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.3rem', letterSpacing: '0.5px' }}>
                  Raw Bands (Digital Numbers &amp; BOA Reflectance)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(15, 23, 42, 0.75)', borderRadius: '6px', padding: '0.45rem 0.6rem', border: '1px solid rgba(51, 65, 85, 0.35)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: '0.72rem' }}>
                    <span>B04 (Red 665nm)</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      DN <strong>{inspectedPixel.raw_bands?.B04}</strong> → ρ {inspectedPixel.surface_reflectance?.B04}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399', fontSize: '0.72rem' }}>
                    <span>B08 (NIR 842nm)</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      DN <strong>{inspectedPixel.raw_bands?.B08}</strong> → ρ {inspectedPixel.surface_reflectance?.B08}
                    </span>
                  </div>
                  {inspectedPixel.raw_bands?.B05 != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.68rem' }}>
                      <span>B05 (RedEdge 705nm)</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        DN {inspectedPixel.raw_bands?.B05} → ρ {inspectedPixel.surface_reflectance?.B05}
                      </span>
                    </div>
                  )}
                  {inspectedPixel.raw_bands?.B8A != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.68rem' }}>
                      <span>B8A (Narrow NIR 865nm)</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        DN {inspectedPixel.raw_bands?.B8A} → ρ {inspectedPixel.surface_reflectance?.B8A}
                      </span>
                    </div>
                  )}
                  {inspectedPixel.raw_bands?.B11 != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.68rem' }}>
                      <span>B11 (SWIR 1610nm)</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        DN {inspectedPixel.raw_bands?.B11} → ρ {inspectedPixel.surface_reflectance?.B11}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Exact Formula Step */}
              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '6px',
                padding: '0.45rem 0.6rem',
                marginBottom: '0.65rem',
                fontSize: '0.7rem',
              }}>
                <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '0.15rem' }}>
                  Formula Proof (Tucker 1979):
                </div>
                <div style={{ fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.68rem' }}>
                  {inspectedPixel.formula}
                </div>
              </div>

              {/* Computed Indices */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', marginBottom: '0.65rem' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', padding: '0.35rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>NDVI</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399', fontFamily: 'monospace' }}>
                    {inspectedPixel.indices?.ndvi}
                  </div>
                </div>
                <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', padding: '0.35rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>NDRE</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#60a5fa', fontFamily: 'monospace' }}>
                    {inspectedPixel.indices?.ndre ?? 'n/a'}
                  </div>
                </div>
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', padding: '0.35rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>NDMI</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'monospace' }}>
                    {inspectedPixel.indices?.ndmi ?? 'n/a'}
                  </div>
                </div>
              </div>

              {/* Provenance Footer */}
              <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                <span style={{ color: '#94a3b8' }}>
                  Tile {inspectedPixel.provenance?.tile} · Baseline {inspectedPixel.provenance?.baseline}
                </span>
                <a
                  href={inspectedPixel.provenance?.platform_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  Planetary Computer <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Issue 7: NDVI raster overlay from pipeline/export.py
          Shown UNDER the zone polygons using zIndex.
          Only visible when API is running and pipeline has been executed. */}
      {overlayUrl && metaBounds && (
        <ImageOverlay
          key={`${currentDate}-${activeLayer}`}
          url={overlayUrl}
          bounds={metaBounds}
          opacity={0.60}
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
