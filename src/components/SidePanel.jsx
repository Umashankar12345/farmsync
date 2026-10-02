import { useState, useEffect } from 'react'
import {
  Wheat, Play, Pause, Calendar, AlertTriangle, TrendingDown,
  Layers, BarChart3, FileText, LogOut, Info, Database, ShieldAlert
} from 'lucide-react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts'
import {
  LAYER_CONFIG,
} from '../data/mockData'

export default function SidePanel({
  dateIndex, setDateIndex,
  activeLayer, setActiveLayer,
  selectedZone, onZoneSelect,
  isPlaying, togglePlay,
  onLogout,
  dates,
  apiBase,
  apiError,
}) {
  const [showAbout, setShowAbout] = useState(false)

  // ── API data: fields + stats + data-quality ─────────────────────
  const [apiFields, setApiFields] = useState(null)   // features array
  const [apiStats,  setApiStats]  = useState(null)
  const [apiDQ,     setApiDQ]     = useState(null)

  useEffect(() => {
    if (apiError) return
    Promise.all([
      fetch(`${apiBase}/fields`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/stats`).then(r  => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/data-quality`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([fields, stats, dq]) => {
      if (fields) setApiFields(fields.features)
      if (stats)  setApiStats(stats)
      if (dq)     setApiDQ(dq)
    })
  }, [apiBase, apiError])

  // ── Effective dates array from the API ──────────────────────────
  const effectiveDates = dates || []
  const currentDateLabel = effectiveDates[dateIndex] ?? ''

  // ── Farm composition & absolute vigor ─────────────────────────────
  let composition, yieldRisk, sortedZones, chartZone, chartData, selectedZoneFeature
  let farmMeanNdviNow = null
  let farmAbsoluteStatus = { label: 'Normal Growth', color: 'var(--emerald-400)' }

  if (apiFields && apiFields.length > 0) {
    const total = apiFields.length
    const tierCounts = { healthy: 0, medium: 0, high: 0 }
    apiFields.forEach(f => { tierCounts[f.properties.tier] = (tierCounts[f.properties.tier] || 0) + 1 })
    composition = {
      healthy:  Math.round(100 * (tierCounts.healthy || 0) / total),
      stressed: Math.round(100 * (tierCounts.medium  || 0) / total),
      critical: Math.round(100 * (tierCounts.high    || 0) / total),
    }
    yieldRisk = apiStats?.farm_shortfall_pct ?? 'n/a'

    // Compute absolute farm mean NDVI for current date across valid pixels
    const validCurrentNdvis = apiFields
      .map(f => f.properties?.ndvi_series?.[currentDateLabel])
      .filter(v => v != null && !isNaN(v))
    if (validCurrentNdvis.length > 0) {
      farmMeanNdviNow = validCurrentNdvis.reduce((a, b) => a + b, 0) / validCurrentNdvis.length
      if (farmMeanNdviNow >= 0.70) {
        farmAbsoluteStatus = { label: 'Vigorous Canopy (Healthy)', color: '#34d399' }
      } else if (farmMeanNdviNow >= 0.50) {
        farmAbsoluteStatus = { label: 'Moderate Canopy (Normal)', color: '#fbbf24' }
      } else {
        farmAbsoluteStatus = { label: 'Low Greenness / Sparse Canopy', color: '#fb7185' }
      }
    }

    selectedZoneFeature = apiFields.find(f => f.properties.id === selectedZone) ?? null

    // Sort by season_score desc (same as yield_risk.py output)
    sortedZones = [...apiFields]
      .sort((a, b) => (b.properties.season_score ?? 0) - (a.properties.season_score ?? 0))
      .map(f => ({
        id:        f.properties.id,
        name:      f.properties.name,
        severity:  { healthy: 'healthy', medium: 'warning', high: 'critical' }[f.properties.tier] ?? 'healthy',
        risk:      f.properties.season_score != null ? Math.round(f.properties.season_score) : 0,
        stressType: f.properties.stress_class ?? 'n/a',
        meanNdvi:  f.properties.mean_ndvi ?? 0,
        shortfall: f.properties.shortfall_pct ?? 0,
        lowConfidence: f.properties.low_confidence ?? false,
      }))
    // Chart: use selected zone's or first zone's ndvi_series
    const selZone = selectedZoneFeature ?? apiFields[0]
    const ndviDict = selZone?.properties?.ndvi_series ?? {}
    chartZone = { name: selZone?.properties?.name ?? 'Zone' }
    chartData = Object.entries(ndviDict)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ndvi]) => ({ date: date.slice(5), ndvi }))
  } else {
    composition = { healthy: 0, stressed: 0, critical: 0 }
    yieldRisk = 'n/a'
    sortedZones = []
    chartZone = { name: 'No data' }
    chartData = []
    selectedZoneFeature = null
  }

  // ── Data Quality ─────────────────────────────────────────────────
  const handleExport = () => {
    alert('📄 Report generation would be triggered here.\nIn production, this generates a PDF with the map, risk rankings, and rule-based advisories.')
  }

  return (
    <aside className="side-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-logo">
          <Wheat size={22} strokeWidth={2.5} />
          <span>FasalScan</span>
        </div>
        <span className="panel-badge" title="Pre-fetched Sentinel-2 scenes, Jan–Mar 2025 archive">Demo: Rabi 2024–25</span>
        <button
          onClick={() => setShowAbout(true)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px', display: 'flex', marginLeft: 'auto',
          }}
          title="About & Limitations"
          aria-label="About & Limitations"
        >
          <Info size={16} />
        </button>
        <button
          onClick={onLogout}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px', display: 'flex',
          }}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Date Slider */}
      <div className="panel-section">
        <div className="section-title">
          <Calendar size={14} /> Demo Season: Rabi 2024–25
        </div>
        <div className="date-slider-container">
          <div className="date-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📅 {currentDateLabel}</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', background: 'rgba(51,65,85,0.4)', padding: '2px 6px', borderRadius: '4px' }}>
              Historical archive
            </span>
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', margin: '0.35rem 0', fontStyle: 'italic', lineHeight: 1.3 }}>
            Note: Late-sown fields can rank as at-risk simply because they are behind in growth stage.
          </div>
          {currentDateLabel === '2025-01-31' && (
            <div style={{
              fontSize: '0.68rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '6px',
              padding: '6px 8px', marginBottom: '0.5rem', lineHeight: 1.35,
            }}>
              ⚠️ <strong>Atmospheric anomaly (2025-01-31):</strong> Dip to ~0.28 is widespread Punjab winter radiation fog / ground haze undetected by SCL cloud mask (0% cloud flag), not crop damage. Rebounds by Feb 5.
            </div>
          )}
          <div className="date-slider-wrapper">
            <button
              className="btn-play"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
              id="play-btn"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
            </button>
            <input
              type="range"
              className="date-slider"
              min={0}
              max={effectiveDates.length - 1}
              value={dateIndex}
              onChange={(e) => setDateIndex(parseInt(e.target.value))}
              id="date-slider"
            />
          </div>
          {effectiveDates.length > 1 && (
            <div className="date-slider-endpoints">
              <span>{effectiveDates[0]}</span>
              <span>{effectiveDates[effectiveDates.length - 1]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Quality Widget */}
      <div className="panel-section">
        <div className="section-title">
          <Database size={14} /> Data Quality
        </div>
        {!apiDQ ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Data quality unavailable.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Scenes used</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {apiDQ.scenes_used} / {apiDQ.scenes_found}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Cloud masked</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {apiDQ.overall_cloud_masked_pct ?? apiDQ.total_cloud_masked_pct}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Processing baseline</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {apiDQ.processing_baseline}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Reflectance correction</span>
              <span style={{ color: 'var(--emerald-400)', fontWeight: 600 }}>
                {apiDQ.baseline_offset_status ?? (
                  apiDQ.correction_method === 'odc-stac scale/offset'
                    ? 'Applied by loader'
                    : apiDQ.correction_method === 'manual DN scale/offset'
                      ? `Applied (baseline ${apiDQ.processing_baseline})`
                      : 'Not required'
                )}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {apiDQ.bands_resampled ?? apiDQ.bands_natively_20m?.join(', ')}
            </div>
            {(apiDQ.scenes_used < 4) && (
              <div style={{
                padding: '0.4rem 0.6rem', borderRadius: '6px',
                background: 'var(--amber-bg)', color: 'var(--amber-400)',
                fontSize: '0.75rem', marginTop: '0.25rem',
              }}>
                ⚠️ Only {apiDQ.scenes_used} clear dates available.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Farm Composition & Absolute Health */}
      <div className="panel-section">
        <div className="section-title" title="Zones split into relative tertiles (33% each) to prioritize field scouting.">
          <BarChart3 size={14} /> Zone Tier Distribution (Relative Tertiles)
        </div>
        <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)', marginBottom: '0.45rem', lineHeight: 1.35 }}>
          Relative 33% spatial tertiles for field scouting priority. (1/3 of zones always rank in highest tier regardless of absolute farm health).
        </div>
        <div className="composition-bar">
          <div className="composition-segment" style={{ width: `${composition.healthy}%`, background: 'var(--emerald-400)' }} />
          <div className="composition-segment" style={{ width: `${composition.stressed}%`, background: 'var(--amber-400)' }} />
          <div className="composition-segment" style={{ width: `${composition.critical}%`, background: 'var(--rose-400)' }} />
        </div>
        <div className="composition-labels">
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--emerald-400)' }} />
            Low Risk {composition.healthy}%
          </div>
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--amber-400)' }} />
            Medium Risk {composition.stressed}%
          </div>
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--rose-400)' }} />
            High Risk {composition.critical}%
          </div>
        </div>

        {/* Absolute Crop Vigor Reference */}
        <div style={{
          marginTop: '0.65rem', padding: '0.5rem 0.65rem', borderRadius: '6px',
          background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Absolute Canopy Reference</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: farmAbsoluteStatus.color }}>
              {farmAbsoluteStatus.label}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Scene Mean NDVI</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {farmMeanNdviNow != null ? farmMeanNdviNow.toFixed(2) : 'n/a'}
            </div>
          </div>
        </div>
      </div>

      {/* Risk Ranking */}
      <div className="panel-section">
        <div className="section-title" title="Ranks where to look first. It is relative, so some zones rank high even when the whole farm is healthy.">
          <AlertTriangle size={14} /> Relative Risk (vs top 10% of zones)
        </div>
        <div className="risk-list">
          {sortedZones.map((zone) => (
            <div
              key={zone.id}
              className={`risk-item ${selectedZone === zone.id ? 'active' : ''}`}
              onClick={() => onZoneSelect(zone.id)}
              id={`risk-item-${zone.id}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onZoneSelect(zone.id)}
              style={zone.lowConfidence ? { opacity: 0.5 } : {}}
            >
              <span className={`risk-dot ${zone.severity}`} />
              <div className="risk-info">
                <div className="risk-zone">
                  {zone.name}
                  {zone.lowConfidence && (
                    <span style={{
                      fontSize: '0.6rem', color: 'var(--amber-400)',
                      marginLeft: '0.4rem', fontWeight: 500,
                    }}>LOW CONF</span>
                  )}
                </div>
                <div className="risk-type">{zone.stressType}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span className={`risk-pct ${zone.severity}`}>
                  {zone.risk}%
                </span>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  NDVI {zone.meanNdvi.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yield-Risk Index Widget */}
      <div className="panel-section">
        <div className="section-title">
          <TrendingDown size={14} /> Yield-Risk Index
        </div>
        <div className="yield-widget">
          <div>
            <div className="yield-label">Projected peak-NDVI shortfall</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem', maxWidth: '190px' }}>
              {selectedZoneFeature
                ? `Basis: ${selectedZoneFeature.properties.name} shortfall`
                : 'Basis: Farm-wide average (9 zones)'}
            </div>
          </div>
          <div className="yield-value">
            {selectedZoneFeature && selectedZoneFeature.properties.shortfall_pct != null
              ? `${selectedZoneFeature.properties.shortfall_pct}%`
              : `${yieldRisk}%`
            }<span className="arrow">▼</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.4rem', borderTop: '1px solid rgba(51,65,85,0.3)', paddingTop: '0.35rem' }}>
          <span>Farm Average: <strong style={{ color: 'var(--text-primary)' }}>{yieldRisk}%</strong></span>
          <span>Peak Benchmark: <strong style={{ color: 'var(--emerald-400)' }}>{apiStats?.bench_peak ?? 0.71}</strong></span>
        </div>
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.35rem',
          fontStyle: 'italic', lineHeight: 1.4,
        }}>
          Projected peak-NDVI shortfall vs peak benchmark. Uncalibrated indicator (not a validated harvest yield forecast).
        </div>
      </div>

      {/* NDVI Trend Chart */}
      <div className="panel-section">
        <div className="section-title">
          <BarChart3 size={14} /> NDVI Trend — {chartZone.name}
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ndviGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    const isHaze = data.date === '01-31'
                    return (
                      <div style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(51,65,85,0.5)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#f1f5f9',
                        fontSize: 12,
                        backdropFilter: 'blur(12px)',
                      }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>2025-{data.date}</div>
                        <div style={{ fontWeight: 600, color: '#34d399', marginTop: 2 }}>
                          NDVI: {data.ndvi != null ? Number(data.ndvi).toFixed(3) : 'No data'}
                        </div>
                        {isHaze && (
                          <div style={{
                            color: '#fbbf24', fontSize: '0.65rem', marginTop: 4,
                            maxWidth: 190, lineHeight: 1.25, borderTop: '1px solid rgba(251,191,36,0.3)',
                            paddingTop: 3,
                          }}>
                            ⚠️ Probable winter radiation fog / thin haze in Punjab. SCL missed cloud mask.
                          </div>
                        )}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="linear"
                dataKey="ndvi"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#ndviGradient)"
                dot={(props) => {
                  const { cx, cy, payload } = props
                  if (cx == null || cy == null || payload.ndvi == null) return null
                  const isHaze = payload.date === '01-31'
                  return (
                    <circle
                      key={`dot-${payload.date}`}
                      cx={cx}
                      cy={cy}
                      r={isHaze ? 5 : 3.5}
                      fill={isHaze ? '#f59e0b' : '#10b981'}
                      stroke={isHaze ? '#fef08a' : '#0f172a'}
                      strokeWidth={isHaze ? 2 : 1}
                    />
                  )
                }}
                activeDot={{ r: 6, fill: '#34d399', strokeWidth: 2, stroke: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.4rem', fontStyle: 'italic', display: 'flex', justifyContent: 'space-between' }}>
          <span>Discrete satellite overpass dates (straight segments)</span>
          <span style={{ color: '#fbbf24' }}>● Jan 31: Fog/haze flag</span>
        </div>
      </div>

      {/* Layer Toggle */}
      <div className="panel-section">
        <div className="section-title">
          <Layers size={14} /> Layer Toggle
        </div>
        <div className="layer-grid">
          {Object.keys(LAYER_CONFIG).map((key) => (
            <button
              key={key}
              className={`layer-btn ${activeLayer === key ? 'active' : ''}`}
              onClick={() => setActiveLayer(key)}
              id={`layer-btn-${key}`}
            >
              {LAYER_CONFIG[key].name}
            </button>
          ))}
        </div>
      </div>

      {/* Export Report */}
      <div className="panel-section">
        <button className="btn-report" onClick={handleExport} id="export-btn">
          <FileText size={16} />
          Generate Report
        </button>
      </div>

      {/* About & Limitations Modal */}
      {showAbout && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={() => setShowAbout(false)}
        >
          <div
            className="glass-panel-strong"
            style={{
              maxWidth: 540, maxHeight: '80vh', overflow: 'auto',
              padding: '2rem', lineHeight: 1.7,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--emerald-400)' }}>
              <ShieldAlert size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
              About & Limitations
            </h2>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              What it does &amp; Scope
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              FasalScan visualises Sentinel-2 satellite vegetation indices (NDVI, NDRE, NDMI) over Ludhiana-area
              wheat management zones for the Rabi 2024–25 demo window (Jan–Mar 2025). It computes relative risk rankings
              and a projected peak-NDVI shortfall index to help prioritize field scouting.
            </p>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              Limitations &amp; Honesty Disclaimers
            </h3>
            <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li><strong>Relative ranking (tertiles):</strong> Risk tiers divide zones into 33% spatial tertiles for scouting priority. Even on a flourishing farm, 1/3 of zones always rank as "High Risk". Refer to the Absolute Canopy Reference (scene mean NDVI) for true crop condition.</li>
              <li><strong>Grid management zones:</strong> Boundaries are a 3×3 regional grid (~200m–1km), not cadastral or parcel-level field boundaries. Sharp edge colour steps reflect zone aggregate tiers; raster index layers use smooth global stretching (-0.1 to 0.9).</li>
              <li><strong>Atmospheric anomaly (2025-01-31):</strong> Apparent dip to ~0.28 is widespread Punjab winter radiation fog / thin haze undetected by ESA's SCL cloud mask (0% cloud flag), not crop failure. Rebounds to normal vigor by Feb 5.</li>
              <li><strong>Yield-Risk Index is not a yield forecast:</strong> It indicates projected peak-NDVI shortfall relative to the peak benchmark (0.71). Farm average is 9.95%, while individual zone shortfalls range from 0.0% to 20.07%. It requires local crop-cutting calibration.</li>
              <li><strong>Methodology &amp; ML stance:</strong> Current system uses transparent index mathematics (NDVI, NDRE, NDMI) with rule-based agronomic logic. Optional ML/deep-learning segmentation (such as a U-Net) is future work once ground-truth field labels exist; we do not claim unvalidated black-box AI.</li>
              <li><strong>Spectral limits:</strong> Optical indices cannot confirm disease; "non-water stress" indicates undetermined cause (nutrient, sowing date, soil, or disease) requiring field verification.</li>
              <li><strong>Native resolution:</strong> Bands B05, B8A, B11, and SCL are natively 20 m, resampled to 10 m.</li>
              <li><strong>Demo archive:</strong> Displays Sentinel-2 archive for Rabi 2024–25 (historical baseline, not live streaming in late 2026).</li>
              <li><strong>Mock authentication:</strong> Accepts any credentials for evaluator convenience.</li>
            </ul>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              Constants (design choices)
            </h3>
            <table style={{ fontSize: '0.73rem', color: 'var(--text-muted)', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Value</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Used for</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['0.70', 'NDVI healthy threshold', 'Design choice'],
                  ['0.50', 'NDVI stressed threshold', 'Design choice'],
                  ['0.35', 'NDVI critical threshold', 'Design choice'],
                  ['0.10', 'NDMI water-stress threshold', 'Design choice'],
                  ['90th %ile', 'Benchmark percentile', 'Design choice'],
                  ['Tertiles', 'Risk tier boundaries', 'Design choice'],
                ].map(([val, use, src], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace', color: 'var(--emerald-400)' }}>{val}</td>
                    <td style={{ padding: '0.3rem 0.5rem' }}>{use}</td>
                    <td style={{ padding: '0.3rem 0.5rem', fontStyle: 'italic' }}>{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={() => setShowAbout(false)}
              style={{
                marginTop: '1.5rem', padding: '0.5rem 1.5rem',
                background: 'var(--emerald-500)', color: 'var(--bg-primary)',
                border: 'none', borderRadius: '8px', fontWeight: 600,
                cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
