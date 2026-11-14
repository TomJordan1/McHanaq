// McHanaq — GEE Daily Environmental & DEM Pipeline
// Exporta environmental_daily.csv (T_amb, HR Magnus-Tetens, T_suelo LST, Viento diario, DEM por época).

var TERRITORIES_ASSET = 'projects/mchanaq/assets/territories_peru'; // Ajustar al asset de Angelo
var START_DATE = '2024-01-01';
var END_DATE = '2025-01-01'; // Exclusivo
var LST_SOURCE = 'MODIS'; // 'MODIS' (MOD11A1) | 'VIIRS' (VNP21A1D)

var territories = ee.FeatureCollection(TERRITORIES_ASSET);
var yearStart = ee.Date(START_DATE).get('year');

// DEM por época: NASADEM (2000-2011) vs Copernicus GLO-30 (2012-2025)
var demImg = ee.Image(ee.Algorithms.If(
  yearStart.lt(2012),
  ee.Image('NASA/NASADEM_HGT/001').select('elevation').rename('elevation_m'),
  ee.ImageCollection('COPERNICUS/DEM/GLO30').mosaic().select('DEM').rename('elevation_m')
));
var demName = ee.Algorithms.If(yearStart.lt(2012), 'NASA_NASADEM_HGT_001', 'COPERNICUS_DEM_GLO30');

var terrWithDem = demImg.reduceRegions({
  collection: territories,
  reducer: ee.Reducer.mean(),
  scale: 30
}).map(function(f) {
  return f.set('elevation_m', f.get('mean')).set('dem_source', demName);
});

var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
  .filterDate(START_DATE, END_DATE)
  .filterBounds(territories);

var lstCol = LST_SOURCE === 'MODIS'
  ? ee.ImageCollection('MODIS/061/MOD11A1').filterDate(START_DATE, END_DATE).filterBounds(territories)
  : ee.ImageCollection('NASA/VIIRS/002/VNP21A1D').filterDate(START_DATE, END_DATE).filterBounds(territories);

var nDays = ee.Date(END_DATE).difference(ee.Date(START_DATE), 'day');
var dayOffsets = ee.List.sequence(0, nDays.subtract(1));

var dailyRows = ee.FeatureCollection(dayOffsets.map(function(offset) {
  var d0 = ee.Date(START_DATE).advance(offset, 'day');
  var d1 = d0.advance(1, 'day');
  var dateStr = d0.format('YYYY-MM-dd');

  // ERA5-Land diario: T_amb, HR (Magnus-Tetens) y componentes de viento u10, v10
  var eraDay = era5.filterDate(d0, d1).mean();
  var tAmbC = eraDay.select('temperature_2m').subtract(273.15).rename('t_amb_c');
  var tDewC = eraDay.select('dewpoint_temperature_2m').subtract(273.15).rename('t_dew_c');
  var rh = tDewC.expression(
    'min(100, max(0, 100 * exp((17.625 * Td) / (243.04 + Td)) / exp((17.625 * T) / (243.04 + T))))',
    { T: tAmbC, Td: tDewC }
  ).rename('relative_humidity_2m_pct');

  var u10 = eraDay.select('u_component_of_wind_10m').rename('u10');
  var v10 = eraDay.select('v_component_of_wind_10m').rename('v10');

  // LST diario con control de nubes (<30% nubes => lst_valid_pixel_pct >= 70%)
  var lstDayCol = lstCol.filterDate(d0, d1);
  var hasLst = lstDayCol.size().gt(0);
  var lstImg = ee.Image(ee.Algorithms.If(hasLst, lstDayCol.first(), ee.Image.constant([0, 1]).rename(['t_suelo_c', 'lst_valid'])));

  var lstEmpty = ee.Image.constant(0).updateMask(ee.Image.constant(0)).toFloat().rename('t_suelo_c')
    .addBands(ee.Image.constant(0).toFloat().rename('lst_valid'));

  var lstClean = ee.Image(ee.Algorithms.If(hasLst, (function() {
    if (LST_SOURCE === 'MODIS') {
      var qcOk = lstImg.select('QC_Day').bitwiseAnd(3).eq(0);
      var tSuelo = lstImg.select('LST_Day_1km').multiply(0.02).subtract(273.15).updateMask(qcOk).toFloat().rename('t_suelo_c');
      return ee.Image.cat([tSuelo, qcOk.unmask(0).toFloat().rename('lst_valid')]);
    } else {
      var qcOkV = lstImg.select('QC').bitwiseAnd(3).eq(0);
      var tSueloV = lstImg.select('LST_1KM').multiply(0.02).subtract(273.15).updateMask(qcOkV).toFloat().rename('t_suelo_c');
      return ee.Image.cat([tSueloV, qcOkV.unmask(0).toFloat().rename('lst_valid')]);
    }
  })(), lstEmpty));

  var combined = ee.Image.cat([tAmbC, rh, u10, v10, lstClean]);

  return combined.reduceRegions({
    collection: terrWithDem,
    reducer: ee.Reducer.mean(),
    scale: 1000
  }).map(function(f) {
    var u = ee.Number(f.get('u10'));
    var v = ee.Number(f.get('v10'));
    var windSpeed = u.hypot(v);
    var windDir = u.multiply(-1).atan2(v.multiply(-1)).multiply(180 / Math.PI).add(360).mod(360);
    var lstPct = ee.Number(f.get('lst_valid')).multiply(100);
    var tSueloFinal = ee.Algorithms.If(lstPct.gte(70), f.get('t_suelo_c'), null);

    return f.set({
      date: dateStr,
      t_suelo_c: tSueloFinal,
      lst_valid_pixel_pct: lstPct,
      wind_speed_10m_ms: windSpeed,
      wind_dir_deg: windDir
    });
  });
})).flatten();

Export.table.toDrive({
  collection: dailyRows,
  description: 'environmental_daily_' + START_DATE.slice(0, 4),
  folder: 'McHanaq_GEE',
  fileFormat: 'CSV',
  selectors: [
    'date', 'territory_type', 'territory_id',
    't_amb_c', 'relative_humidity_2m_pct',
    't_suelo_c', 'lst_valid_pixel_pct',
    'wind_dir_deg', 'wind_speed_10m_ms',
    'elevation_m', 'dem_source'
  ]
});
