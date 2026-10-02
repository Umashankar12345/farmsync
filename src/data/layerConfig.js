// src/data/layerConfig.js
// Configuration and display properties for map visualization layers.

export const LAYER_CONFIG = {
  TrueColor: {
    name: 'True color',
    fullName: 'Sentinel-2 true-colour composite (B04/B03/B02)',
    legendMin: '',
    legendMax: '',
    gradient: 'none',
    isTrueColor: true,
  },
  NDVI: {
    name: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    legendMin: 'Low Vigor',
    legendMax: 'High Vigor',
    gradient: 'linear-gradient(90deg, #8c510a, #bf812d, #dfc27d, #ffffbf, #80cdc1, #35978f, #01665e)',
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
    name: 'Stress (Zonal)',
    fullName: 'Zonal Stress Classification (NDVI + NDMI)',
    legendMin: 'High risk (scout)',
    legendMax: 'Healthy canopy',
    gradient: 'linear-gradient(90deg, #f43f5e, #fbbf24, #10b981)',
    isZoneLevel: true,
  },
}
