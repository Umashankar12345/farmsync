// src/data/layerConfig.js
// Configuration and display properties for map visualization layers.

export const LAYER_CONFIG = {
  TrueColor: {
    name: 'True color',
    fullName: 'Sentinel-2 true-color composite',
    legendMin: 'Natural colour',
    legendMax: 'Natural colour',
    gradient: 'linear-gradient(90deg, #374151, #84cc16, #38bdf8, #f59e0b)',
  },
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
    // (B8A − B11) / (B8A + B11). Resolution-matched NIR+SWIR moisture index
    fullName: 'Normalized Difference Moisture Index (Gao 1996, 20m matched)',
    legendMin: 'Dry / Low Moisture',
    legendMax: 'Well-Watered',
    gradient: 'linear-gradient(90deg, #fb7185, #f97316, #fbbf24, #60a5fa, #3b82f6)',
  },
  Stress: {
    name: 'Stress',
    fullName: 'Rule-based zone stress class',
    legendMin: 'High risk',
    legendMax: 'Healthy',
    gradient: 'linear-gradient(90deg, #fb7185, #fbbf24, #10b981)',
  },
}
