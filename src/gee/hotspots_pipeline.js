// McHanaq — GEE Daily Hotspots Pipeline (MODIS Terra/Aqua + VIIRS S-NPP)
// Exporta daily_activity.csv por bloques de 1-2 años para evitar timeouts en GEE.

var TERRITORIES_ASSET = 'projects/mchanaq/assets/territories_peru'; // Ajustar al asset de Angelo
var SENSOR = 'MODIS_TERRA'; // 'MODIS_TERRA' | 'MODIS_AQUA' | 'VIIRS_SNPP'
var START_DATE = '2024-01-01';
var END_DATE = '2025-01-01'; // Exclusivo
var PROCESSING_VERSION = '0.1.0';

var SENSOR_CFG = {
  MODIS_TERRA: { col: 'MODIS/061/MOD14A1', scale: 1000, prod: 'MOD14A1_061' },
  MODIS_AQUA:  { col: 'MODIS/061/MYD14A1', scale: 1000, prod: 'MYD14A1_061' },
  VIIRS_SNPP:  { col: 'NASA/VIIRS/002/VNP14A1', scale: 1000, prod: 'VNP14A1_002' }
};

var cfg = SENSOR_CFG[SENSOR];
var territories = ee.FeatureCollection(TERRITORIES_ASSET);

// Máscara terrestre fija de referencia para expected_land_pixels_per_day
var refLand = ee.ImageCollection(cfg.col).first().select('QA').bitwiseAnd(3).eq(2);
var expectedByTerr = refLand.rename('expected_land_pixels_per_day').reduceRegions({
  collection: territories,
  reducer: ee.Reducer.sum(),
  scale: cfg.scale
});

var col = ee.ImageCollection(cfg.col)
  .filterDate(START_DATE, END_DATE)
  .filterBounds(territories);

var dailyFeatures = col.map(function(img) {
  var dateStr = img.date().format('YYYY-MM-dd');
  var fm = img.select('FireMask').bitwiseAnd(15);
  var isLand = img.select('QA').bitwiseAnd(3).eq(2);

  var validLand = isLand.and(fm.eq(5).or(fm.gte(7).and(fm.lte(9)))).rename('valid_land_pixels');
  var fireLow = isLand.and(fm.eq(7)).rename('fire_pixels_low');
  var fireNomHigh = isLand.and(fm.gte(8).and(fm.lte(9))).rename('fire_pixels_nominal_high');

  var stacked = ee.Image.cat([fireLow, fireNomHigh, validLand]);

  return stacked.reduceRegions({
    collection: expectedByTerr,
    reducer: ee.Reducer.sum(),
    scale: cfg.scale
  }).map(function(f) {
    var valid = ee.Number(f.get('valid_land_pixels'));
    var expected = ee.Number(f.get('expected_land_pixels_per_day'));
    var cov = ee.Algorithms.If(expected.gt(0), valid.divide(expected), null);
    return f.set({
      date: dateStr,
      sensor: SENSOR,
      observation_coverage: cov,
      cloud_ok_lt30pct: ee.Algorithms.If(cov, ee.Number(cov).gte(0.70), false),
      source_product: cfg.prod,
      processing_version: PROCESSING_VERSION
    });
  });
}).flatten();

Export.table.toDrive({
  collection: dailyFeatures,
  description: 'daily_activity_' + SENSOR + '_' + START_DATE.slice(0, 4),
  folder: 'McHanaq_GEE',
  fileFormat: 'CSV',
  selectors: [
    'date', 'territory_type', 'territory_id', 'sensor',
    'fire_pixels_low', 'fire_pixels_nominal_high',
    'valid_land_pixels', 'expected_land_pixels_per_day', 'observation_coverage',
    'cloud_ok_lt30pct', 'source_product', 'processing_version'
  ]
});
