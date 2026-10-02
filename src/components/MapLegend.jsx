export default function MapLegend({ layerConfig }) {
  const isStress = layerConfig.isZoneLevel || layerConfig.name?.includes('Stress')
  const isTrueColor = layerConfig.isTrueColor || layerConfig.name?.toLowerCase().includes('true color')

  return (
    <div className="map-legend-wrapper">
      <div className="map-data-badge">
        <span className="map-badge-dot" />
        Sentinel-2 L2A · Rabi 2024–25
      </div>
      <div className="map-legend glass-panel">
        {isTrueColor ? (
          <div className="legend-index" style={{ minWidth: '150px' }}>
            <div className="legend-title">Optical View</div>
            <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '3px', fontWeight: 600 }}>
              True colour (B04/B03/B02)
            </div>
            <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '1px' }}>
              Natural RGB composite
            </div>
          </div>
        ) : isStress ? (
          <div className="legend-index" style={{ minWidth: '170px' }}>
            <div className="legend-title">Zone Stress Class</div>
            <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginBottom: '3px' }}>
              Polygon overlay (no raster)
            </div>
            <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
              <span style={{ flex: 1, height: '7px', background: '#f43f5e', borderRadius: '2px' }} title="High Risk" />
              <span style={{ flex: 1, height: '7px', background: '#fbbf24', borderRadius: '2px' }} title="Medium Risk" />
              <span style={{ flex: 1, height: '7px', background: '#10b981', borderRadius: '2px' }} title="Low Risk" />
            </div>
            <div className="legend-labels" style={{ marginTop: '2px' }}>
              <span style={{ color: '#fb7185' }}>High Risk</span>
              <span style={{ color: '#fbbf24' }}>Medium</span>
              <span style={{ color: '#34d399' }}>Low Risk</span>
            </div>
          </div>
        ) : (
          <div className="legend-index">
            <div className="legend-title">{layerConfig.name} Scale</div>
            <div
              className="legend-bar"
              style={{ background: layerConfig.gradient }}
            />
            <div className="legend-labels">
              <span>{layerConfig.legendMin}</span>
              <span>{layerConfig.legendMax}</span>
            </div>
          </div>
        )}
        <div style={{ width: '1px', height: '36px', background: 'rgba(51,65,85,0.4)', margin: '0 0.25rem' }} />
        <div className="legend-zones" aria-label="Zone tier colors">
          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', gridColumn: 'span 2', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Zone Risk Tiers
          </div>
          <span><i className="legend-swatch healthy" /> Low Risk</span>
          <span><i className="legend-swatch medium" /> Medium Risk</span>
          <span><i className="legend-swatch high" /> High Risk</span>
          <span><i className="legend-swatch noncrop" /> Non-crop</span>
        </div>
      </div>
    </div>
  )
}
