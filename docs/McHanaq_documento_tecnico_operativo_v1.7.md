# McHanaq — Documento técnico y operativo consolidado

**NASA Space Apps Challenge 2026**  
**Reto:** *Harmonization of MODIS and VIIRS Hot Spots*  
**Equipo:** Los McLovin  
**Hackathon presencial:** 14–15 de noviembre de 2026  
**Versión:** 1.7 — árbol de decisión de susceptibilidad contextual a la expansión del fuego y (14 de noviembre de 2026)

---

## 1. Resumen ejecutivo

McHanaq es una aplicación web para construir un **calendario histórico de actividad térmica a partir de MODIS y VIIRS**, compararlo entre sensores y consultar patrones estacionales, anomalías y períodos críticos en provincias y unidades hidrográficas del Perú.

Su producto principal es el calendario armonizado: aplica criterios explícitos de calidad, cobertura de observación, período y agregación territorial; conserva la trazabilidad de cada sensor y permite observar cuándo sus señales coinciden o discrepan. Como segunda capa de interpretación, añade un **árbol de decisión de reglas transparentes** que combina vegetación potencialmente combustible, sequedad (precipitación, humedad del suelo, NDVI), viento, temperatura y humedad relativa, topografía, presencia de agua y el antecedente térmico MODIS/VIIRS para describir qué provincias y unidades hidrográficas presentan, en cada mes, mayor **susceptibilidad contextual a una expansión del fuego en caso de que ocurra una ignición**.

McHanaq **no predice dónde se iniciará un incendio, no estima la probabilidad de ignición y no simula la propagación de un frente de fuego**. Los hotspots son detecciones de anomalías térmicas, no perímetros de incendio. La clasificación de susceptibilidad es un índice cualitativo y descriptivo basado en reglas, no un modelo de propagación ni una predicción validada; se presenta como contexto para priorizar el monitoreo, no como alerta operativa.

### Decisiones de diseño ya establecidas

| Dimensión | Decisión |
|---|---|
| Propósito | Prioridad 1: calendario histórico armonizado de actividad térmica, patrones, anomalías y períodos críticos. Prioridad 2: susceptibilidad contextual a la expansión del fuego en caso de ignición, mediante un árbol de decisión sobre variables ambientales y geográficas. |
| Escala espacial | Provincias y unidades hidrográficas/cuencas. |
| Modelo analítico | Árbol de decisión de reglas transparentes e interpretables; no es un modelo entrenado con ML ni un modelo de propagación. Entradas: vegetación combustible, sequedad, viento, temperatura/humedad relativa, pendiente, agua y antecedente térmico MODIS/VIIRS. Salida: categoría de susceptibilidad con su ruta de decisión explicada. |
| Datos de actividad térmica | MODIS Terra, MODIS Aqua y VIIRS S-NPP en productos diarios de 1 km como núcleo histórico. |
| Papel del chatbot | Complementario. Explica resultados ya calculados; no genera estadísticas ni predicciones. |
| Procesamiento | Google Earth Engine (GEE) para el procesamiento geoespacial y exportaciones estructuradas para la aplicación. |

### Cómo se conectan las partes (en sencillo)

McHanaq tendrá una sola ruta de datos. **Angelo lidera el procesamiento geoespacial en GEE; Tom calcula los indicadores y aplica el árbol de decisión; Jhan construye la API y conecta los módulos; Sebastian desarrolla la interfaz; Jean Pierrer prepara referencias territoriales, fixtures, pruebas de aceptación y la presentación.** La presentación se construye desde T0, pero las cifras se agregan únicamente cuando los responsables técnicos las verifican.

### Cómo usar esta guía

- **Todos:** lean las secciones 1–3, 8 y 11. Ahí están las decisiones, el alcance y las reglas de integración.
- **Angelo y Tom:** prioricen las secciones 5–7 y el contrato de archivos de la sección 8.4.
- **Jhan y Sebastian:** prioricen las secciones 8.5–8.7 y el contrato de API.
- **Jean Pierrer:** use las secciones 4, 8.3–8.5, 10–15 y 19–20 para fuentes, QA, presentación, rúbrica y entrega.

Las etiquetas **MVP obligatorio**, **solo si hay tiempo** y **fuera del alcance** indican qué debe tener prioridad durante las 48 horas. Si una fuente no está disponible o no puede procesarse dentro del tiempo, se documenta y se utiliza la alternativa prevista; no se simula que el dato existe.

```text
Satélites y fuentes ambientales
            │
            ▼
     GEE — Angelo
  extrae, filtra y agrega
            │
            ▼
     Tablas normalizadas
            │
            ▼
  Analítica — Tom (Python)
 métricas mensuales, anomalías y árbol
            │
            ▼
  Resultados precomputados JSON/CSV
            │
            ▼
    API — Jhan (FastAPI)
 valida, filtra y entrega resultados
            │
            ▼
 Interfaz — Sebastian (React)
 mapa, calendario y fichas

Referencias territoriales, contratos, QA de producto y presentación — Jean Pierrer
```

Esta separación es deliberada: el navegador **no se conecta directamente a GEE**, el frontend **no calcula indicadores**, y el backend **no vuelve a implementar las fórmulas analíticas**. Cada módulo entrega datos en un formato acordado.

---

## 2. Problema y oportunidad

La detección de focos térmicos permite identificar ubicaciones y fechas en las que los satélites registraron anomalías compatibles con actividad de fuego. Sin embargo, consultar únicamente puntos o conteos de hotspots no responde por sí solo preguntas relevantes para el monitoreo territorial:

- ¿La actividad observada en una provincia o cuenca es inusual para esa época del año?
- ¿Se trata de detecciones aisladas o de actividad que se repite durante varios días?
- ¿Qué tan completa fue la observación satelital durante el período analizado?
- ¿En qué coinciden o discrepan MODIS Terra, MODIS Aqua y VIIRS?
- ¿Qué condiciones de vegetación, sequedad, meteorología y topografía presenta el territorio?
- ¿Qué datos sustentan la interpretación y cuáles son sus limitaciones?

El reto oficial pide construir una aplicación web que armonice registros MODIS y VIIRS en un calendario de actividad de fuego, para que usuarios puedan examinar patrones históricos, condiciones inusuales y períodos críticos dentro de un área de interés. Por eso, el calendario y la comparación multisensor son el centro del producto; el análisis ambiental es una capa complementaria que ayuda a interpretar el territorio, pero no debe desplazar el objetivo del reto.

McHanaq no debe competir con NASA FIRMS como otro visor de focos activos. FIRMS ya ofrece visualización, datos cercanos al tiempo real y descarga de archivos históricos. El valor que debemos demostrar es transformar observaciones heterogéneas en una lectura territorial y temporal más interpretable: tasas normalizadas por observaciones válidas, calendario estacional, anomalías por sensor, cobertura explícita y concordancias/discrepancias entre sensores. No afirmaremos que estas funciones son inéditas en todo el ecosistema; mostraremos con precisión qué flujo y qué experiencia aporta McHanaq.

### 2.1. Pregunta central

**¿Cómo se distribuye la actividad térmica a lo largo del tiempo en una provincia o cuenca, qué tan inusual es respecto de su historial y en qué coinciden o discrepan MODIS y VIIRS? Como capa interpretativa, ¿qué tan susceptible es ese territorio, según su vegetación, sequedad, viento, relieve y agua, a una mayor expansión del fuego en caso de ignición?**

### 2.2. Objetivo general

Desarrollar una aplicación web que convierta observaciones históricas MODIS y VIIRS en un calendario territorial de actividad térmica, con indicadores comparables, anomalías, cobertura de observación y trazabilidad por sensor; complementarlo con una clasificación interpretable, basada en un árbol de decisión de reglas, de la susceptibilidad contextual a la expansión del fuego.

### 2.3. Objetivos específicos

1. Integrar productos diarios MODIS Terra, MODIS Aqua y VIIRS S-NPP, preservando la identidad y calidad de cada sensor.
2. Calcular indicadores de actividad térmica, persistencia, cobertura de observación y anomalía histórica por unidad territorial.
3. Complementar la actividad térmica con indicadores de cobertura vegetal, sequedad (precipitación, humedad del suelo, NDVI), meteorología (viento, temperatura, humedad relativa), topografía y presencia de agua.
4. Implementar un árbol de decisión de reglas transparentes que clasifique la susceptibilidad contextual a la expansión del fuego, explique la ruta de decisión y los datos faltantes, y no se presente como predicción de propagación.
5. Ofrecer mapas, calendarios y fichas territoriales para consultar y comparar provincias y unidades hidrográficas.
6. Incorporar, si el tiempo lo permite, un asistente conversacional limitado a la interpretación de resultados preprocesados.

---

## 3. Alcance del MVP

El alcance debe ser demostrable durante las 48 horas del hackathon. La prioridad es que el recorrido completo funcione sobre datos reales en un área piloto acotada, no que exista una cobertura nacional exhaustiva con todos los indicadores.

**Orden de prioridad para responder al reto:** (1) calendario de actividad térmica con datos NASA MODIS y VIIRS; (2) comparación multisensor con calidad y cobertura visibles; (3) patrones y anomalías históricas; (4) árbol de susceptibilidad contextual con insumos ambientales simplificados. Si el equipo debe recortar, se reduce la profundidad del contexto ambiental antes de recortar la armonización y el calendario.

### 3.1. Funcionalidades esenciales

| Módulo | Resultado mínimo verificable |
|---|---|
| Selección territorial | Consulta de provincias y unidades hidrográficas del área piloto. |
| Mapa de actividad térmica | Coropleta por provincia/unidad hidrográfica y período, con consulta individual por sensor y una vista comparativa multisensor. Los puntos de hotspots son una capa opcional. |
| Calendario armonizado | Serie diaria y resumen mensual que conserva los resultados por sensor y permite comparar señales para un mismo territorio y período. No suma conteos brutos. |
| Indicadores históricos | Tasa de actividad normalizada, días activos, persistencia, anomalía estacional y cobertura, cuando exista línea base suficiente. |
| Comparación multisensor | Vista lado a lado de tasas/anomalías por sensor y estado de concordancia: actividad elevada coincidente, actividad no elevada coincidente, discrepante, fuente única o información insuficiente. |
| Calidad de observación | Distinción entre no detección, nube, píxel no clasificado y ausencia de datos; porcentaje de cobertura válida. |
| Contexto territorial | Cobertura vegetal (MapBiomas), un indicador de sequedad o humedad, al menos una variable meteorológica (viento y/o temperatura con humedad relativa) y pendiente como modificador. Si falta un bloque esencial, la clasificación será parcial o «No evaluable». |
| Árbol de susceptibilidad | Clasificación de susceptibilidad contextual a la expansión (alta, moderada, baja) con ruta de decisión, factores y modificadores activados y datos faltantes. |
| Ficha territorial | Resumen separado de actividad térmica histórica y condiciones territoriales. |

### 3.2. Ampliaciones deseables, no bloqueantes

- Capa de puntos de hotspots sobre el mapa, si el volumen y la exportación lo permiten. La vista principal seguirá siendo la coropleta territorial.
- Contraste retrospectivo con MapBiomas Fuego, Colección 2 (1990–2025), o con el Monitor del Fuego (2025–2026), sujeto a comprobar el acceso a sus datos.
- Chatbot contextual que explique los datos de la provincia/unidad hidrográfica y el mes seleccionado.
- Exportación CSV/GeoJSON y vistas de detalle adicionales.

### 3.3. Fuera del alcance del MVP

- Predicción de ocurrencia o ignición de incendios.
- Simulación del frente de fuego, velocidad o dirección de propagación.
- Predicción de superficie futura quemada.
- Árbol de decisión entrenado mediante machine learning.
- Clasificación de exposición o vulnerabilidad de población e infraestructura.
- Estimación de probabilidad de propagación o validación estadística de la categoría de susceptibilidad contra expansión observada.
- Fusión indiscriminada de detecciones de 375 m y 1 km como si fueran observaciones equivalentes.
- Calibración científica completa entre sensores o afirmaciones de equivalencia radiométrica que no hayan sido demostradas.

**Regla de comunicación:** usar expresiones como «susceptibilidad contextual a la expansión», «condiciones relativamente favorables a la propagación» o «factores asociados a la propagación». Evitar «el incendio avanzará», «probabilidad de incendio», «riesgo de incendio previsto» o «dirección probable del fuego».

---

## 4. Antecedentes y diferenciación

McHanaq se apoya en productos y sistemas que resuelven partes del problema:

| Antecedente | Qué aporta | Oportunidad complementaria para McHanaq |
|---|---|---|
| NASA FIRMS | Visualización y descarga de detecciones de incendios activos/anomalías térmicas de distintos sensores. | Añadir análisis histórico estacional por territorio, indicadores de cobertura y contexto ambiental. |
| MapBiomas Perú — Cobertura y Uso del Suelo | Mapas anuales de cobertura y uso del suelo, Colección 4, 30 m, 1985–2025. | Resumir la cobertura vegetal de provincias/cuencas y relacionarla con la actividad térmica. |
| MapBiomas Fuego, Colección 2 | Mapas anuales de áreas quemadas de 1990–2025, publicados el 10 de noviembre de 2026; producto basado en Landsat de 30 m. | Contrastar retrospectivamente patrones de hotspots con cicatrices cartografiadas. Verificar el acceso a los archivos/toolkit antes de incluirlo en el MVP. |
| Monitor del Fuego de MapBiomas | Monitoreo mensual de áreas quemadas recientes durante 2025–2026. La cobertura mensual exacta disponible debe comprobarse en la plataforma al momento de usarlo. | Aportar referencia reciente cuando el mes y área piloto estén cubiertos. |
| ERA5-Land / MODIS Vegetation / SRTM | Variables de contexto meteorológico, vegetación y topografía. | Construir una ficha territorial que conecte detecciones con condiciones ambientales. |

La diferenciación de McHanaq debe plantearse como **integración e interpretación conjunta**, no como afirmación de que ningún otro sistema ofrece mapas, tendencias o estadísticas.

---

## 5. Fuentes de datos y selección de productos

### 5.1. Núcleo de actividad térmica

| Sensor | Producto GEE | Resolución del producto | Disponibilidad histórica aproximada | Uso |
|---|---|---:|---|---|
| MODIS Terra | `MODIS/061/MOD14A1` | 1 km | Desde febrero de 2000 | Serie histórica principal. |
| MODIS Aqua | `MODIS/061/MYD14A1` | 1 km | Desde julio de 2002 | Complemento temporal y comparación con Terra. |
| VIIRS S-NPP | `NASA/VIIRS/002/VNP14A1` | 1 km | Desde enero de 2012 | Comparación multisensor en el período de solapamiento. |

**Precisión sobre VIIRS:** VNP14A1 es un producto diario de 1 km derivado de detecciones realizadas con bandas VIIRS de 750 m. No es el producto de 375 m. El producto VIIRS de 375 m puede considerarse una ampliación futura para mayor detalle espacial, pero no se mezclará directamente con la serie núcleo de 1 km.

### 5.2. Contexto ambiental y territorial

| Dimensión | Fuente candidata | Resolución/temporalidad | Uso y limitación |
|---|---|---|---|
| Cobertura y uso del suelo | MapBiomas Perú, Colección 4 | 30 m; anual, 1985–2025 | Fuente preferida para proporción y distribución de clases. Usar el mapa del año más próximo disponible que no sea posterior al período analizado; para 2026, la última referencia anual publicada es 2025. La clase de cobertura no mide directamente inflamabilidad ni humedad del combustible. |
| Estado de vegetación | MODIS `MODIS/061/MOD13A3` (preferido para el MVP) | 1 km; mensual | NDVI/EVI alineados con el período mensual. Aplicar `DetailedQA` y factor de escala 0.0001. NDVI bajo no equivale automáticamente a vegetación seca. `MOD13Q1` (250 m; 16 días) queda como alternativa si se necesita más detalle espacial y se documenta cómo se asignan sus compuestos al mes. |
| Temperatura del suelo (LST) | MODIS `MODIS/061/MOD11A1` / `MYD11A1` y VIIRS `NASA/VIIRS/002/VNP21A1D` / `VNP21A1N` | 1 km; diario | Temperatura superficial del suelo (`t_suelo_c` en °C) extraída directamente de MODIS y VIIRS, filtrada por banda `QC`. |
| Meteorología, temperatura ambiente y humedad del suelo | ERA5-Land Hourly `ECMWF/ERA5_LAND/HOURLY` | Aproximadamente 11.1 km; horario (agregado diario) | Viento a 10 m (`u10`, `v10` para velocidad y dirección diaria `wind_dir_deg`), temperatura ambiente a 2 m (`t_amb_c`), punto de rocío, precipitación y humedad del suelo. Es reanálisis, no medición local a 1 km. |
| Topografía (DEM por época) | SRTM `USGS/SRTMGL1_003` / NASADEM `NASA/NASADEM_HGT/001` (MODIS 2000–2011) y Copernicus DEM `COPERNICUS/DEM/GLO30` (VIIRS 2012–presente) | Aproximadamente 30 m | Altura (`elevation_m`, `dem_source`) según época del sensor, más derivación de pendiente y orientación; la pendiente es factor contextual, no predictor autónomo. |
| Áreas quemadas | MapBiomas Fuego, Colección 2 | 30 m; anual, 1990–2025 | Referencia reciente para revisión retrospectiva. La colección se lanzó el 10/11/2026; comprobar el acceso y la versión descargable. |
| Límites provinciales | INEI / IDE | Capa vectorial; revisar metadatos y versión | Unidad administrativa para agregación y comunicación. |
| Unidades hidrográficas | ANA / GeoIDEP, metodología Pfafstetter | Capa vectorial jerárquica | Unidad hidrográfica. Debe elegirse un solo nivel para comparaciones entre cuencas. |
| Áreas quemadas | MapBiomas Fuego, Colección 2; alternativamente MODIS MCD64A1 | MapBiomas C2: anual, 30 m, 1990–2025; MCD64A1: mensual, 500 m | Referencia retrospectiva; no equivale a hotspot ni valida por sí sola cada detección. El Monitor del Fuego aporta productos mensuales recientes 2025–2026, sujetos a disponibilidad. |

### 5.3. Criterios para elegir las fuentes en el hackathon

1. Priorizar colecciones accesibles y procesables desde GEE.
2. Verificar disponibilidad real para el área y período piloto antes de comprometer una variable.
3. Registrar resolución espacial, frecuencia temporal, unidades, versión y fecha de actualización.
4. No interpretar NDVI como humedad del combustible ni humedad del suelo como humedad de hojas o material vegetal muerto.
5. Si no existe tiempo para integrar todas las variables, priorizar MapBiomas (cobertura), ERA5-Land (viento más precipitación o humedad superficial del suelo) y SRTM (pendiente). MOD13A3 puede añadirse si se implementan su control de calidad y factor de escala; MOD13Q1 queda como alternativa de mayor detalle, no como requisito.
6. No mezclar fechas no coincidentes: el contexto ambiental debe representar el mismo mes de actividad térmica. Consultar la disponibilidad real de cada colección y calcular un período común. No usar ERA5-Land para clasificar un mes que aún no está publicado.
7. Registrar los rangos temporales disponibles por colección en `metadata.json`; la fecha final de análisis será la última fecha/mes completo que compartan las fuentes esenciales elegidas.

---

## 6. Escala espacial y temporal

### 6.1. Unidades territoriales

McHanaq ofrecerá dos formas de consulta sobre una misma base de indicadores:

- **Vista provincial:** límites político-administrativos del INEI, útiles para comunicación y gestión territorial.
- **Vista hidrográfica:** unidades delimitadas por divisorias de agua y codificadas mediante Pfafstetter, útiles para examinar unidades ambientales que no siguen necesariamente los límites administrativos.

Las provincias y unidades hidrográficas deben permanecer en grupos de comparación separados. Un polígono provincial puede intersectar varias cuencas; por tanto, no deben sumarse ni compararse como si fueran unidades mutuamente excluyentes.

### 6.2. Nivel de cuenca

La ANA organiza las unidades hidrográficas jerárquicamente mediante Pfafstetter. El equipo debe seleccionar un nivel uniforme después de inspeccionar el área piloto y el número/tamaño de polígonos. No se deben mezclar cuencas principales y subcuencas de distintos niveles en un mismo ranking.

### 6.3. Área piloto

La selección exacta del área piloto y el nivel Pfafstetter siguen siendo decisiones operativas pendientes. Para el hackathon:

- Elegir una sola región piloto acotada durante la primera hora.
- Cargar tanto sus límites provinciales como las unidades hidrográficas disponibles.
- Evitar lanzar desde el inicio un procesamiento nacional de todas las capas y todos los años.
- Preferir una zona para la que el equipo pueda revisar visualmente ejemplos y contrastar resultados.

### 6.4. Períodos

Se manejarán dos horizontes:

- **Serie histórica MODIS:** Terra desde 2000 y Aqua desde 2002, según disponibilidad válida de producto.
- **Comparación multisensor:** desde 2012, cuando comienza el producto VIIRS S-NPP VNP14A1.

Las anomalías se calcularán para ventanas temporales equivalentes. Para simplificar y evitar combinaciones difíciles de reproducir durante el hackathon, el MVP utilizará **meses calendario completos**: septiembre de un año se compara con septiembre de años anteriores, no con meses completos diferentes ni con una ventana parcial.

**Corte temporal común:** cada colección tiene su propio retraso. Al 13/11/2026, el catálogo consultado mostraba estos finales aproximados:

| Fuente | Último registro que mostraba el catálogo consultado el 13/11/2026 |
|---|---|
| MOD14A1 / MYD14A1 | 08/11/2026 |
| VNP14A1 | 11/10/2026 |
| MOD13A3 | 01/10/2026 (confirmar a qué mes corresponde el compuesto disponible) |
| ERA5-Land Hourly | 07/11/2026 |

Estas fechas son una fotografía del catálogo y pueden cambiar o variar entre colecciones. **Septiembre de 2026 es el primer mes candidato para la demo con actividad multisensor y contexto ambiental**, sujeto a que Angelo confirme en GEE que los datos de todo el mes están efectivamente disponibles para el área piloto. Si una colección esencial presenta huecos o no cubre todo el mes, retroceder a agosto de 2026. No seleccionar el mes por la fecha más reciente de una sola fuente: se necesita un mes completo común. Para variables mensuales, comprobar también el período que representa cada imagen y no asumir que su `system:time_start` describe por sí solo toda la ventana.

---

## 7. Metodología de procesamiento

### Etapa 1. Preparación territorial

1. Obtener los polígonos provinciales y las unidades hidrográficas oficiales.
2. Verificar geometrías inválidas, códigos, duplicados, CRS y nivel Pfafstetter.
3. Recortar los polígonos al área piloto sin perder sus identificadores.
4. Mantener `territory_type` (`province` o `hydro_unit`) y `territory_id` como claves obligatorias.

### Etapa 2. Ingesta y control de calidad de hotspots

Para cada colección/sensor:

1. Filtrar el rango de fechas y área piloto.
2. Leer `FireMask` y `QA` según la especificación de cada producto.
3. Separar detecciones de baja confianza (clase 7) de las nominales/altas (8–9).
4. Identificar observaciones válidas terrestres.
5. Conservar los conteos de cada sensor de forma independiente.
6. Agregar por día, sensor y polígono territorial.

**Clases relevantes de `FireMask`:**

| Clase | Significado común | Tratamiento |
|---:|---|---|
| 0–2 | Estados sin detección utilizable; su significado exacto varía por producto. En VIIRS, 0 es dato de entrada ausente/mala calidad, 1 corresponde al recorte tipo bow-tie y 2 no se usa. En MODIS, 1 es obsoleto y 2 indica no procesado por otra razón. | Excluir de observaciones válidas. |
| 3 | Agua sin detección | Excluir del análisis terrestre. |
| 4 | Nube | No contar como no-detección; registrar como no observado. |
| 5 | Píxel terrestre sin detección de fuego (en la especificación VIIRS se denomina `non-fire land`) | Observación terrestre válida, sujeto al QA. |
| 6 | Sin clasificar | Excluir de observaciones válidas. |
| 7 | Detección de baja confianza | Conservar separada; no incluir en el indicador principal. |
| 8 | Detección de confianza nominal | Incluir en el indicador principal. |
| 9 | Detección de alta confianza | Incluir en el indicador principal. |

En estos productos, `FireMask` codifica la clase en los bits 0–3; se debe extraer ese campo antes de comparar clases (`bitwiseAnd(15)`). En `QA`, los bits 0–1 representan el estado tierra/agua; extraerlos (`bitwiseAnd(3)`) y considerar como tierra el valor 2. No reutilizar una función de QA sin comprobar sus bandas y leyenda en MOD14A1, MYD14A1 y VNP14A1.

**Definición inicial de observación válida terrestre:** `QA` indica tierra (valor 2) y `FireMask` es 5, 7, 8 o 9. Excluir costa (QA=1), agua, nube, píxel sin clasificar y estados no procesados. La clase 7 se conserva para análisis de sensibilidad; el indicador principal utiliza únicamente clases 8–9. Para una detección, además de `FireMask` 7–9, se exige QA terrestre para que el indicador se refiera al territorio terrestre de estudio.

**Importante:** los bits 0–1 del QA tienen una interpretación documentada común en estas colecciones, pero los bits restantes de QA no son idénticos. La función debe estar parametrizada o separada por producto. La definición anterior es una regla de trabajo del proyecto y debe comprobarse contra la leyenda de cada colección y una muestra visual antes de procesar todo el período.

### Etapa 3. Armonización entre sensores

La armonización será semántica, temporal y estadística:

- Mismas definiciones de observación válida, detección y cobertura, adaptadas al QA de cada colección.
- Mismas fechas, períodos y polígonos para las comparaciones.
- Indicadores normalizados por observaciones válidas.
- Resultados separados por sensor y comparación en el período de solapamiento.
- No sumar los conteos MODIS Terra + Aqua + VIIRS como si fueran eventos independientes equivalentes.
- No asumir que una celda de un sensor representa exactamente el mismo soporte espacial que una celda del otro. Para las estadísticas territoriales, agregar cada producto desde su cuadrícula nativa al polígono y documentar el método.
- Si se necesita superponer rásteres, usar remuestreo apropiado a datos categóricos (p. ej., vecino más cercano) y dejar registrado el CRS, escala y transformación.

**Qué significa armonizar en este MVP:** unificar definiciones de clases y estados válidos según la documentación de cada producto; alinear la ventana temporal y los polígonos de análisis; calcular indicadores normalizados con denominadores de observación propios de cada sensor; y comparar sus señales sin fingir que tienen la misma sensibilidad o soporte espacial. Esto es armonización semántica, temporal y estadística para análisis territorial; **no es una calibración radiométrica entre sensores**.

**Salida de comparación multisensor:** para un mismo territorio y mes común, mostrar cada tasa/anomalía por separado y calcular una etiqueta cualitativa de consistencia: `concordant_elevated` (dos o más sensores con cobertura suficiente señalan actividad anómala elevada según umbrales estacionales configurados por sensor), `discordant` (señales distintas), `single_sensor` (solo un sensor utilizable) o `insufficient` (cobertura o línea base insuficiente). Esta etiqueta describe acuerdo entre señales, no valida un incendio ni crea un conteo combinado. Los umbrales se documentan en `metadata.json` y no se fijan arbitrariamente para todas las regiones.

### Etapa 4. Cálculo de indicadores históricos

Para cada territorio, sensor y período:

| Indicador | Definición |
|---|---|
| `fire_pixels_8_9` | Número de píxeles con detección nominal/alta (clases 8–9) en el día o período. |
| `fire_pixels_7_9` | Número de píxeles con detección de cualquier confianza (7–9), para análisis de sensibilidad. |
| `valid_land_pixels` | Número de píxeles terrestres con observación válida. |
| `expected_land_pixels_per_day` | Número fijo de celdas terrestres esperadas dentro del polígono para esa cuadrícula de sensor, calculado con una máscara terrestre de referencia y una regla fija de inclusión de píxeles. No recalcularlo a partir de los píxeles válidos de cada día. |
| `observation_coverage` | Suma de píxeles terrestres válidos / suma de píxeles terrestres esperados en todos los días del período. |
| `activity_rate` | Píxeles-día detectados con confianza nominal/alta / píxeles-día terrestres válidos. |
| `active_days` | Número de días del período con al menos una detección nominal/alta en el territorio. |
| `max_consecutive_active_days` | Mayor cantidad de días consecutivos con al menos una detección en el territorio. Es la definición operativa de persistencia para el MVP. |
| `fire_pixel_days_8_9` | Suma de píxeles-día con detecciones nominales/altas (clases 8–9); un mismo píxel detectado en varios días cuenta varias veces. No representa hectáreas ni incendios únicos. |

Fórmulas centrales:

`activity_rate = fire_pixel_days_8_9 / valid_land_pixel_days`

`observation_coverage = valid_land_pixel_days / expected_land_pixel_days`

La tasa es una frecuencia normalizada de detecciones por píxel-día observado; **no es la probabilidad de incendio ni el porcentaje de superficie quemada**.

Donde `valid_land_pixel_days` es la suma diaria de píxeles terrestres válidos y `expected_land_pixel_days` es el soporte terrestre esperado por día multiplicado por el número de días del período. Si falta una imagen/día, crear la fila con 0 píxeles válidos y conservar el denominador esperado; así la ausencia se refleja en cobertura y no se interpreta como cero fuego.

Mantener una misma regla de asignación de píxeles a polígonos para los tres sensores (por ejemplo, centro del píxel dentro del polígono) y documentarla. Construir el soporte esperado por sensor una sola vez con una máscara terrestre de referencia; no usar el QA diario como denominador esperado, porque los días nublados o no procesados reducirían artificialmente el denominador. No presentar los conteos absolutos como equivalentes entre sensores ni como superficie quemada.

`active_days` cuenta todos los días con alguna detección. `max_consecutive_active_days` cuenta la racha más larga de días consecutivos activos; un día sin observación válida rompe la racha y también debe marcarse como falta de cobertura. Ninguna de estas métricas identifica la duración de un incendio individual.

### Etapa 5. Anomalía histórica

1. Calcular la tasa de actividad del mes seleccionado.
2. Construir la referencia con el mismo mes calendario de años anteriores para el mismo sensor y territorio.
3. Obtener mediana y desviación absoluta mediana (MAD) de las tasas históricas.
4. Calcular, cuando sea viable:

   `robust_z = (activity_rate_current - median_historical) / (1.4826 * MAD_historical)`

5. Si MAD es cero/casi cero, no forzar un valor infinito ni artificial: usar percentil/rango histórico o indicar que la anomalía robusta no es estimable.
6. Mostrar el número de años comparables, cobertura y ventana usada.
7. Si la línea base es demasiado corta, mostrar «historial insuficiente» en lugar de una anomalía concluyente. El mínimo de años se definirá como parámetro explícito y se documentará; no es un umbral universal.

### Etapa 6. Contexto ambiental

El contexto se agregará por territorio y período, conservando siempre la resolución de origen.

**A. Cobertura vegetal y combustible potencial**

- Utilizar MapBiomas Perú para estimar la proporción de clases de cobertura potencialmente combustibles.
- Documentar la correspondencia de clases a grupos amplios (bosque, matorral, pastizal, agricultura, urbano, suelo desnudo, agua, etc.).
- No convertir automáticamente una clase de cobertura en una categoría de inflamabilidad ni afirmar que se conoce la carga de combustible.

**B. Sequedad y estado de vegetación**

- Utilizar NDVI/EVI mensual de MOD13A3 y anomalías estacionales cuando el período temporal y la calidad sean adecuados. Aplicar `DetailedQA` y el factor de escala 0.0001; si se usa MOD13Q1, documentar la relación de sus compuestos de 16 días con el mes analizado.
- Complementar con humedad del suelo y/o precipitación antecedente de ERA5-Land.
- Presentar estas variables como proxies/contexto. NDVI bajo no significa necesariamente sequedad; la humedad del suelo no es humedad del combustible fino o muerto.

**C. Meteorología y condiciones térmicas (proceso diario)**

- Calcular velocidad y dirección diaria del viento (`wind_speed_10m_ms = sqrt(u² + v²)`, `wind_dir_deg = (atan2(-u, -v) * 180 / π + 360) % 360`) a partir de `u_component_of_wind_10m` y `v_component_of_wind_10m` de `ERA5-Land` (~11.1 km, continuo 2000–presente): promediar `u` y `v` por día/territorio antes de calcular el ángulo (convención meteorológica: desde dónde sopla, 0° = N, 90° = E, 180° = S, 270° = O; nunca promediar ángulos directamente). **NOAA ARL READY (`READYamet.php` / GDAS)** queda como fuente opcional de contraste puntual para eventos de la demo.
- Incluir temperatura ambiente (`t_amb_c`, `temperature_2m_c` de ERA5-Land) y temperatura superficial del suelo (`t_suelo_c` de MODIS `MOD11A1`/`MYD11A1` y VIIRS `VNP21A1D`/`VNP21A1N` convertida a °C); si se usa temperatura y punto de rocío, estimar humedad relativa con una fórmula documentada.
- Para precipitación, preferir `total_precipitation_hourly` (m por hora) y convertir a mm antes de sumar ventanas antecedentes. No sumar directamente la banda acumulada `total_precipitation` sin respetar su reinicio diario y convención de acumulación.
- Calcular acumulados antecedentes (por ejemplo, 30 días) solo para períodos completos y publicados.
- Comparar con referencias estacionales locales, evitando umbrales absolutos únicos para todo Perú.
- La fecha más reciente de ERA5-Land debe consultarse en el catálogo/GEE; la evaluación ambiental representa el período histórico procesado, no meteorología en tiempo real.

**D. Topografía (DEM por época)**

- Extraer altura (`elevation_m`, `dem_source`) del modelo DEM correspondiente a la época del sensor: SRTM/NASADEM (época 2000) para el tramo MODIS (2000–2011) y Copernicus DEM GLO-30 (época 2011–2015) para el tramo VIIRS (2012–presente).
- Derivar pendiente y orientación (aspect) desde el DEM.
- Mostrar distribución de superficie por rangos de pendiente, no solo la pendiente media del polígono. Los rangos se fijan y documentan como parámetros; no se interpretan como umbrales universales de propagación.
- Tratar pendiente y orientación como factores contextuales; el efecto depende de combustible y meteorología.

**E. Agua y discontinuidad del combustible**

- Calcular con MapBiomas la proporción de las clases de agua y de humedales/formaciones inundables de su leyenda por territorio (documentar la correspondencia de clases).
- Mostrarla como contexto descriptivo (mayor disponibilidad hídrica y menor continuidad de combustible). No asumir que el agua actúa como barrera efectiva contra el fuego ni que reduce por sí sola la susceptibilidad.

**F. Antecedente térmico MODIS/VIIRS**

- Tomar de `sensor_comparison.json` y `activity_summary.json` la señal de cada sensor (`signal_status`, persistencia). Cada sensor aporta su propio indicador, según su soporte espacial y cobertura; no se suman conteos entre sensores.
- Se usa como modificador informativo del árbol, no como entrada que decida la categoría.

### Etapa 7. Árbol de decisión de susceptibilidad contextual

La plataforma producirá dos resultados separados:

1. **Perfil de actividad térmica histórica:** tasa, anomalía, persistencia y cobertura (calendario MODIS/VIIRS).
2. **Perfil de susceptibilidad contextual a la expansión:** salida de un árbol de decisión de reglas transparentes sobre vegetación, sequedad, meteorología, topografía, agua y antecedente térmico.

El árbol responde una pregunta descriptiva: *dadas las condiciones observadas en el mes, ¿qué tan favorable es el territorio a que un fuego, si llegara a ocurrir, se extienda?* No estima si habrá un fuego, cuánta superficie quemaría ni hacia dónde avanzaría.

**Compuerta de calidad (nodo N0).** Para emitir una categoría se requiere: (a) estimación válida de cobertura vegetal potencialmente combustible y (b) al menos un indicador de sequedad/humedad y uno meteorológico del mismo período. Si falta cualquiera de esos bloques, devolver «Evaluación parcial» o «No evaluable», sin convertir la falta de datos en una condición favorable o desfavorable. Pendiente, agua y antecedente térmico son modificadores y no sustituyen a esos bloques.

**Variables y reglas de cada factor:**

| Factor | Variable | Regla indicativa | Fuente |
|---|---|---|---|
| Vegetación combustible | Proporción de clases combustibles (`vegetation_area_pct`) | Mayor o igual a `umbral_veg` (parámetro documentado). | MapBiomas |
| Sequedad | `precip_30d_mm` o `soil_moisture_surface`; `ndvi_anomaly` como evidencia complementaria | Por debajo del percentil estacional bajo (p25) del mismo territorio y mes. El NDVI negativo apoya la señal pero no la sustituye. | ERA5-Land / MOD13A3 |
| Viento | `wind_speed_10m_ms` | Por encima del percentil estacional alto (p75). | ERA5-Land |
| Condición cálida y seca | `temperature_2m_c` y `relative_humidity_2m_pct` | Temperatura sobre p75 **y** humedad relativa bajo p25. No basta la temperatura sola. | ERA5-Land |
| Pendiente | `slope_class_area_pct` | Proporción de área con pendiente elevada mayor o igual a `umbral_pend`. | SRTM |
| Agua y humedales | `water_area_pct`, humedales | Solo descriptivo en el MVP; no cambia la categoría. | MapBiomas |
| Antecedente térmico | `signal_status` por sensor, persistencia | `elevated` en al menos un sensor con cobertura suficiente. Solo informativo. | MODIS / VIIRS |

**Árbol de decisión (versión inicial):**

```text
N0  ¿Pasa la compuerta de calidad?
     ├─ No  → PARTIAL o NOT_EVALUABLE (según qué bloque falte)
     └─ Sí  ↓
N1  ¿Vegetación combustible ≥ umbral_veg?
     ├─ No  → LOW   (poco combustible vegetal en el territorio)
     └─ Sí  ↓
N2  ¿Señal de sequedad? (precip_30d o humedad del suelo < p25 estacional)
     ├─ Sí → N3a ¿Condición atmosférica propicia?
     │           (viento > p75  O  (temperatura > p75 Y humedad relativa < p25))
     │           ├─ Sí → HIGH
     │           └─ No → MODERATE
     └─ No → N3b ¿Viento > p75 Y proporción de pendiente elevada ≥ umbral_pend?
                 ├─ Sí → MODERATE
                 └─ No → LOW

Modificadores informativos (no cambian la categoría en el MVP):
  steep_slope_share_high · thermal_history_elevated · water_share_high
```

**Categorías de salida** (`classification`):

- **`high` — Susceptibilidad alta:** hay vegetación combustible, señal de sequedad y una condición atmosférica propicia (viento alto o combinación cálida y seca).
- **`moderate` — Susceptibilidad moderada:** hay vegetación combustible y solo parte de los factores (sequedad sin condición atmosférica propicia, o viento alto con pendiente elevada sin sequedad).
- **`low` — Susceptibilidad baja:** poca vegetación combustible, o vegetación sin sequedad ni condición atmosférica propicia. No significa que el territorio esté libre de incendios.
- **`partial` — Evaluación parcial:** falta uno de los bloques necesarios, pero se pueden describir los factores disponibles.
- **`not_evaluable` — No evaluable:** la calidad o cobertura es insuficiente para describir los factores principales.

**Trazabilidad:** cada resultado guarda la ruta de decisión (`decision_path`, por ejemplo `["N0:pass","N1:yes","N2:yes","N3a:yes"]`), las reglas activadas, los modificadores y la evidencia por variable (valor, unidad, fuente, período y resolución), para que la interfaz explique por qué un territorio cayó en cada categoría.

**Parámetros:** `umbral_veg`, `umbral_pend`, los percentiles (p25/p75), la regla de sequedad (cualquiera de los dos indicadores) y el mínimo de años de referencia se definen tras inspeccionar datos y referencias locales, y se guardan como parámetros versionados en `metadata.json` o en la configuración del módulo analítico. Los percentiles se calculan por territorio, mes calendario y variable, nunca con un umbral único para todo Perú. Cada variable reporta cuántos años/meses forman su referencia; si no alcanza el mínimo acordado por Tom y Angelo, la regla se marca como no estimable. La categoría es una evaluación cualitativa de condiciones observadas, no una probabilidad de propagación ni un índice validado de riesgo.

### Etapa 8. Contraste retrospectivo con áreas quemadas

Cuando el área piloto y el período lo permitan:

- Priorizar MapBiomas Fuego, Colección 2 (áreas quemadas anuales 1990–2025) cuando la disponibilidad de datos para el área piloto esté confirmada. El Monitor del Fuego ofrece cartografía mensual reciente de 2025–2026; verificar el último mes y el mecanismo de descarga.
- Como alternativa/complemento, utilizar MCD64A1 mensual de MODIS si se necesita un producto disponible directamente en GEE.
- Superponer detecciones térmicas con cicatrices de quema y revisar coincidencias/desfases espaciales y temporales.
- Documentar diferencias por resolución, frecuencia temporal, método y período de cobertura.
- No afirmar que toda detección que no coincide con una cicatriz es falsa ni que toda cicatriz tiene que haber sido detectada por los tres sensores.
- Como revisión exploratoria del árbol, comparar si los territorios y meses clasificados `high` tienden a presentar más área quemada (MapBiomas Fuego o MCD64A1) que los clasificados `low`. Es una prueba de coherencia con pocos casos, no una validación: el área quemada también depende de las igniciones, de la supresión y de otros factores que el árbol no modela.

Este contraste es exploratorio. No equivale a una validación de verdad-terreno independiente ni demuestra capacidad de predicción. En particular, MCD64A1 utiliza observaciones de incendios activos MODIS como parte de su algoritmo, por lo que no es una referencia completamente independiente para validar los hotspots MODIS. MapBiomas Fuego ofrece una fuente metodológicamente distinta basada en cicatrices Landsat, pero también es un producto satelital clasificado y no una verdad-terreno perfecta.

---

## 8. Arquitectura técnica definida

### 8.1. Decisión de arquitectura

Para el hackathon se utilizará una arquitectura **por lotes, con resultados precomputados por mes y una API REST de solo lectura**. Es más sencilla de construir y depurar que una plataforma que consulte Earth Engine en tiempo real. Además, evita que frontend y backend tengan que resolver cálculos distintos para períodos arbitrarios.

**Regla del MVP:** el usuario elige un mes calendario disponible y un sensor. Tom prepara previamente los indicadores y reglas para los meses habilitados. La API no acepta una combinación de fechas que no exista en los resultados procesados. Si más adelante se necesita elegir cualquier intervalo, se amplía el módulo analítico y su contrato; no se improvisa un cálculo en React o en los endpoints.

La aplicación seguirá este recorrido:

```text
[MODIS / VIIRS / MapBiomas / ERA5-Land / SRTM / límites]
                         │
                         ▼
           [Google Earth Engine — Angelo]
       descarga lógica, QA, máscaras y agregación zonal
                         │
                         ▼
              [Datos fuente normalizados]
                  CSV / GeoJSON
                         │
                         ▼
               [Analítica — Tom]
      métricas históricas + anomalías + reglas
                         │
                         ▼
            [Artefactos publicados]
        JSON / GeoJSON + metadata.json
                         │
                         ▼
              [Backend — Jhan]
                FastAPI / REST
          valida, filtra y entrega los datos
                         │
                         ▼
             [Frontend — Sebastian]
         React / mapa / gráficos / fichas

 [Jean Pierrer: insumos territoriales de referencia, contrato/documentación, QA de producto y presentación/demo]
```

**Reglas de separación:**

- GEE procesa y agrega los datos geoespaciales; no sirve la interfaz web.
- El módulo analítico calcula las métricas y la clasificación por reglas para cada mes habilitado; no se reescriben las fórmulas en JavaScript ni en los endpoints.
- FastAPI entrega resultados existentes y aplica filtros sencillos; no vuelve a calcular anomalías ni reglas.
- El frontend presenta los datos recibidos; no modifica su significado ni inventa valores cuando faltan.
- El chatbot, si se implementa, consume el mismo resumen que devuelve la API. No tendrá acceso directo a Earth Engine ni a los archivos fuente.

### 8.2. Tecnologías de referencia

Estas son las tecnologías recomendadas para que el equipo arranque con una base común. Si el repositorio ya contiene una aplicación funcional con otra tecnología, se conserva el stack existente, pero **se mantienen obligatoriamente los contratos, rutas y responsabilidades descritos aquí**.

| Componente | Tecnología de referencia | Responsabilidad |
|---|---|---|
| Procesamiento geoespacial | Google Earth Engine, JavaScript | Consultar colecciones, aplicar QA, procesar y exportar. |
| Analítica | Python, pandas y NumPy | Indicadores, anomalías, persistencia y reglas interpretables. |
| Backend | Python, FastAPI y Pydantic | Validar, filtrar y entregar los archivos procesados mediante API REST. |
| Frontend | React + Vite + TypeScript | Interfaz de consulta y visualización. |
| Mapa | Leaflet / React-Leaflet | Polígonos, hotspots y capas territoriales. |
| Gráficos | Recharts | Series temporales e indicadores. |
| Intercambio | JSON y GeoJSON | Formato común entre módulos. |

**No se implementará una base de datos en el MVP**, salvo que el repositorio ya dependa de una. Para el área piloto, los resultados preprocesados pueden almacenarse como archivos JSON/GeoJSON pequeños. Esto evita añadir migraciones, credenciales y consultas complejas durante el hackathon.

### 8.3. Estructura única del repositorio

```text
McHanaq/
├── contracts/                   # Jean coordina; Jhan valida el contrato técnico de API
│   ├── api-contract.md
│   ├── data-dictionary.md
│   └── schemas/
├── gee/                         # Angelo
│   ├── hotspots_pipeline.js
│   ├── environmental_context.js
│   └── README.md
├── analytics/                   # Tom
│   ├── metrics.py
│   ├── anomalies.py
│   ├── decision_rules.py
│   └── README.md
├── backend/                     # Jhan
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── schemas/
│   │   └── services/
│   └── requirements.txt
├── frontend/                    # Sebastian
│   ├── src/
│   └── package.json
├── data/
│   ├── reference/                # Capas oficiales pequeñas revisadas por Jean
│   ├── fixtures/                 # Ejemplos sintéticos/pequeños; Jean coordina
│   ├── intermediate/             # Exportaciones GEE temporales (ignorado en Git)
│   └── processed/                # Resultados compactos por mes para la API/demo
├── tests/                       # Pruebas por módulo y aceptación
├── docs/                        # Jean Pierrer
│   ├── methodology.md
│   ├── sources.md
│   └── demo_script.md
├── presentation/                # Jean Pierrer: deck y recursos de exposición
├── .gitignore
└── README.md
```

Cada responsable trabaja principalmente dentro de su carpeta. Los cambios en `contracts/` afectan a todos y deben revisarse con el equipo antes de fusionarse. Las capas oficiales pequeñas revisadas por Jean se guardan en `data/reference/`; Angelo las valida técnicamente y las incorpora al flujo GEE. Las exportaciones GEE (`daily_activity.csv` y `environmental_context.csv`) pasan por `data/intermediate/`; Tom las procesa y genera los archivos API-ready en `data/processed/`: `territories.geojson`, `activity_daily.json`, `activity_summary.json`, `conditions_assessment.json` y `metadata.json`. Jhan configura FastAPI para leer esa carpeta, no una ruta distinta dentro de `backend/`. La tabla CSV intermedia no debe ser consumida directamente por el frontend.

**Cómo se comparten los datos entre computadoras:** GitHub contiene código, contratos, fixtures, metadatos y resultados compactos necesarios para la demo. Los archivos pesados o rásteres intermedios se comparten por una carpeta común de Drive u otro medio acordado, con nombre, fecha, versión y enlace registrados en `metadata.json`; no se suben a Git. Si un resultado procesado es pequeño y no tiene restricciones de redistribución, se puede versionar en `data/processed/` para que todos ejecuten exactamente la misma demo.

### 8.4. Archivos de intercambio

Los nombres de archivo y campos son parte del contrato. No se deben renombrar unilateralmente.

| Archivo | Lo genera | Lo consume | Contenido |
|---|---|---|---|
| `territories.geojson` | Jean entrega las capas oficiales; Angelo valida, normaliza y exporta | Backend y frontend | Geometrías provinciales e hidrográficas con IDs estables y `territory_type`; archivo API-ready en `data/processed/`. |
| `daily_activity.csv` | Angelo | Tom | Tabla intermedia con conteos diarios por territorio y sensor, observaciones válidas y esperadas. No la consume directamente el frontend. |
| `environmental_context.csv` | Angelo | Tom | Tabla intermedia con variables ambientales agregadas por territorio y mes calendario, con fecha de referencia por variable. |
| `activity_daily.json` | Tom | Jhan | Serie diaria normalizada y lista para que la API alimente el calendario/gráfico del mes seleccionado. |
| `activity_summary.json` | Tom | Jhan | Tasas, fire pixel-days, días activos, racha máxima y anomalías por territorio, sensor y mes; se calcula para cada mes habilitado y sus líneas base. |
| `sensor_comparison.json` | Tom | Jhan | Comparación del mismo territorio y mes entre sensores disponibles: tasas/anomalías individuales, cobertura y estado de concordancia/discrepancia; nunca suma conteos brutos. |
| `conditions_assessment.json` | Tom | Jhan | Categoría de susceptibilidad, ruta de decisión, factores y modificadores activados, evidencia y datos faltantes por territorio y mes; independiente del sensor seleccionado. |
| `hotspots.geojson` | Angelo, solo si el volumen lo permite | Backend y frontend | Capa opcional de puntos de detección. La coropleta por territorio no depende de este archivo. |
| `metadata.json` | Angelo y Tom; Jean completa atribución y documentación | Backend y frontend | Fuentes, colecciones, fechas disponibles, períodos comunes, resolución, unidades, versiones y limitaciones; archivo API-ready en `data/processed/`. |

**Claves obligatorias en datos territoriales:** `territory_type` (`province` o `hydro_unit`) y `territory_id`. Para sensores: `MODIS_TERRA`, `MODIS_AQUA` y `VIIRS_SNPP`. Las fechas se expresan como `YYYY-MM-DD`. Los valores numéricos desconocidos o no estimables se representan como `null`, nunca como cero.

#### Campos mínimos de `daily_activity.csv`

Una fila por fecha, territorio y sensor:

- `date`, `territory_type`, `territory_id`, `sensor`
- `fire_pixels_low` (clase 7)
- `fire_pixels_nominal_high` (clases 8–9; base de `fire_pixel_days_8_9`)
- `valid_land_pixels`, `expected_land_pixels_per_day`
- `observation_coverage`
- `source_product`, `processing_version`

#### Campos mínimos de `environmental_daily.csv` y `environmental_context.csv`

Para el procesamiento longitudinal diario (`environmental_daily.csv`, una fila por fecha `YYYY-MM-DD` y territorio):

- `date`, `territory_type`, `territory_id`
- `t_amb_c` (temperatura ambiente a 2 m, °C: `temperature_2m - 273.15`)
- `relative_humidity_2m_pct` (humedad relativa %, calculada desde `temperature_2m` y `dewpoint_temperature_2m` de ERA5-Land vía Magnus-Tetens)
- `t_suelo_c` (temperatura superficial del suelo LST desde MODIS/VIIRS: `valor * 0.02 - 273.15`, °C) y `lst_valid_pixel_pct` (control de nubes `< 30%`, es decir, `>= 70%` válido)
- `wind_dir_deg` (dirección diaria del viento, 0–360°), `wind_speed_10m_ms` (m/s)
- `elevation_m` (altura en m s.n.m.: banda `elevation` en SRTM/NASADEM, banda `DEM` en Copernicus GLO-30), `dem_source` (modelo DEM según época MODIS/VIIRS)

Para el contexto mensual (`environmental_context.csv`, una fila por territorio y mes calendario, agregado en `analytics/` por media aritmética y media ponderada por cobertura válida diaria):

- `period_id` (`YYYY-MM`), `territory_type`, `territory_id`, `landcover_year`
- proporciones de cobertura por grupo (`vegetation_area_pct` o campos equivalentes acordados), conservando por separado bosques, matorrales, pastizales, agricultura, áreas urbanas, suelo desnudo y agua cuando la leyenda lo permita
- `ndvi_median`, `ndvi_anomaly` (si se procesan)
- `precip_30d_mm`, `soil_moisture_surface` (`volumetric_soil_water_layer_1`, m³/m³)
- `t_amb_c`, `t_suelo_c`, `relative_humidity_2m_pct`, `wind_dir_deg`, `wind_speed_10m_ms` (media aritmética y ponderada por cobertura)
- `elevation_m`, `dem_source` y estadísticas de pendiente (`slope_class_area_pct` o equivalentes)
- `source_resolution`, `source_product`, `source_period_start`, `source_period_end`, `processing_version`

`metadata.json` debe incluir:

- `available_date_ranges_by_sensor`: rango diario `{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}` por sensor.
- `available_periods_by_sensor`: meses completos procesados para cada sensor.
- `common_environmental_periods`: meses para los que están disponibles los bloques ambientales obligatorios.
- `common_analysis_periods`: intersección de los meses disponibles en los tres sensores y del contexto ambiental; se usa para comparaciones multisensor justas.
- `min_baseline_years`: `5` (cubierto tanto por MODIS 2000–2025 como por VIIRS 2018–2025).

Para una ficha de un sensor, el backend valida que el mes esté disponible para ese sensor y en `common_environmental_periods`. Para una comparación de los tres sensores, exige además que figure en `common_analysis_periods`. Solo se exponen meses preprocesados y con cobertura mínima definida por el equipo.

#### Salida mínima de evaluación

`activity_daily.json` contiene los registros diarios que la API necesita para dibujar la serie del mes. `activity_summary.json` debe tener un objeto identificable por `territory_type`, `territory_id`, `period_id` y `sensor`, con métricas y anomalía. `sensor_comparison.json` debe contener un objeto por `territory_type`, `territory_id` y `period_id`, con los indicadores separados de cada sensor, su cobertura, el estado de comparación y la explicación de las reglas aplicadas. `conditions_assessment.json` debe tener un objeto por `territory_type`, `territory_id` y `period_id`, con `classification`, `decision_path`, `rules_triggered`, `modifiers`, `evidence`, `missing_variables`, `data_quality_status`, `source_products` y `processing_version`. Cada elemento de `evidence` debe indicar `variable`, `value`, `unit`, `rule_status`, `source_product` y `source_period` para que la interfaz pueda explicar la clasificación.

**Ejemplos de estructura para los fixtures (valores ficticios; no son resultados):**

`activity_daily.json` — una fila por día, territorio y sensor:

```json
{
  "schema_version": "1.0",
  "items": [{
    "date": "2026-09-01", "territory_type": "province", "territory_id": "1501",
    "sensor": "MODIS_TERRA", "fire_pixels_low": 2,
    "fire_pixels_nominal_high": 1, "valid_land_pixels": 340,
    "expected_land_pixels_per_day": 400, "observation_coverage": 0.85,
    "t_amb_c": 18.4, "relative_humidity_2m_pct": 42.1, "t_suelo_c": 29.7,
    "lst_valid_pixel_pct": 88.5, "wind_dir_deg": 135.0, "wind_speed_10m_ms": 3.8,
    "elevation_m": 2850.0, "dem_source": "COPERNICUS_GLO30"
  }]
}
```

`activity_summary.json` — una fila por mes, territorio y sensor. `fire_pixel_days_8_9` es la métrica principal; `fire_pixel_days_7_9` es solo sensibilidad:

```json
{
  "schema_version": "1.0",
  "items": [{
    "period_id": "2026-09", "territory_type": "province", "territory_id": "1501",
    "sensor": "MODIS_TERRA", "fire_pixel_days_8_9": 24,
    "fire_pixel_days_7_9": 31, "valid_land_pixel_days": 9200,
    "expected_land_pixel_days": 12000, "activity_rate": 0.00261,
    "observation_coverage": 0.7667, "active_days": 8,
    "max_consecutive_active_days": 3,
    "historical_anomaly": {"value": 1.4, "status": "estimated", "baseline_years": 10}
  }]
}
```

`sensor_comparison.json` — una fila por mes y territorio. Las categorías son etiquetas descriptivas, no una calibración entre instrumentos:

```json
{
  "schema_version": "1.0",
  "items": [{
    "period_id": "2026-09", "territory_type": "province", "territory_id": "1501",
    "status": "discordant",
    "sensors": {
      "MODIS_TERRA": {"available": true, "activity_rate": 0.00261, "historical_anomaly": 1.4, "observation_coverage": 0.7667, "signal_status": "not_elevated"},
      "MODIS_AQUA": {"available": true, "activity_rate": 0.00110, "historical_anomaly": 0.2, "observation_coverage": 0.7100, "signal_status": "not_elevated"},
      "VIIRS_SNPP": {"available": true, "activity_rate": 0.00320, "historical_anomaly": 2.1, "observation_coverage": 0.8200, "signal_status": "elevated"}
    },
    "interpretation": "Los sensores no muestran una señal estacional concordante; revisar cobertura, sobrevuelo y diferencias instrumentales.",
    "method_version": "0.1.0"
  }]
}
```

Estados permitidos: `concordant_elevated`, `concordant_not_elevated`, `discordant`, `single_sensor` e `insufficient`. Primero se clasifica la señal de cada sensor (`elevated` o `not_elevated`) usando su propio umbral estacional y línea base; después se comparan esas etiquetas, no los conteos absolutos. `concordant_elevated` indica que al menos dos sensores comparables con cobertura suficiente muestran una señal elevada; `concordant_not_elevated` indica que al menos dos sensores comparables no superan sus umbrales; `discordant` indica que hay señales elevadas y no elevadas entre sensores comparables; `single_sensor` indica que solo una fuente es utilizable; `insufficient` indica que ninguna fuente tiene cobertura o línea base suficiente. El umbral de cobertura y los umbrales estacionales deben quedar fijados en el contrato y mostrarse en `metadata.json`. Los valores del ejemplo son ficticios. La comparación no suma píxeles ni declara equivalencia radiométrica; solo resume si las señales relativas de los sensores coinciden.

`conditions_assessment.json` — una fila por mes y territorio; no depende del sensor:

```json
{
  "schema_version": "1.0",
  "items": [{
    "period_id": "2026-09", "territory_type": "province", "territory_id": "1501",
    "classification": "moderate", "decision_path": ["N0:pass", "N1:yes", "N2:yes", "N3a:no"],
    "rules_triggered": ["vegetation_present", "dryness_high"], "modifiers": ["thermal_history_elevated"],
    "evidence": [{
      "variable": "precip_30d_mm", "value": 18.4, "unit": "mm",
      "rule_status": "below_seasonal_p25", "source_product": "ERA5_LAND_HOURLY",
      "source_period": "2026-09", "source_resolution": "~11.1 km"
    }],
    "missing_variables": [], "data_quality_status": "usable",
    "source_products": ["MAPBIOMAS_PERU_C4", "ERA5_LAND_HOURLY", "SRTM"],
    "processing_version": "0.1.0"
  }]
}
```

Los ejemplos contienen números ficticios y solo sirven para desarrollar y probar. Jean los marcará como `fixture`; ningún integrante debe usarlos como evidencia en la presentación.

### 8.5. Contrato de API entre backend y frontend

**El frontend solo consume esta API.** No lee CSV internos, no consulta GEE y no calcula indicadores. La API sirve en **resolución diaria por defecto** (`date=YYYY-MM-DD` y rangos `from`/`to=YYYY-MM-DD`), manteniendo `period=YYYY-MM` como parámetro opcional para contexto/anomalía mensual, exponiendo únicamente fechas publicadas en `metadata.json`.

| Método y ruta | Para qué sirve | Parámetros principales |
|---|---|---|
| `GET /api/v1/health` | Comprobar que el backend está activo. | Ninguno. |
| `GET /api/v1/metadata` | Obtener fuentes, sensores, unidades, resoluciones y fechas/períodos disponibles por fuente. | Ninguno. |
| `GET /api/v1/territories?type=province` | Obtener geometrías y nombres territoriales. | `type=province` o `hydro_unit`. Devuelve GeoJSON FeatureCollection. |
| `GET /api/v1/territory-metrics?type=province&date=2026-09-15&sensor=MODIS_TERRA&metric=activity_rate` | Obtener indicadores diarios para colorear la coropleta. | `type`, `date` (o `period` opcional), `metric`; `sensor` es obligatorio para métricas de actividad y opcional para clasificación o métricas ambientales (`t_amb_c`, `t_suelo_c`, `wind_dir_deg`, `elevation_m`). Devuelve `date`, `metric`, `unit` e `items` con `territory_type`, `territory_id` y el valor. |
| `GET /api/v1/territories/{type}/{id}/summary?date=2026-09-15&sensor=MODIS_TERRA` | Obtener la ficha diaria de un territorio. | `date` (o `period` opcional), `sensor`. Incluye actividad térmica del día, variables diarias (`t_amb_c`, `t_suelo_c`, `wind_dir_deg`, `wind_speed_10m_ms`, `elevation_m`) y contexto/anomalía mensual. |
| `GET /api/v1/territories/{type}/{id}/activity?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA` | Obtener la serie diaria del rango seleccionado. | `from`, `to` (o `period` opcional), `sensor`. Devuelve los días, conteos diarios y variables ambientales diarias. |
| `GET /api/v1/territories/{type}/{id}/sensor-comparison?date=2026-09-15` | Obtener comparación multisensor diaria. | `date` (o `period` opcional). Devuelve indicadores separados por sensor, `status` e `interpretation` precomputados por Tom. |
| `GET /api/v1/territories/{type}/{id}/export.csv?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA` | Descargar CSV diario del territorio en el rango pedido. | `from`, `to`, `sensor`. |
| `GET /api/v1/territories/{type}/{id}/hotspots?date=2026-09-15&sensor=MODIS_TERRA` | Obtener la capa opcional de puntos de hotspots. | `date`, `sensor`. Solo se habilita si `hotspots.geojson` fue generado. |

Valores permitidos para `type`: `province` y `hydro_unit`. Valores permitidos para `sensor`: `MODIS_TERRA`, `MODIS_AQUA` y `VIIRS_SNPP`. `period` usa `YYYY-MM`; para una ficha completa debe figurar en `available_periods_by_sensor[sensor]` y en `common_environmental_periods`. Para comparar los tres sensores en el mismo período, debe figurar en `common_analysis_periods`. Para una consulta de solo actividad basta con `available_periods_by_sensor[sensor]`. `metric` se restringe a nombres enumerados en el contrato, por ejemplo `activity_rate`, `fire_pixel_days_8_9`, `active_days`, `max_consecutive_active_days`, `observation_coverage` o `conditions_classification`. El frontend consulta un sensor a la vez; la comparación multisensor se presenta como series separadas. Si un mes no está disponible para una colección, la API debe indicarlo como no disponible, no rellenarlo con ceros.

Errores uniformes: `{"code":"INVALID_PARAMETER","detail":"Descripción clara del problema"}`. Usar `400` para parámetros inválidos, `404` para territorio o recurso inexistente, `422` para período no soportado y `500` para errores internos. No devolver trazas técnicas al navegador.

#### Forma de respuesta de la ficha territorial

```json
{
  "schema_version": "1.0",
  "territory": {
    "type": "province",
    "id": "CODIGO_TERRITORIAL",
    "name": "NOMBRE"
  },
  "period": { "id": "2026-09" },
  "sensor": "MODIS_TERRA",
  "activity": {
    "fire_pixel_days_8_9": null,
    "active_days": null,
    "max_consecutive_active_days": null,
    "activity_rate": null,
    "observation_coverage": null,
    "historical_anomaly": {
      "value": null,
      "status": "insufficient_baseline",
      "baseline_years": 0
    }
  },
  "environmental_conditions": {
    "classification": "not_evaluable",
    "factors": [],
    "missing_variables": []
  },
  "data_quality": { "status": "insufficient", "notes": [] },
  "provenance": {
    "source_products": [],
    "generated_at": null,
    "processing_version": null
  }
}
```

Los valores del ejemplo son marcadores de esquema, no resultados. `classification` admite `high`, `moderate`, `low`, `partial` y `not_evaluable`; las etiquetas visibles en español se mantienen en el frontend. Los valores desconocidos usan `null`; el frontend muestra «Sin datos», «No estimable» o «No evaluable», nunca convierte automáticamente `null` en cero. La evaluación ambiental no depende del sensor, aunque la ficha pueda mostrarla junto con la actividad del sensor seleccionado.

### 8.6. Responsabilidad del backend y del frontend

**Backend (Jhan):**

- Implementar FastAPI y las rutas definidas arriba.
- Validar parámetros (`type`, `id`, `period`, sensor y métrica solicitada).
- Leer los JSON/GeoJSON ya generados desde `data/processed/` y devolverlos con el formato pactado. El endpoint `activity` lee `activity_daily.json`; el endpoint `summary` combina `activity_summary.json` con `conditions_assessment.json`; el endpoint `sensor-comparison` lee `sensor_comparison.json`.
- Para una ficha completa, validar que `period` esté en `available_periods_by_sensor[sensor]` y `common_environmental_periods`. Para una comparación multisensor, exigir `common_analysis_periods`. Para consultas de solo actividad, validar únicamente `available_periods_by_sensor[sensor]`.
- No calcular sumas, tasas, anomalías o reglas; esos resultados ya vienen preparados por Tom.
- Manejar errores de forma consistente (`400` para parámetros inválidos, `404` para territorio/datos inexistentes y `500` para errores internos).
- Mantener fuera del frontend cualquier credencial o clave de servicios externos.
- No reimplementar las fórmulas de Tom ni ejecutar GEE por cada petición.

**Frontend (Sebastian):**

- Construir la interfaz React consumiendo exclusivamente `/api/v1`.
- Usar los IDs territoriales para enlazar geometrías, indicadores y fichas.
- Mostrar únicamente meses disponibles según `/metadata`.
- Implementar estados de carga, error, datos faltantes y cobertura insuficiente.
- Mostrar claramente sensor, período, unidades y fuente.
- Consultar `/sensor-comparison` para mostrar concordancia/discrepancia; no derivarla en React.
- No calcular tasas, anomalías ni categorías de reglas en componentes React.

**Desarrollo local:** backend en `http://localhost:8000`; frontend en `http://localhost:5173`. Configurar Vite para reenviar `/api` al backend durante desarrollo, o habilitar CORS solo para el origen local del frontend. En producción, preferir servir ambos bajo un mismo dominio o configurar explícitamente el origen permitido.

### 8.7. Chatbot

El chatbot queda fuera de la arquitectura crítica. Si se implementa, el frontend enviará al backend el identificador territorial, el período y la selección del usuario. El backend recuperará el mismo resumen que ya utiliza la ficha y lo entregará al servicio conversacional. La respuesta debe basarse únicamente en esos datos. Las credenciales del proveedor LLM permanecen en el backend. Si no hay tiempo para implementarlo de forma segura, se excluye sin afectar el MVP.

---

## 9. Interfaz y experiencia de usuario

La interfaz debe ser sobria y comprensible para usuarios técnicos y no técnicos, sin ocultar los datos originales.

### 9.1. Componentes principales

1. **Mapa:** selector de vista provincial/hidrográfica; coropleta de indicadores territoriales (incluida una capa de susceptibilidad con paleta ordinal accesible); filtros por sensor y mes. Los puntos de hotspots son una capa adicional si se exportan.
2. **Panel temporal:** calendario o serie temporal diaria/mensual de actividad.
3. **Panel de actividad:** tasa, persistencia, anomalía y cobertura.
4. **Panel de susceptibilidad contextual:** categoría del árbol de decisión, ruta de decisión, factores y modificadores activados y evidencia con unidades, fuente y período.
5. **Ficha de territorio:** resumen que separa claramente actividad térmica y susceptibilidad contextual a la expansión del fuego.

Aplicar divulgación progresiva: vista resumida con lenguaje sencillo y opción de expandir detalles técnicos, unidades, fuentes, resoluciones y supuestos.

### 9.2. Chatbot contextual (opcional)

El asistente recibe exclusivamente el contexto de la provincia/cuenca, período y sensor seleccionados. Puede responder:

- ¿Cómo cambió la actividad térmica en este período?
- ¿La actividad es inusual respecto del historial comparable?
- ¿Qué diferencias hay entre sensores?
- ¿Qué condiciones ambientales se observan?
- ¿Qué reglas se activaron y por qué?
- ¿Qué información falta para evaluar mejor el territorio?

El chatbot no debe:

- inventar valores, porcentajes, direcciones o velocidades;
- afirmar que un hotspot es un incendio confirmado;
- describir un frente de fuego si no existe cartografía temporal del perímetro;
- dar instrucciones de evacuación o sustituir a autoridades competentes.

Si no existe un backend seguro para un LLM, el chatbot se elimina o se sustituye por preguntas frecuentes y explicaciones basadas en plantillas. No se debe retrasar el MVP por construirlo.

---

## 10. Validación, calidad y limitaciones

### 10.1. Pruebas técnicas mínimas

- Verificar que `FireMask` y `QA` se decodifiquen por producto correctamente.
- Comprobar que nubes, datos faltantes y píxeles desconocidos no se contabilicen como no-detecciones.
- Verificar sumas y denominadores de las tasas con ejemplos manuales pequeños.
- Confirmar que la tasa sea nula/no estimable si no hay observaciones válidas; no reemplazar ausencia de observación por cero.
- Comprobar que los períodos de anomalía comparen ventanas equivalentes.
- Verificar que no se mezclen años/períodos ni niveles Pfafstetter.
- Revisar CRS, geometrías y agregación en bordes de polígonos.
- Mostrar en UI la resolución de origen de cada variable.

### 10.2. Validación retrospectiva

Si hay datos de áreas quemadas adecuados, revisar eventos históricos seleccionados y comparar las detecciones con las cicatrices cartografiadas. Documentar casos de coincidencia y discrepancia.

No se requiere una matriz de confusión para evaluar el árbol de reglas como sistema descriptivo. Una matriz de confusión sería pertinente si se definiera una variable objetivo etiquetada e independiente (por ejemplo, presencia/ausencia de expansión observada en una ventana futura) y se evaluara un clasificador contra esas etiquetas. Ese experimento queda fuera del MVP.

### 10.3. Limitaciones que deben hacerse visibles

- Los hotspots pueden corresponder a anomalías térmicas de distintos orígenes; no son perímetros.
- Las nubes y la geometría de observación pueden ocultar detecciones.
- MODIS y VIIRS tienen diferencias de sensor, horario, algoritmo y soporte espacial.
- Las condiciones ambientales cambian en el tiempo; la fecha de cada variable debe coincidir con el período analizado.
- ERA5-Land tiene resolución cercana a 11 km; no debe representarse como una medición a 1 km.
- MapBiomas de cobertura y NDVI no miden directamente la humedad o inflamabilidad del combustible.
- Pendiente no determina por sí sola la propagación.
- El sistema no calcula probabilidad de ignición, velocidad, dirección ni superficie futura quemada.
- La susceptibilidad es un índice cualitativo basado en reglas; no está validado contra expansión observada y sus umbrales son parámetros que pueden cambiar la categoría.
- Agua, orientación y antecedente térmico se muestran como contexto en el MVP y no modifican la categoría.

---

## 11. Organización del equipo y cinco ramas de GitHub

### 11.1. Reparto basado en las fortalezas y en la carga real

La presentación es una entrega importante, pero **no debe ser el único trabajo de Jean Pierrer ni empezar recién cuando los demás terminen**. Su rama debe generar insumos útiles desde el primer bloque y sostener una línea de trabajo paralela: preparar las referencias territoriales, revisar la calidad y coherencia de los resultados, definir criterios de aceptación y construir progresivamente la historia del proyecto.

| Integrante | Fortaleza considerada | Responsabilidad principal | Entregables concretos |
|---|---|---|---|
| **Angelo** | Es quien comprende y maneja Google Earth Engine. | Líder GEE y responsable técnico geoespacial: hotspots MODIS/VIIRS, QA, variables ambientales y agregación espacial. | Scripts GEE y exportaciones verificables con QA, fechas, unidades, resolución y metadatos. |
| **Tom** | Analítica, armonización multisensor, anomalías e interpretación de indicadores. | Módulo analítico: métricas históricas, comparación por sensor y motor de reglas. | Funciones Python probadas y `activity_summary.json` / `conditions_assessment.json`. |
| **Jhan** | Desarrollo backend e integración de servicios. | Arquitectura y backend: FastAPI, lectura de artefactos, validación, filtros, endpoints e integración. | API `/api/v1` ejecutable, modelos Pydantic y documentación OpenAPI. |
| **Sebastian** | UX/UI y desarrollo frontend. | Interfaz: mapa, filtros, calendario, gráficos, fichas y estados de carga/error. | Frontend React que consume la API definida, con un recorrido completo de usuario. |
| **Jean Pierrer** | Documentación, organización, propuesta de valor y comunicación del proyecto. | Datos territoriales de referencia, coordinación del contrato/documentación, QA de producto, validación de evidencia, presentación y demo. | Capas de referencia verificadas, fixtures y criterios de aceptación, registro de QA, deck actualizado progresivamente y guion de demo. |

**Cómo se complementan:** Angelo lidera GEE y no debe distraerse buscando, limpiando y documentando por sí solo todas las capas territoriales. Jean puede localizar y revisar las fuentes oficiales de límites provinciales y unidades hidrográficas, comprobar códigos, metadatos y nivel Pfafstetter, y entregar a Angelo un paquete de referencia ordenado. Angelo decide e implementa cómo incorporarlo en GEE. Tom define qué variables necesita el análisis y acuerda con Angelo cuáles son realmente viables. Jhan define e implementa la API sin duplicar el cálculo analítico. Sebastian trabaja contra el contrato y los fixtures. Jean acompaña la integración, detecta inconsistencias y convierte los resultados comprobados en una narrativa clara.

**Jean no necesita esperar a que existan resultados finales para trabajar:** desde T0 puede producir límites territoriales revisados, inventario de fuentes, contrato legible, fixtures, criterios de aceptación, estructura de presentación, contexto del problema y propuesta de valor. Más adelante reemplaza los espacios reservados de la presentación por resultados reales revisados con los responsables técnicos.

### 11.2. Las cinco ramas

Se mantiene una rama por frente funcional. Las carpetas están separadas para reducir conflictos; los contratos y cambios de integración se revisan en conjunto.

| Rama | Responsable | Carpeta principal | Alcance de la rama |
|---|---|---|---|
| `feature/gee-data-pipeline` | Angelo | `gee/` | Extracción/QA MODIS-VIIRS, contexto ambiental, agregación zonal y exportaciones. |
| `feature/analytics-engine` | Tom | `analytics/` | Métricas, anomalías, persistencia, comparación multisensor y reglas interpretables. |
| `feature/api-backend` | Jhan | `backend/` | FastAPI, modelos Pydantic, endpoints, filtros y lectura de archivos JSON/GeoJSON. |
| `feature/frontend-dashboard` | Sebastian | `frontend/` | Mapa, filtros, calendario, gráficos, fichas y estados de carga/error. |
| `feature/product-qa-demo` | Jean Pierrer | `data/reference/`, `contracts/`, `data/fixtures/`, `docs/`, `tests/acceptance/`, `presentation/` | Límites y referencias verificadas, fixtures, criterios de aceptación, control de calidad, documentación, narrativa, deck y demo. |

**Límite de responsabilidades para evitar conflictos:** Jean mantiene el contrato en lenguaje claro, los fixtures y el checklist de producto. Angelo es dueño del esquema de exportación GEE; Tom es dueño del esquema de salida analítica; Jhan es dueño del contrato REST y de los modelos Pydantic; Sebastian confirma que el contrato permite construir la interfaz. Cada cambio se revisa con el responsable de la etapa anterior y posterior. Ninguna persona cambia unilateralmente nombres, tipos o unidades.

### 11.3. Qué debe hacer cada persona

#### A. Jean Pierrer — `feature/product-qa-demo`

Su trabajo se divide en cuatro frentes que avanzan en paralelo. La presentación es uno de ellos, no su única tarea.

**Frente 1 — Fuentes y referencias territoriales (inicio inmediato; sin asumir trabajo GIS especializado)**

1. Localizar y descargar las capas oficiales o institucionales de límites provinciales y unidades hidrográficas para el área piloto.
2. Revisar la ficha de cada fuente: entidad responsable, enlace, fecha/versión, sistema de coordenadas declarado, campos de código/nombre y nivel Pfafstetter cuando corresponda.
3. Crear una tabla sencilla de inventario: nombre de la capa, fuente, fecha, formato, campos de identificación, cobertura geográfica y observaciones.
4. Entregar a Angelo los archivos originales y la ficha de cada capa. Angelo valida técnicamente las geometrías y decide cómo incorporarlas a GEE; Jean no necesita programar ni corregir geometrías.
5. Preparar, a partir de los atributos disponibles, una lista preliminar de `territory_id`, `territory_type`, `territory_name` y `pfafstetter_level` cuando exista. Angelo confirma los IDs definitivos después de revisar los datos en GEE.

**Frente 2 — Contrato, fixtures y criterios de aceptación (desde T0)**

1. Mantener `contracts/api-contract.md` y `contracts/data-dictionary.md` en lenguaje comprensible, describiendo rutas, parámetros, campos, unidades y estados sin datos.
2. Crear fixtures pequeños y claramente marcados como demostrativos: una provincia, una cuenca, dos sensores y varios días de actividad. Nunca presentarlos como observaciones reales.
3. Coordinar con Jhan los esquemas de respuesta; Jhan los implementa en Pydantic. Sebastian confirma que los datos permiten construir las vistas; Tom y Angelo validan el significado científico/técnico.
4. Preparar criterios de aceptación concretos: seleccionar territorio, filtrar fechas/sensor, ver actividad, abrir condiciones y revisar calidad de observación.
5. Mantener un registro corto de problemas con pasos para reproducirlos, responsable y prioridad.

**Frente 3 — QA del producto y verificación de evidencia (durante todo el desarrollo)**

1. Comprobar que el área, los nombres y los códigos de territorios coinciden en GEE, analítica, API y frontend.
2. Revisar que fechas, sensores, unidades, resolución y fuentes aparezcan correctamente en fichas y metadatos.
3. Contrastar una muestra de resultados con las exportaciones originales y, cuando la cobertura temporal lo permita, con FIRMS o productos de áreas quemadas. Este contraste es revisión de plausibilidad, no una validación completa de propagación.
4. Verificar que las etiquetas «sin datos», «no evaluable» y «cero detecciones» no se confundan.
5. Ejecutar el recorrido de usuario al integrar cada módulo y reportar errores a su responsable.

**Frente 4 — Presentación y demo progresivas (desde T0; completar al final)**

1. Crear desde el inicio la estructura del deck: problema, oportunidad, solución, fuentes, metodología, arquitectura, demo, resultados, limitaciones e impacto.
2. Investigar y redactar el contexto del problema y el valor diferencial con fuentes rastreables; no esperar a las métricas para preparar estas partes.
3. Preparar un diagrama sencillo de arquitectura y un flujo de demo que coincidan con la implementación real.
4. Mantener espacios reservados para resultados; solo insertar cifras y capturas cuando Angelo/Tom/Jhan las hayan verificado.
5. Capturar pantallas del producto, pedir a cada responsable una explicación breve de su módulo y convertirla en una diapositiva fiel a lo implementado.
6. Preparar un guion de exposición con tiempos, transición entre integrantes, preguntas previsibles y limitaciones explícitas.
7. Mantener un plan B de demo con fixtures etiquetados como datos de muestra por si falla la conexión o la API durante la presentación.
8. Mantener un registro de datasets, herramientas, librerías, código, textos, imágenes y recursos externos utilizados, con URL, versión, licencia/atribución y propósito.
9. Mantener un registro de uso de IA: herramienta, tarea realizada, componente afectado (código, datos, texto, imagen, audio o video) y revisión humana; preparar la declaración para la página del proyecto.

**No debe:** esperar pasivamente a que los demás terminen; inventar estadísticas para completar diapositivas; asumir tareas de programación/GIS para las que no fue asignado; implementar una segunda versión de GEE, fórmulas o API; cambiar contratos técnicos sin revisión; ni afirmar que el sistema predice o simula propagación.

#### B. Angelo — `feature/gee-data-pipeline`

1. Revisar con Jean las capas territoriales y elegir con el equipo el área piloto y nivel Pfafstetter.
2. Crear y probar primero un script mínimo en GEE para el área piloto y una ventana corta.
3. Procesar MOD14A1, MYD14A1 y VNP14A1; implementar lectura de `FireMask` y `QA` según el producto y documentar diferencias.
4. Separar detecciones clase 7 de clases 8–9 y calcular observaciones válidas/cobertura.
5. Incorporar `territories.geojson` y preparar `daily_activity.csv`; generar `hotspots.geojson` solo si el volumen lo permite.
6. Preparar `environmental_context.csv` por prioridad: cobertura MapBiomas; una o dos variables meteorológicas/precipitación o humedad del suelo de ERA5-Land; pendiente y orientación SRTM. Añadir MOD13A3 si hay tiempo; usar MOD13Q1 solo si se necesita mayor detalle y se puede resolver su composición temporal.
7. Registrar resolución, unidad, fechas, fuente y versión; comenzar por el área piloto, no por todo Perú.
8. Entregar a Tom un conjunto pequeño de datos reales con un ejemplo verificable.

**No debe:** calcular anomalías finales ni inventar el significado de categorías ambientales. Su salida son datos geoespaciales procesados y documentados.

#### C. Tom — `feature/analytics-engine`

1. Crear funciones Python para tasas, `fire_pixel_days_8_9`, días activos, persistencia y cobertura.
2. Implementar métricas por sensor y territorio, sin sumar conteos entre sensores.
3. Calcular anomalías con ventanas equivalentes y línea base suficiente; controlar MAD cero/casi cero y datos faltantes.
4. Definir con Angelo cuáles variables ambientales estarán realmente disponibles y sus unidades.
5. Implementar el árbol de decisión de susceptibilidad (nodos N0 a N3, modificadores y `decision_path`) con umbrales estacionales documentados y salida `not_evaluable` cuando falte información esencial.
6. Generar `activity_summary.json` y `conditions_assessment.json` siguiendo el contrato.
7. Añadir pruebas unitarias con datos de muestra y revisar manualmente uno o dos casos reales.
8. Dar a Jean una explicación breve de las fórmulas, los umbrales y las limitaciones para que la presentación no exagere las conclusiones.

**No debe:** modificar los datos fuente ni duplicar fórmulas en el frontend. Las reglas y métricas tienen una sola implementación.

#### D. Jhan — `feature/api-backend`

1. Crear el proyecto FastAPI con `/api/v1/health` y documentación OpenAPI automática.
2. Implementar los endpoints definidos en la sección 8.5 con modelos Pydantic.
3. Definir la validación de parámetros y respuestas conforme al contrato.
4. Leer los archivos procesados de la ruta configurada, sin depender de ubicaciones manuales distintas.
5. Aplicar filtros por territorio, período y sensor y devolver JSON/GeoJSON con la estructura acordada.
6. Manejar errores y valores faltantes consistentemente.
7. Entregar a Sebastian una URL local estable y ejemplos de respuesta coincidentes con los fixtures.
8. Integrar artefactos reales cuando Angelo y Tom los publiquen.

**No debe:** recalcular tasas, anomalías o reglas ni conectar el navegador directamente a GEE.

#### E. Sebastian — `feature/frontend-dashboard`

1. Crear la estructura React/Vite/TypeScript o conservar la existente si ya está creada.
2. Implementar la interfaz primero con fixtures del contrato.
3. Construir el mapa con selección provincial/hidrográfica y filtros de fecha y sensor.
4. Implementar calendario o gráfico de actividad y ficha territorial.
5. Separar visualmente actividad térmica histórica y condiciones territoriales.
6. Mostrar unidades, fechas, fuentes, cobertura y estados «Sin datos», «No estimable» y «No evaluable».
7. Cambiar de fixtures a la API real sin alterar nombres de campos ni incluir cálculos propios.
8. Reportar incompatibilidades con ejemplos concretos de request/response.

**No debe:** calcular anomalías, normalizar sensores o construir su propia clasificación de condiciones.

### 11.4. Contrato e integración: cómo evitar desvaríos

El contrato es el acuerdo técnico entre las cinco ramas. Sin él, es fácil que cada integrante use nombres, unidades, fechas o estructuras diferentes y que la integración se convierta en trabajo de último minuto.

**Reglas obligatorias:**

1. Jean Pierrer prepara el borrador legible y los fixtures. Angelo confirma los campos que puede exportar; Tom define las salidas analíticas; Jhan convierte el contrato REST en modelos Pydantic; Sebastian valida que baste para la interfaz. Se congela una versión mínima en `main` antes de que las ramas avancen en profundidad.
2. Se fija la versión inicial `schema_version: "1.0"` y el prefijo `/api/v1`.
3. Las fechas usan ISO `YYYY-MM-DD`; los campos usan `snake_case`; las unidades se incluyen en el nombre o diccionario (por ejemplo, `_mm`, `_ms`, `_c`, `_pct`).
4. Los identificadores territoriales siempre viajan junto con `territory_type`; no usar nombres de provincia como clave primaria.
5. Los conteos nunca mezclan sensores. Comparar sensores significa consultar y mostrar series separadas.
6. `null` significa dato no disponible/no estimable; `0` significa que el indicador sí fue calculado y su valor es cero.
7. Toda respuesta incluye período, sensor (cuando aplica) y procedencia/calidad.
8. Un cambio de estructura requiere actualizar contrato, fixtures, backend y frontend en el mismo PR o en PR coordinados. Nadie cambia el formato por su cuenta.

### 11.5. Secuencia de arranque sin bloquear al equipo

**Primeros 30 minutos:**

- Jean Pierrer abre el inventario territorial, prepara los fixtures, el borrador legible del contrato y el esqueleto del deck.
- Angelo comprueba colecciones, bandas, QA y geometrías candidatas en GEE; acuerda con Tom las columnas de entrada.
- Tom fija las fórmulas y campos mínimos de las salidas analíticas; prueba con fixtures.
- Jhan crea el esqueleto FastAPI y define los modelos de respuesta de la API con Sebastian.
- Sebastian crea las vistas con fixtures y confirma el recorrido principal.

**Congelar la primera versión del contrato:** Jean abre un PR breve con fixtures/documentación; Angelo, Tom, Jhan y Sebastian revisan únicamente los campos que les corresponden. Jhan integra los modelos API. El equipo fusiona ese PR a `main`; las cuatro ramas funcionales se crean o actualizan desde ese `main`. Después se evita cambiar el contrato salvo error crítico.

**Después del primer contrato congelado:**

1. Angelo exporta datos diarios por sensor y contexto ambiental mensual para el área piloto.
2. Tom produce resúmenes mensuales y evaluaciones por reglas según el esquema.
3. Jhan integra los archivos compactos de `data/processed/` en FastAPI.
4. Sebastian apunta el frontend a FastAPI y deja de usar los fixtures en el recorrido principal.
5. Jean ejecuta el checklist de aceptación, revisa la consistencia territorial y de fuentes, mantiene el registro de incidencias y actualiza el deck con resultados confirmados.

No se debe esperar a que GEE esté completo para empezar el backend o frontend. Tampoco se deben crear tres formatos de datos paralelos para «avanzar más rápido».

### 11.6. Git y revisión

- No hacer commits directos a `main`.
- Primero fusionar el PR del contrato inicial a `main`; después crear o actualizar las cinco ramas desde ese `main`.
- Cada integrante modifica principalmente su carpeta asignada. Angelo es dueño de `gee/`; Tom de `analytics/`; Jhan de `backend/`; Sebastian de `frontend/`; Jean de `data/reference/`, `data/fixtures/`, `contracts/`, `docs/`, `tests/acceptance/` y `presentation/`.
- Abrir PRs pequeños y frecuentes; incluir objetivo, archivos, prueba ejecutada y limitaciones.
- Antes de fusionar, actualizar la rama con el `main` vigente según el flujo que acuerde el equipo.
- Cada módulo mantiene sus propias pruebas; Jean prepara y coordina pruebas de aceptación de extremo a extremo, además de revisar referencias territoriales y mantener el paquete de demo.
- Fusionar primero los esqueletos funcionales, no esperar a que todo quede perfecto.
- Jhan coordina la integración API↔frontend; Angelo y Tom coordinan el traspaso GEE↔analítica; Jean mantiene el checklist y avisa de incompatibilidades, pero no aprueba por sí solo la semántica técnica de los datos.
- No subir credenciales, tokens, exportaciones grandes ni rásteres completos.

### 11.7. Criterio de terminado por módulo

| Módulo | Está listo cuando… |
|---|---|
| GEE — Angelo | Exporta un ejemplo real del área piloto con QA correcto y campos del contrato. |
| Analítica — Tom | Consume esos archivos y genera indicadores y reglas reproducibles con pruebas. |
| Backend — Jhan | Los endpoints devuelven los artefactos reales con estructura estable y errores controlados. |
| Frontend — Sebastian | Las vistas consumen la API real y se actualizan por territorio/período/sensor. |
| Producto/QA/demo — Jean Pierrer | Las referencias territoriales están documentadas; el recorrido supera el checklist; el deck refleja resultados verificados y existe un guion/demo alternativo reproducible. |

### 11.8. Chatbot y ampliaciones

No se crea una sexta rama ni se asigna un responsable exclusivo al chatbot antes de completar el flujo principal. Si el MVP está integrado, Jhan puede exponer el resumen territorial para una integración sencilla y Sebastian puede añadir el panel. Tom revisa que las respuestas se limiten a los resultados calculados; Jean prepara preguntas de demo. Si requiere un LLM externo, la clave queda en el backend. Si no hay tiempo para implementarlo con seguridad, se excluye.

---

## 12. Plan operativo para las 48 horas

Los bloques son relativos al inicio efectivo del hackathon (T0); se ajustarán al horario oficial del evento.

| Bloque | Trabajo coordinado | Condición de salida |
|---|---|---|
| T0–T+1 h | Jean: inventario y revisión inicial de límites/IDs, fixtures y esqueleto del deck; Angelo: prueba GEE, QA y disponibilidad de colecciones; Tom: métricas con fixtures; Jhan: FastAPI y contrato REST; Sebastian: interfaz con fixtures. El equipo fija región piloto, nivel hidrográfico y mes completo común. | Área piloto, período disponible, contrato v1, primera prueba GEE, API/UI arrancadas y presentación estructurada. |
| T+1–T+8 h | Angelo: pipeline de hotspots y primera capa ambiental del mes elegido. Tom: métricas y reglas. Jhan: endpoints con fixtures. Sebastian: coropleta/interfaz. Jean: entrega capas/IDs a Angelo, completa diccionario/fixtures, verifica licencias/atribución y redacta problema, solución y arquitectura. | Primeros datos reales, API navegable, UI funcional, referencias territoriales y narrativa inicial. |
| T+8–T+16 h | Angelo entrega tablas diarias y contexto del mes completo común; Tom genera resúmenes mensuales y reglas; Jhan integra artefactos reales; Sebastian consume la API. Jean verifica IDs, fechas, metadatos y coherencia de una muestra; actualiza fuentes/metodología del deck. | Ficha territorial real end-to-end y presentación con evidencia inicial. |
| T+16–T+24 h | Ajustar capas, comparación por sensor, cobertura y estados de datos faltantes. Jean ejecuta pruebas de aceptación, registra y asigna errores, prueba el recorrido como usuario y escribe resultados/limitaciones verificadas en el deck. | Flujo completo sobre el área piloto, sin mocks en el recorrido principal, y presentación actualizada. |
| T+24–T+32 h | Resolver bugs y mejorar visualizaciones. Jean revisa plausibilidad de resultados, consistencia de etiquetas, storyboard y guion de exposición; realiza un primer ensayo cronometrado. | Demo estable sobre área piloto, narrativa y tiempos de exposición probados. |
| T+32–T+40 h | Añadir comparación retrospectiva/áreas quemadas o chatbot solo si lo esencial está completo. Jean incorpora únicamente la ampliación implementada, termina diagramas/créditos y prepara preguntas previsibles y respuestas. | Ampliación funcional o exclusión documentada; deck casi final. |
| T+40–T+48 h | Congelar funciones. Jean cierra deck, créditos, fuentes, guion, orden de intervención y plan B con fixtures/capturas; coordina ensayo general. Todo el equipo corrige fallos críticos. | Demo reproducible, presentación fiel a lo construido y exposición ensayada. |

### 12.1. Regla de recorte de alcance

Si el equipo se retrasa, recortar en este orden:

1. Chatbot LLM.
2. Contraste con áreas quemadas.
3. Indicadores ambientales secundarios (NDVI/EVI, clases de pendiente detalladas y variables adicionales si ya están cobertura, humedad y viento).
4. Exportaciones adicionales, capa de hotspots individuales y visualizaciones ornamentales.

No recortar:

- calidad de observación;
- separación por sensor;
- normalización por observaciones válidas;
- distinción entre actividad térmica y condiciones territoriales;
- explicación de las reglas y limitaciones.

---

## 13. Criterios de aceptación del MVP

El MVP se considera demostrable si cumple todos los siguientes puntos:

- [ ] El usuario puede seleccionar al menos una provincia y una unidad hidrográfica del área piloto.
- [ ] El calendario se basa en datos NASA de MODIS y VIIRS; se identifica al menos un recurso NASA incluido específicamente en la pestaña Resources del reto y se registra en los créditos.
- [ ] Se muestran MODIS Terra, MODIS Aqua y VIIRS S-NPP por separado, o se declara explícitamente qué fuente no pudo cargarse.
- [ ] Existe una vista comparativa multisensor que muestra tasas/anomalías propias de cada fuente y no suma conteos brutos.
- [ ] Para los meses comunes se muestra si las señales son coincidentes, discrepantes, de fuente única o insuficientes.
- [ ] El mapa y los gráficos reaccionan al mes disponible y al sensor seleccionado.
- [ ] La tasa de actividad utiliza observaciones válidas como denominador.
- [ ] Nubes y falta de datos no se interpretan como ausencia de fuego.
- [ ] Se presenta cobertura/ calidad de observación.
- [ ] La anomalía compara el mismo mes calendario entre años y muestra la cantidad de años de referencia.
- [ ] La evaluación de condiciones territoriales muestra variables, unidades, fuentes y fecha.
- [ ] Las categorías del árbol de reglas explican los factores activados.
- [ ] La interfaz no presenta el resultado como predicción de propagación.
- [ ] Existe al menos un ejemplo real reproducible para el pitch.
- [ ] Los datos, las licencias/atribuciones y las versiones de las fuentes se documentan.
- [ ] El repositorio y los enlaces de demo/proyecto son públicos y funcionan sin solicitar permisos.
- [ ] La página de proyecto está redactada principalmente en inglés y se declara cualquier uso de IA.
- [ ] El demo de envío cumple el formato y extensión confirmados en la guía de entrega 2026 (ver sección 20).

---

## 14. Riesgos y mitigaciones

| Riesgo | Consecuencia | Mitigación |
|---|---|---|
| Tiempo/quotas de GEE | No se completan exportaciones extensas. | Procesar área piloto y ventana reducida primero; guardar tareas y resultados intermedios. |
| QA interpretado incorrectamente | Tasas y conteos sesgados. | Funciones por producto, test con clases conocidas y revisión de bandas. |
| Nubes/ausencia de observación | Falsos ceros. | Denominador válido, cobertura explícita y estado «sin datos». |
| Diferencias MODIS/VIIRS | Comparaciones inválidas de conteos brutos. | Indicadores normalizados y resultados por sensor. |
| Diferentes resoluciones ambientales | Sensación de precisión espacial falsa. | Mostrar resolución de origen y agregar por polígono. |
| Umbrales arbitrarios de reglas | Clasificación difícil de defender. | Percentiles locales/estacionales, parámetros explícitos y explicación de reglas. |
| Alcance excesivo | MVP incompleto. | Área piloto acotada, fixtures, entregables mínimos y recorte por prioridad. |
| Chatbot inventa resultados | Información engañosa. | Restringirlo a datos estructurados y permitir «no hay información suficiente». |
| Exceso de conflictos Git | Pérdida de tiempo integrando. | Contrato temprano, ownership de carpetas y PR frecuentes. |

---

## 15. Presentación del proyecto

La comunicación debe demostrar una solución al reto, no enumerar tecnologías. La historia recomendada es: **los registros están repartidos entre sensores → no se deben comparar sin controlar sus diferencias → McHanaq construye un calendario territorial trazable → ese calendario permite reconocer patrones y períodos inusuales → el contexto ambiental ayuda a interpretar, sin prometer predicciones**.

Jean Pierrer lidera el deck y el relato, pero cada responsable valida sus afirmaciones técnicas. Las cifras y capturas se incorporan únicamente después de ser confirmadas por quien produce los datos o cálculos.

### Descripción corta

**McHanaq convierte observaciones MODIS y VIIRS en un calendario territorial de actividad térmica, con comparación multisensor, patrones estacionales, anomalías y contexto ambiental para explorar períodos críticos en provincias y cuencas del Perú.**

### Mensaje central del pitch

No basta con mostrar puntos de calor. Para estudiar cómo se distribuye la actividad térmica en el tiempo, necesitamos saber qué observó cada sensor, cuánta superficie pudo observar, qué tan inusual fue la actividad para esa época y dónde coinciden o discrepan las fuentes. McHanaq organiza esa evidencia en un calendario territorial; el contexto ambiental añade una capa de interpretación, sin sustituir la observación ni predecir la propagación.

### Estructura narrativa sugerida para una presentación de hasta siete diapositivas

1. **Problema y reto:** explicar la fragmentación de los registros MODIS/VIIRS y la necesidad de un calendario de actividad térmica para un área de interés.
2. **Por qué no basta un mapa de hotspots:** diferencias entre sensores, cobertura de observación, nubes y confusión entre detección y perímetro.
3. **Qué hace McHanaq:** mostrar el flujo de armonización, fuentes NASA utilizadas y la arquitectura desde GEE hasta la aplicación.
4. **Demo del calendario:** seleccionar una provincia/cuenca, un período y consultar la serie temporal.
5. **Evidencia multisensor:** comparar tasas/anomalías y mostrar concordancia o discrepancia con cobertura y calidad explícitas.
6. **Contexto territorial e interpretación:** mostrar variables ambientales disponibles, reglas transparentes y límites; no llamarlo predicción de propagación.
7. **Impacto, límites y continuidad:** usuarios potenciales, utilidad para identificar períodos críticos y orientar monitoreo/estudios, resultados reales del piloto, limitaciones y siguiente paso.

Si la guía de entrega 2026 admite como alternativa un video de hasta 30 segundos, el equipo puede escoger ese formato en lugar de la presentación de hasta siete diapositivas. No confundir este demo de la página global con la duración de la exposición presencial: el tiempo de pitch local debe confirmarse con el organizador del evento.

### Demo funcional

1. Seleccionar un territorio que tenga cobertura real y una historia útil para ilustrar.
2. Mostrar el calendario diario y el resumen mensual de actividad.
3. Comparar al menos dos sensores para el mismo período y explicar por qué las tasas se muestran por separado.
4. Señalar una anomalía o patrón estacional con su línea base y cobertura.
5. Abrir el contexto ambiental y señalar qué factores están disponibles y qué no puede concluirse.
6. Cerrar con una utilidad concreta: reconocer períodos históricamente críticos y apoyar la planificación del monitoreo, no emitir una alerta operativa.

**Evitar en el pitch:** listas extensas de librerías, presentar el chatbot como innovación principal, decir que McHanaq «predice incendios», mostrar fixtures como datos reales, atribuir hectáreas quemadas a conteos de hotspots o afirmar que la plataforma ya reduce daños/tiempos sin una evaluación que lo demuestre.

---

## 16. Decisiones pendientes antes de iniciar el procesamiento completo

Estas decisiones no contradicen el enfoque ya aprobado, pero deben cerrarse al inicio del hackathon:

1. Región piloto exacta.
2. Nivel Pfafstetter uniforme para la vista hidrográfica.
3. Mes completo de demostración, elegido según la disponibilidad temporal común de las fuentes, y número de años de línea base.
4. Si el indicador principal incluirá solo clases 8–9 y qué comparación secundaria se mostrará con clases 7–9 (recomendación: sí, separar ambas).
5. Umbrales estacionales de las reglas después de inspeccionar distribuciones.
6. Variables ambientales que realmente podrán procesarse dentro del tiempo.
7. Confirmar en los primeros minutos si el repositorio ya contiene un stack funcional. Si no, utilizar el stack de referencia definido en la sección 8: FastAPI + React/Vite + TypeScript.
8. Parámetros del árbol de decisión: `umbral_veg`, `umbral_pend`, percentiles (p25/p75), regla de sequedad y mínimo de años de referencia.


---

## 17. Glosario breve para leer la guía

| Término | Explicación sencilla |
|---|---|
| Hotspot / foco térmico | Píxel donde el sensor detectó una anomalía térmica compatible con actividad de fuego; no equivale automáticamente a un incendio confirmado ni a su perímetro. |
| GEE | Google Earth Engine: plataforma donde se consultan y procesan colecciones de imágenes y datos geoespaciales. |
| QA | Información de calidad del producto que ayuda a decidir qué píxeles se pueden usar y cuáles deben excluirse. |
| Observación válida | Píxel terrestre con información utilizable para el análisis; no significa que haya fuego. |
| Tasa de actividad | Proporción de observaciones válidas que registraron detección durante el período. |
| Anomalía histórica | Diferencia entre la actividad del período actual y la actividad habitual en períodos comparables del historial. |
| GeoJSON | Formato de archivo para intercambiar geometrías y atributos de puntos, líneas o polígonos. |
| API | Interfaz por la que el frontend solicita datos al backend con rutas y formatos acordados. |
| Fixture | Archivo pequeño de datos de ejemplo para desarrollar y probar antes de disponer de exportaciones reales. |
| Backend | Parte del sistema que recibe solicitudes, valida parámetros y entrega los datos a la interfaz. |
| Frontend | Parte que ve y utiliza la persona: mapa, filtros, gráficos y fichas. |
| Pfafstetter | Método jerárquico para codificar y organizar unidades hidrográficas. |
| Persistencia (MVP) | Mayor número de días consecutivos en que el territorio registró al menos una detección; no es duración de un incendio individual. |
| Período disponible | Mes completo para el que las fuentes necesarias tienen datos procesados y compatibles. |
| Susceptibilidad contextual | Categoría cualitativa (alta, moderada, baja) que indica qué tan favorables son las condiciones observadas para que un fuego, si ocurriera, se extienda; no es una probabilidad ni una predicción. |
| Árbol de decisión (reglas) | Secuencia de preguntas sí/no con umbrales explícitos que produce una categoría y deja registrada su ruta; no es un modelo entrenado. |

**En una frase:** GEE prepara los datos; analítica les da significado mediante cálculos; la API los entrega; el frontend los muestra.

---

## 18. Fuentes y documentación técnica

Consultar los catálogos antes de ejecutar el procesamiento, porque la disponibilidad de las colecciones cambia. En la presentación se deben conservar los créditos de cada dataset. Para MapBiomas, usar la atribución indicada por la colección (CC BY 4.0). Para ERA5-Land/Copernicus, incluir el reconocimiento recomendado por el catálogo y su descargo de responsabilidad.

1. NASA FIRMS — focos activos/anomalías térmicas y advertencias de interpretación: https://firms.modaps.eosdis.nasa.gov/map/
2. GEE — MOD14A1.061 Terra, diario 1 km, bandas `FireMask` y `QA`: https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD14A1
3. GEE — MYD14A1.061 Aqua, diario 1 km: https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MYD14A1
4. GEE — VNP14A1.002 VIIRS S-NPP, diario 1 km SIN, bandas `FireMask` y `QA`: https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP14A1
5. GEE — MOD13A3.061, NDVI/EVI mensual a 1 km y `DetailedQA`: https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD13A3
6. GEE — MOD13Q1.061, alternativa NDVI/EVI a 250 m cada 16 días: https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD13Q1
7. MapBiomas Perú — Cobertura y uso del suelo, Colección 4 (1985–2025), 30 m y asset GEE: https://peru.mapbiomas.org/iniciativas-y-productos/cobertura-y-uso-del-suelo/cobertura/
8. MapBiomas Perú — descargas de colecciones y archivos: https://peru.mapbiomas.org/descargas/mapas-de-las-colecciones/
9. MapBiomas Perú — lanzamiento de la Colección 2 de Fuego (10/11/2026; áreas quemadas anuales 1990–2025, Landsat 30 m): https://peru.mapbiomas.org/2026/11/11/39-millones-de-hectareas-quemadas-desde-1990-mapbiomas-presenta-36-anos-de-mapas-de-fuego-en-peru/
10. MapBiomas Perú — descarga/acceso a MapBiomas Fuego; comprobar qué capas están habilitadas para la Colección 2: https://peru.mapbiomas.org/descargas/mapbiomas-fuego/
11. MapBiomas Perú — Monitor del Fuego (cartografía mensual reciente de 2025–2026; comprobar mes y descarga): https://peru.mapbiomas.org/iniciativas-y-productos/fuego/monitor-de-fuego/
12. GEE — ERA5-Land Hourly (variables, bandas, escala espacial, fecha disponible y convención de acumulados): https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_LAND_HOURLY
13. GEE — MCD64A1.061, áreas quemadas mensuales a 500 m: https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MCD64A1
14. GEE — SRTM 30 m: https://developers.google.com/earth-engine/datasets/catalog/USGS_SRTMGL1_003
15. INEI — Infraestructura de Datos Espaciales y límites administrativos: https://ide.inei.gob.pe/
16. GeoIDEP — metadatos de Unidades Hidrográficas ANA/Pfafstetter: https://catalogo.geoidep.gob.pe/metadatos/srv/api/records/7479fd98-28a4-4a33-8ee8-01b55dfc1108
17. ANA — memoria descriptiva de delimitación y codificación de unidades hidrográficas del Perú: https://repositorio.ana.gob.pe/bitstream/handle/20.500.12543/597/ANA0000383.pdf?isAllowed=y&sequence=1
18. GEE — guía para exportación de tablas y vectores: https://developers.google.com/earth-engine/guides/exporting_tables
19. NASA Space Apps Challenge 2026 — enunciado oficial del reto “Harmonization of MODIS and VIIRS Hot Spots”: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
20. NASA Space Apps — Judging & Awards Guide (página de recursos 2026 indicada por la organización): https://www.spaceappschallenge.org/resources/judging-awards-guide/
21. NASA Space Apps — guía detallada de juzgamiento 2025 (referencia disponible para descriptores 1–5; comprobar versión 2026): https://spaceapps-v2-staging.s3.amazonaws.com/media/documents/Final_Space_Apps_2025_Judging_Guidelines_for_web.pdf
22. NASA Space Apps — criterios de evaluación vigentes que aparecen en páginas oficiales de eventos 2026: https://www.spaceappschallenge.org/2026/local-events/ajmer/
23. NASA Space Apps GO Team — obligación de usar al menos un recurso NASA incluido en los recursos del reto y citar todas las fuentes: https://github.com/nasa/spaceapps/discussions/1827
24. NASA Space Apps GO Team — política sobre uso y declaración de IA: https://github.com/nasa/spaceapps/discussions/1849
25. NASA Space Apps — respuesta aceptada en foro comunitario sobre demo, accesibilidad de enlaces, idioma y fecha límite 2026 (confirmar en guía oficial): https://github.com/nasa/spaceapps/discussions/1973
26. NASA FIRMS — archivo histórico de focos activos y coberturas de los productos: https://firms.modaps.eosdis.nasa.gov/download/
27. NASA FIRMS — productos activos, formatos de descarga y servicios: https://firms.modaps.eosdis.nasa.gov/content/active_fire/
28. NASA FIRMS — descripción general y disponibilidad de datos NRT: https://firms.modaps.eosdis.nasa.gov/
29. NASA LP DAAC — especificación del producto VNP14A1: https://ladsweb.modaps.eosdis.nasa.gov/filespec/VIIRS/1/VNP14A1

---

## 19. Lectura estratégica de la rúbrica NASA Space Apps

### 19.1. Qué evalúan y cómo leer la guía

El proceso oficial utiliza cinco criterios: **Impact, Creativity, Validity, Relevance y Presentation**. Las páginas oficiales de eventos locales 2026 mantienen esos cinco criterios. La guía detallada pública que se pudo consultar para describir los niveles de desempeño es la guía oficial de juzgamiento 2025: propone una valoración holística de 1 a 5 y advierte que una calificación 5 debe reservarse para proyectos verdaderamente ejemplares. No se deben inventar ponderaciones porcentuales si la guía 2026 o el evento local no las especifican.

**Nota de verificación:** el enlace 2026 `https://www.spaceappschallenge.org/resources/judging-awards-guide/` es el punto de referencia que debe revisar el equipo, pero durante esta investigación el contenido de esa página no pudo recuperarse por un error 502. Por transparencia, los descriptores detallados de 1/3/5 incluidos en este análisis se contrastaron con el PDF oficial 2025 y con las páginas oficiales 2026 que mantienen los cinco criterios. Antes del envío, revisar la versión 2026 directamente desde la página de recursos y actualizar cualquier requisito que haya cambiado.

La guía detallada de 2025 también separa una **comprobación de requisitos mínimos** de la puntuación de los cinco criterios: si un proyecto no cumple los mínimos, la guía indica asignarle 1 y no continuar con la evaluación. Por ello, elegibilidad y entrega no son detalles administrativos; son una puerta de entrada.

### 19.2. Evaluación de McHanaq criterio por criterio

| Criterio | Qué busca el jurado | Estado actual de McHanaq | Riesgo que debemos corregir | Evidencia que conviene mostrar |
|---|---|---|---|---|
| **Relevance** | Responder directa y completamente al reto; que NASA data sea parte esencial de la solución, no decoración. | Buen encaje potencial: MODIS/VIIRS, actividad histórica, área de interés y calendario. | El componente de susceptibilidad contextual a la expansión del fuego puede desviar el proyecto hacia una evaluación de riesgo que no es el producto central solicitado. También sería débil mostrar sensores solo como filtros separados sin una lectura armonizada. | Calendario funcionando con datos NASA de ambos sensores; mismo territorio/período; denominadores de observación; comparación de anomalías y estado de concordancia. Identificar al menos un dataset de la pestaña Resources del reto. |
| **Validity** | Solidez científica, viabilidad técnica, resultados que hacen lo que prometen y facilidad de uso. | El diseño es prudente: separa sensores, reconoce QA, cobertura, anomalías y limitaciones. | «Armonización» puede sonar a calibración completa, aunque el método solo normalice y compare señales. Las condiciones ambientales pueden mezclar escalas y fechas distintas. Reglas sin datos suficientes pueden parecer arbitrarias. | Diagrama reproducible del pipeline; descripción de QA por producto; pruebas de cálculo manual; período común; unidades, resoluciones, cobertura; línea base de anomalía; salida `not_evaluable`; limitaciones visibles. |
| **Creativity** | Originalidad o mejora significativa frente a soluciones existentes. | La combinación de calendario, escala territorial y contexto tiene potencial. | Un mapa de hotspots, un dashboard, un chatbot o sumar datasets no constituyen por sí mismos innovación. FIRMS ya ofrece mapa, datos recientes y descarga histórica. | Diferenciador concreto: calendario territorial con normalización por observación válida, anomalías estacionales por sensor y lectura explícita de coincidencias/discrepancias; comparación de vista administrativa e hidrográfica; trazabilidad de cada señal. |
| **Impact** | Importancia del problema, calidad y alcance del beneficio, personas o sectores que pueden usarlo. | El problema es relevante para monitoreo, gestión territorial y estudio de incendios. | Decir «salvar vidas», «prevenir incendios» o «mejorar respuesta de emergencia» sin integración operativa ni usuarios validados sería una promesa excesiva. Un piloto nacional incompleto diluye impacto. | Un caso real de provincia/cuenca; explicar qué decisión de monitoreo/planificación puede informar; identificar usuarios potenciales (gestores de territorio, equipos de monitoreo, investigadores y docentes); cuantificar período, sensores, unidades, cobertura y hallazgo real. No inventar adopción ni impactos. |
| **Presentation** | Claridad, estructura, relato y capacidad de comunicar problema, método, importancia y demo. | Jean Pierrer puede construir el relato desde el inicio, mientras cada responsable verifica sus aportes. | Demasiados tecnicismos, alcance exagerado, demo que solo muestra pantallas o cifras sin procedencia, y no explicar qué significa «armonizar». | Una historia de usuario de principio a fin; capturas reales; explicación de un hallazgo; visualización de calidad y discrepancia; guion corto; demo accesible; fuentes y herramientas correctamente declaradas. |

### 19.3. Correcciones prioritarias para destacar

**Prioridad crítica — Relevance**

1. Abrir la aplicación con el calendario de actividad térmica, no con un índice de propagación.
2. Hacer visible que se están usando MODIS y VIIRS en el mismo análisis territorial y temporal. Si solo existe un botón para cambiar de sensor, añadir una vista comparativa simultánea.
3. Comprobar la pestaña `Resources` del reto y marcar cuál de sus recursos NASA se integró. La respuesta del equipo organizador indica que, para ser elegible a Global Awards, debe usarse al menos una fuente NASA incluida específicamente en los recursos de ese desafío; todas las fuentes empleadas deben citarse.
4. Mantener las susceptibilidad contextual a la expansión del fuego como contexto secundario. No quitarlo, pero no permitir que sustituya al calendario que pide el reto.

**Prioridad crítica — Validity**

1. Describir la armonización con precisión: armonización semántica, temporal, de calidad y de indicadores estadísticos; no afirmar calibración radiométrica ni equivalencia perfecta entre sensores.
2. Mostrar para cada sensor sus propias tasas, cobertura y anomalías; nunca sumar detecciones brutas como si fueran eventos equivalentes.
3. Incluir un estado de concordancia multisensor, construido a partir de anomalías/umbrales estacionales propios por sensor: coincidente, discrepante, fuente única o insuficiente. No producir un promedio multisensor opaco.
4. Mantener alineación temporal. No cruzar un mes de hotspots con variables ambientales de otro mes por conveniencia de disponibilidad. Si el dato ambiental tiene otra fecha, mostrarlo como referencia histórica, no como condición contemporánea.
5. Incorporar al menos una prueba reproducible: tomar un territorio/mes, mostrar valores de entrada, cálculo de tasa, cobertura, anomalía y salida de regla.
6. En la evaluación ambiental, presentar fuente, variable, unidad, período y resolución; si falta un bloque, usar «parcial» o «no evaluable».

**Prioridad alta — Creativity**

1. Explicar el vacío que McHanaq aborda frente a FIRMS: FIRMS ya permite ver focos recientes y descargar registros históricos; McHanaq debe demostrar la síntesis territorial y estacional, la normalización por oportunidad de observación y la lectura transparente de desacuerdos entre sensores.
2. Diseñar una interacción que solo McHanaq esté intentando ofrecer en este reto: elegir provincia/cuenca → ver calendario → consultar anomalía y cobertura → comparar sensores → entender la condición ambiental.
3. Preferir una función analítica concreta y defendible a varias funciones superficiales. El chatbot es complementario; no es el diferenciador.

**Prioridad alta — Impact**

1. Definir el usuario y el uso de forma específica: una persona que analiza el territorio puede identificar períodos con más actividad histórica y zonas con señales inusuales para priorizar revisión o monitoreo.
2. Escoger el área piloto por calidad y valor demostrativo: datos disponibles, estacionalidad comprensible y posibilidad de explicar un hallazgo. No escogerla solo porque sea conocida.
3. Presentar el alcance real: herramienta de exploración y planificación basada en datos históricos; no sistema desplegado de alertas, despacho o respuesta de emergencia.
4. Medir el producto con cifras reales: años/meses procesados, sensores, territorios consultables, cobertura válida y una comparación concreta. No convertir estas métricas técnicas en impactos sociales que no se han medido.

**Prioridad alta — Presentation**

1. Contar un solo caso real en lugar de enumerar todas las funcionalidades.
2. Explicar «qué se veía antes» (puntos y fuentes separadas) y «qué permite ver McHanaq» (calendario territorial, anomalía, calidad y comparación).
3. Mostrar la pantalla real y un hallazgo verificable; no solo el diagrama de arquitectura.
4. Explicar límites con seguridad: un hotspot no es perímetro; la falta de detección no significa necesariamente ausencia de fuego; la evaluación ambiental no predice el avance. Reconocer límites aumenta credibilidad si se explica qué decisión sí puede apoyar el producto.

### 19.4. Diferenciación frente a herramientas existentes

NASA FIRMS ya permite visualizar focos activos recientes y descargar registros históricos en CSV, JSON y shapefile; además mantiene productos MODIS y VIIRS con diferentes resoluciones y coberturas. Por tanto, McHanaq no debe presentarse como «el primer mapa que junta MODIS y VIIRS» ni como un sustituto de FIRMS.

La oportunidad defendible es una capa de análisis territorial orientada al calendario: (a) resumir actividad por provincias y unidades hidrográficas; (b) normalizar por observaciones válidas; (c) comparar anomalías estacionales por sensor; (d) hacer explícita la calidad y cobertura; y (e) mostrar concordancia o discrepancia sin ocultar diferencias instrumentales. El contexto ambiental añade interpretación, pero no cambia la naturaleza de los hotspots.

**Frase de diferenciación recomendada:** «FIRMS permite consultar dónde se detectan focos activos; McHanaq organiza registros MODIS y VIIRS en un calendario histórico por territorio, muestra cuándo la actividad se aparta de su patrón estacional y deja visible la calidad y concordancia de las observaciones para apoyar la planificación del monitoreo». Esta frase describe una propuesta de valor; no afirma exclusividad absoluta frente a todas las plataformas existentes.

### 19.5. Encaje potencial con premios globales

Las categorías globales publicadas para 2025 incluían Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology y Local Impact. No asumir que todas las categorías o sus reglas serán idénticas en 2026 hasta verificar la guía de este año.

Por la naturaleza del proyecto, los encajes más defendibles serían: **Best Use of Data** (si la armonización genera una lectura realmente útil de datos abiertos); **Best Use of Science** (si las decisiones de QA, normalización, anomalías y limitaciones están bien justificadas); y **Local Impact** (si el piloto peruano muestra una necesidad local concreta y un usuario plausible). Best Use of Technology o Best Storytelling podrían ser secundarios, pero no conviene añadir complejidad solo para perseguir una categoría.

---

## 20. Elegibilidad, entrega y transparencia

### 20.1. Condiciones que deben comprobarse antes de enviar

La guía detallada de juzgamiento 2025 establecía como requisitos mínimos: proyecto principalmente en inglés; respuesta al reto seleccionado; demo de no más de siete diapositivas (incluyendo portada/cierre) o video de hasta 30 segundos; enlaces públicos sin contraseña; uso de datos/recursos abiertos NASA; y declaración del uso de IA. Una respuesta aceptada en el foro de soporte comunitario del 12/11/2026 (no publicada por una cuenta identificada como GO Team) también menciona demo de hasta siete diapositivas o video de 30 segundos, enlaces públicos, contenido en inglés y envío antes de las 23:59 del 15/11 según hora local. Tratar estos detalles como provisionales hasta contrastarlos con la guía oficial 2026. Revisar la guía 2026 enlazada en Recursos antes de confirmar estos límites como definitivos.

**Lista de verificación para Jean Pierrer y todo el equipo:**

- [ ] La página del proyecto está redactada principalmente en inglés.
- [ ] El resumen indica el reto elegido y describe el calendario MODIS/VIIRS como núcleo.
- [ ] Se usó al menos un recurso NASA incluido en la pestaña `Resources` de este reto y se identificó expresamente en la entrega.
- [ ] Se citaron todos los datos, herramientas, librerías, código, textos, imágenes, videos y recursos externos utilizados; no basta con citar únicamente NASA.
- [ ] La demo cumple el formato que indique la guía 2026: hasta siete diapositivas o video de hasta 30 segundos, según corresponda.
- [ ] El único enlace de demo y el enlace del proyecto/repositorio abren en una ventana privada, sin login ni solicitud de permisos.
- [ ] Los README, instrucciones de ejecución y licencias/atribuciones necesarias están disponibles.
- [ ] Se declaró el uso de IA y se explica dónde y cómo se utilizó.
- [ ] Ningún contenido generado con IA usa, contiene o modifica logos, banderas u otros elementos de identidad de NASA.
- [ ] Si se usaron imágenes o videos generados por IA, llevan una marca visible que los identifica como generados por IA; si se usó audio generado, se declara en la descripción/metadatos; si se usó IA en código o datos, se declara en la descripción y metadatos del proyecto.
- [ ] El proyecto se envía desde la página del equipo antes del cierre oficial: 15 de noviembre de 2026, 23:59 hora local del evento.

### 20.2. Uso de IA: transparencia, no ocultamiento

La IA está permitida como herramienta de apoyo, pero el equipo debe declarar dónde y cómo se utilizó. Mantener un `AI_USAGE.md` con: herramienta/modelo, tarea, archivos o componentes afectados, tipo de intervención (sugerencia, generación, revisión o depuración) y revisión humana realizada. No afirmar que un módulo fue desarrollado íntegramente por el equipo si la IA generó partes sustanciales del código o contenido.

La declaración no sustituye la revisión: el equipo sigue siendo responsable de la corrección científica, los datos, el código y la presentación. No utilizar imágenes generadas para simular mapas, datos satelitales o resultados; las capturas de la aplicación deben provenir del prototipo real.

### 20.3. Regla de trabajo previo al hackathon

La respuesta del equipo organizador en el foro oficial advierte que empezar a trabajar en el proyecto antes de la apertura puede llevar a descalificación. Antes del inicio se permite elegir el reto, leer sus recursos, investigar el tema y formar el equipo; el desarrollo del proyecto debe empezar en el horario oficial del hackathon. Para este evento, la página 2026 indica que la entrega abre el sábado 14 a las 09:00 y cierra el domingo 15 a las 23:59 en hora local. Por prudencia, no adelantar código, prototipo, procesamiento de datos ni entregables sustantivos de McHanaq; iniciar el trabajo del proyecto a las 09:00 del 14/11.

---

## 21. Cierre

McHanaq debe priorizar una cadena de valor corta y comprobable: **observar → controlar calidad → armonizar → resumir por mes y territorio → contextualizar → explicar**. La calidad del MVP no se medirá por la cantidad de variables o modelos anunciados, sino por la consistencia de sus datos, la sincronización temporal entre fuentes, la trazabilidad de sus cálculos y la capacidad de explicar qué se sabe, qué no se sabe y por qué.

### Cambios de la versión 1.7

- El componente ambiental pasa a ser un **árbol de decisión de susceptibilidad contextual a la expansión del fuego** (nodos N0 a N3, categorías `high`, `moderate`, `low`, `partial`, `not_evaluable`, con `decision_path` y `modifiers`). Reemplaza a las categorías anteriores (`favorable`, `mixed`, `less_favorable`).
- Se mantiene fuera del alcance la predicción de ignición, la probabilidad, la simulación del frente y cualquier modelo de ML. La susceptibilidad se comunica como índice cualitativo y no validado.
- Se incorporan agua y humedales (MapBiomas), orientación (SRTM) y el antecedente térmico MODIS/VIIRS como modificadores informativos.
- Se actualizan los contratos de `conditions_assessment.json`, la interfaz y las responsabilidades de Angelo y Tom.

### Cambios de la versión 1.6

- Se actualizó el producto de vegetación preferido a MOD13A3 mensual de 1 km; MOD13Q1 queda como alternativa de 250 m/16 días.
- Se corrigió el snapshot de disponibilidad de VNP14A1 y ERA5-Land con los catálogos revisados el 13/11/2026; septiembre de 2026 queda como candidato provisional, sujeto a verificación de un mes completo en GEE.
- Se eliminó la afirmación rígida de un retraso fijo de tres meses para ERA5-Land; se exige comprobar la última fecha disponible directamente.
- Se aclaró el uso de `common_analysis_periods` solo para comparación multisensor y la validación por sensor para fichas individuales.
- Se explicitó que MCD64A1 no es una referencia completamente independiente porque su algoritmo usa observaciones de incendios activos MODIS.
- Se unificó `data/fixtures/` en la estructura del repositorio y en la rama de Jean Pierrer.
- Se depuró la bibliografía, se añadieron ejemplos compactos para los fixtures y se alinearon los campos `fire_pixel_days_8_9` de analítica, API y frontend.
- Se reordenó el producto para dejar el calendario armonizado MODIS/VIIRS como núcleo del reto y el contexto ambiental como capa complementaria.
- Se añadió una salida de concordancia multisensor que conserva los indicadores de cada fuente y evita sumar conteos brutos.
- Se incorporó el análisis de la rúbrica Impact, Creativity, Validity, Relevance y Presentation, con riesgos y evidencias concretas para McHanaq.
- Se añadió una lista de elegibilidad y entrega: recurso NASA del reto, fuentes completas, acceso público, demo, idioma y declaración de IA.
- Se incorporó el contraste con NASA FIRMS para precisar la diferenciación y evitar afirmar que McHanaq es un simple visor de hotspots.
- Se añadió `sensor_comparison.json` y su endpoint para evitar que backend o frontend calculen por su cuenta la concordancia multisensor.
- Se retiró la comparación multisensor de la lista de ampliaciones porque ya es parte esencial del MVP.
- Se precisó que la respuesta comunitaria del foro sobre la demo no es una publicación oficial de GO Team y debe confirmarse con la guía 2026.
- Se corrigió la numeración de la bibliografía.
