import { useState, useEffect } from 'react'
import {
  Wheat, Play, Pause, Calendar, AlertTriangle, TrendingDown,
  Layers, BarChart3, FileText, LogOut, Info, Database, ShieldAlert
} from 'lucide-react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts'
import {
  DATES, LAYER_CONFIG, DATA_QUALITY,
  getZoneData, getNdviTimeline, getFarmComposition, getYieldRiskIndex
} from '../data/mockData'

export default function SidePanel({
  dateIndex, setDateIndex,
  activeLayer, setActiveLayer,
  selectedZone, onZoneSelect,
  isPlaying, togglePlay,
  onLogout,
  dates,      // real dates from /api/meta — falls back to mockData DATES
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
      fetch(`${apiBase}/api/fields`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/api/stats`).then(r  => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/api/data-quality`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([fields, stats, dq]) => {
      if (fields) setApiFields(fields.features)
      if (stats)  setApiStats(stats)
      if (dq)     setApiDQ(dq)
    })
  }, [apiBase, apiError])

  // ── Effective dates array (API > mockData) ──────────────────────
  const effectiveDates = (dates && dates.length > 0) ? dates : DATES
  const currentDateLabel = effectiveDates[dateIndex] ?? ''

  // ── Farm composition ────────────────────────────────────────────
  // Issue 4: when API data available, use tier field (same as map + risk list)
  let composition, yieldRisk, sortedZones, chartZone, chartData

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
        lowConfidence: f.properties.low_confidence ?? false,
      }))
    // Chart: use first zone's ndvi_series
    const selZone = apiFields.find(f => f.properties.id === selectedZone) ?? apiFields[0]
    const ndviDict = selZone?.properties?.ndvi_series ?? {}
    chartZone = { name: selZone?.properties?.name ?? 'Zone' }
    chartData = Object.entries(ndviDict)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ndvi]) => ({ date: date.slice(5), ndvi }))
  } else {
    // Fallback to mockData
    composition = getFarmComposition(dateIndex)
    yieldRisk   = getYieldRiskIndex(dateIndex)
    const zones = getZoneData(dateIndex)
    sortedZones = [...zones].sort((a, b) => b.risk - a.risk)
    chartZone   = zones.find(z => z.id === selectedZone) || zones[2]
    chartData   = getNdviTimeline(chartZone.name)
  }

  // ── Data Quality ─────────────────────────────────────────────────
  const dqDisplay = apiDQ ?? DATA_QUALITY
  const dqIsReal  = !!apiDQ

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
        <span className="panel-badge" title="Pre-fetched Sentinel-2 scenes, Jan–May 2025">Sentinel-2 Demo</span>
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
          <Calendar size={14} /> Temporal Navigation
        </div>
        <div className="date-slider-container">
          <div className="date-label">
            <span>📅</span> {currentDateLabel}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
            Note: Late-sown fields can rank as at-risk simply because they are behind in growth stage.
          </div>
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
        </div>
      </div>

      {/* Data Quality Widget */}
      <div className="panel-section">
        <div className="section-title">
          <Database size={14} /> Data Quality
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
          {!dqIsReal && (
            <div style={{ fontSize: '0.7rem', color: 'var(--amber-400)', marginBottom: '0.25rem' }}>
              ⚠️ Simulated — run pipeline for real values
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Scenes used</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {dqDisplay.scenes_used} / {dqDisplay.scenes_found}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Cloud masked</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {dqDisplay.overall_cloud_masked_pct ?? dqDisplay.total_cloud_masked_pct}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Processing baseline</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {dqDisplay.processing_baseline}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Scale/offset applied</span>
            <span style={{ color: dqDisplay.offset_applied ? 'var(--emerald-400)' : 'var(--rose-400)', fontWeight: 600 }}>
              {dqDisplay.offset_applied ? 'Yes' : 'No'}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {dqDisplay.bands_resampled ?? dqDisplay.bands_natively_20m?.join(', ')}
          </div>
          {(dqDisplay.scenes_used < 4) && (
            <div style={{
              padding: '0.4rem 0.6rem', borderRadius: '6px',
              background: 'var(--amber-bg)', color: 'var(--amber-400)',
              fontSize: '0.75rem', marginTop: '0.25rem',
            }}>
              ⚠️ Only {dqDisplay.scenes_used} clear dates available.
            </div>
          )}
        </div>
      </div>

      {/* Farm Composition */}
      <div className="panel-section">
        <div className="section-title">
          <BarChart3 size={14} /> Farm Composition
        </div>
        <div className="composition-bar">
          <div className="composition-segment" style={{ width: `${composition.healthy}%`, background: 'var(--emerald-400)' }} />
          <div className="composition-segment" style={{ width: `${composition.stressed}%`, background: 'var(--amber-400)' }} />
          <div className="composition-segment" style={{ width: `${composition.critical}%`, background: 'var(--rose-400)' }} />
        </div>
        <div className="composition-labels">
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--emerald-400)' }} />
            Healthy {composition.healthy}%
          </div>
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--amber-400)' }} />
            Stressed {composition.stressed}%
          </div>
          <div className="composition-label">
            <span className="composition-dot" style={{ background: 'var(--rose-400)' }} />
            Critical {composition.critical}%
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
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem', maxWidth: '180px' }}>
              Farm-level mean across zones
            </div>
          </div>
          <div className="yield-value">
            {yieldRisk}%<span className="arrow">▼</span>
          </div>
        </div>
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.5rem',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          Relative estimate from satellite greenness. Not a validated yield forecast.
          Would need local crop-cutting data to calibrate.
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
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(51,65,85,0.5)',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  fontSize: 12,
                  backdropFilter: 'blur(12px)',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area
                type="monotone"
                dataKey="ndvi"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#ndviGradient)"
                dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#34d399', strokeWidth: 2, stroke: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
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
              What it does
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              FasalScan visualises Sentinel-2 satellite vegetation indices (NDVI, NDRE, NDMI) over Ludhiana-area
              wheat management zones for Jan–May 2025. It computes a relative risk ranking and a projected
              peak-NDVI shortfall index to help prioritise field scouting.
            </p>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              Limitations
            </h3>
            <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '1.2rem' }}>
              <li>Risk is relative to the top 10% of zones, so some zones always rank high — even when the whole farm is healthy.</li>
              <li>Management zones are a 200 m grid, not real field boundaries.</li>
              <li>Optical indices cannot confirm disease — "non-water stress" means the cause is undetermined.</li>
              <li>Yield-Risk Index is a projected peak-NDVI shortfall, not a validated yield forecast. Would need crop-cutting data to calibrate.</li>
              <li>Bands B05, B8A, B11 and SCL are natively 20 m, resampled to 10 m.</li>
              <li>Late-sown fields can rank as at-risk simply because they are behind in growth stage.</li>
              <li>Login is mocked — no real authentication.</li>
              <li>All advisories are rule-based, not AI-generated.</li>
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
