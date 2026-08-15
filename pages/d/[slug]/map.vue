<template>
  <div class="page">
    <SiteHeader />

    <main v-if="d" class="stage">
      <div class="bar">
        <div class="who">
          <NuxtLink class="back mono" :to="`/d/${d.slug}`">← {{ d.title }}</NuxtLink>
          <span class="count mono nums">
            {{ shown.toLocaleString() }}<template v-if="shown < total"> of {{ total.toLocaleString() }}</template>
            features
          </span>
        </div>
        <div class="acts">
          <button
            v-if="shown < total && !loading"
            class="ghost mono"
            type="button"
            @click="loadAll"
          >Load all {{ total.toLocaleString() }}</button>
          <span v-if="loading" class="mono busy">Loading {{ total.toLocaleString() }} features…</span>
          <span v-if="failed" class="mono fail">Couldn’t load the full dataset. Showing the preview.</span>
          <a class="ghost mono" :href="`/api/d/${d.slug}/download?format=geojson`">Download</a>
        </div>
      </div>

      <div class="canvaswrap">
        <div id="fullmap" class="canvas"></div>
        <div class="basepick mono">
          <button v-for="b in BASEMAPS" :key="b.id" type="button"
                  :aria-pressed="b.id === baseKey" @click="setBase(b.id)">{{ b.label }}</button>
          <label><input type="checkbox" v-model="showRef" @change="applyBase" /> labels</label>
        </div>
      </div>

      <p v-if="shown < total && !loading" class="hint mono">
        Showing a sample so the map opens fast. The download always has every feature.
      </p>
    </main>

    <main v-else class="wrap miss">
      <h1>Not found</h1>
      <p>No public dataset at this address. <NuxtLink to="/">Browse the catalogue</NuxtLink>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
const cfg = useRuntimeConfig()
const AZ = String(cfg.public.azureMapsKey || '')
const E = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const AZURE = 'https://atlas.microsoft.com/map/tile?api-version=2024-04-01'
  + `&zoom={z}&x={x}&y={y}&subscription-key=${AZ}&tilesetId=`

const BASEMAPS = [
  // Azure imagery with its own hybrid road and label tilesets, which is how
  // themap-editor does it (buildAzureSatStyle in components/map/BaseMapPicker).
  // Roads drawn as part of the satellite ground register with the imagery;
  // ESRI's separate reference tileset sits on top of it and does not.
  { id: 'satellite', label: 'Satellite',
    url: AZ ? `${AZURE}microsoft.imagery` : `${E}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    ref: AZ ? `${AZURE}microsoft.base.labels.road`
            : `${E}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    opacity: 1, pale: false },
  { id: 'streets', label: 'Streets',
    url: `${E}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    ref: null, opacity: 1, pale: true },
  { id: 'light', label: 'Light',
    url: `${E}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${E}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opacity: 1, pale: true },
  { id: 'dark', label: 'Dark',
    url: `${E}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${E}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opacity: 1, pale: false },
]
const baseKey = ref('satellite')
const showRef = ref(true)

function applyBase() {
  if (!map || !map.getSource || !map.getSource('base')) return
  const b = BASEMAPS.find((x) => x.id === baseKey.value) || BASEMAPS[0]
  ;(map.getSource('base') as any).setTiles([b.url])
  const on = showRef.value && !!b.ref
  if (b.ref) (map.getSource('ref') as any).setTiles([b.ref])
  if (map.getLayer('ref')) map.setLayoutProperty('ref', 'visibility', on ? 'visible' : 'none')
  // On a pale ground the white polygon outlines vanish; on satellite a dark one
  // would. Flip with the basemap rather than picking one that is wrong half the
  // time.
  if (map.getLayer('line')) {
    map.setPaintProperty('line', 'line-color', b.pale ? '#33383d' : '#ffffff')
  }
  if (map.getLayer('labels')) {
    map.setPaintProperty('labels', 'text-color', b.pale ? '#16191c' : '#ffffff')
    map.setPaintProperty('labels', 'text-halo-color',
      b.pale ? 'rgba(255,255,255,0.9)' : 'rgba(15,12,10,0.88)')
  }
}
function setBase(id: string) { baseKey.value = id; applyBase() }

const route = useRoute()

const { data } = await useFetch<any>(() => `/api/d/${route.params.slug}`, {
  default: () => null as any,
})
const d = computed(() => data.value?.dataset || null)

// Same reason as the dataset page: a missing dataset must answer 404, or
// crawlers index the "Not found" body as real content.
if (import.meta.server && !d.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

const total = computed(() => d.value?.feature_count || data.value?.features?.length || 0)
const shown = ref(0)
const loading = ref(false)
const failed = ref(false)

let map: any = null
let maplibregl: any = null

function setData(features: any[]) {
  shown.value = features.length
  const src = map?.getSource('d')
  if (src) src.setData({ type: 'FeatureCollection', features })
}

// The preview endpoint caps its payload on purpose — a big polygon layer at
// full precision is what once drove the dyno out of memory. So the map opens on
// the sample and only pulls the whole file when asked, which keeps a 26,000
// polygon dataset from being a 60MB surprise on page load.
async function loadAll() {
  if (!d.value) return
  loading.value = true
  failed.value = false
  try {
    const full = await $fetch<any>(`/api/d/${d.value.slug}/download?format=geojson`)
    const feats = full?.features || []
    if (!feats.length) throw new Error('empty')
    setData(feats)
    fit(feats)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function fit(features: any[]) {
  if (d.value?.bbox) {
    map.fitBounds([[d.value.bbox[0], d.value.bbox[1]], [d.value.bbox[2], d.value.bbox[3]]],
      { padding: 40, duration: 0 })
    return
  }
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90
  const walk = (c: any) => {
    if (typeof c[0] === 'number') {
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1])
      x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1])
    } else c.forEach(walk)
  }
  features.forEach((f) => f.geometry && walk(f.geometry.coordinates))
  if (x0 <= x1) map.fitBounds([[x0, y0], [x1, y1]], { padding: 40, duration: 0 })
}

// Properties come from third-party sources, so every value goes in as text.
function popupNode(props: Record<string, any>) {
  const wrap = document.createElement('div')
  wrap.className = 'pop'
  const name = props.name ?? props.NAME ?? props.title
  if (name != null && String(name).trim()) {
    const h = document.createElement('p')
    h.className = 'pop-h'
    h.textContent = String(name)
    wrap.appendChild(h)
  }
  const dl = document.createElement('dl')
  for (const [k, v] of Object.entries(props)) {
    if (k === 'name' || v === null || v === '' || typeof v === 'object') continue
    const row = document.createElement('div')
    const dt = document.createElement('dt'); dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = typeof v === 'number' ? v.toLocaleString() : String(v)
    row.appendChild(dt); row.appendChild(dd); dl.appendChild(row)
  }
  wrap.appendChild(dl)
  return wrap
}

onMounted(async () => {
  if (!d.value || !data.value?.features?.length) return
  maplibregl = (await import('maplibre-gl')).default
  await import('maplibre-gl/dist/maplibre-gl.css')

  map = new maplibregl.Map({
    container: 'fullmap',
    style: {
      version: 8,
      sources: {
        base: {
          type: 'raster',
          tiles: [BASEMAPS[0].url],
          tileSize: 256, maxzoom: 19, attribution: '© Esri',
        },
        // Roads and place names, drawn ABOVE the polygons. Satellite imagery
        // carries no state lines, city names or highways, so a choropleth of
        // school districts floats unanchored on it — the commonest complaint
        // about these maps, and unfixable from underneath at 0.6 fill opacity.
        ref: {
          type: 'raster',
          tiles: [BASEMAPS[0].ref as string],
          tileSize: 256, maxzoom: 19,
        },
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }],
      // MapLibre cannot render a single character of text without a glyph
      // source. Without this, a layer carrying labels draws its geometry and
      // silently omits every label.
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    },
    center: [d.value.lng ?? -99, d.value.lat ?? 31.3],
    zoom: d.value.zoom ?? 5,
  })
  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

  map.on('load', () => {
    const st = (data.value as any)?.dataset?.style
    const feats = data.value.features
    map.addSource('d', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } })
    shown.value = feats.length
    const t = d.value.geometry_types
    const hit: string[] = []

    if (t.some((x: string) => x.includes('Polygon'))) {
      map.addLayer({ id: 'fill', type: 'fill', source: 'd', paint: fillPaint(st) as any })
      map.addLayer({ id: 'line', type: 'line', source: 'd', paint: fillStrokePaint() as any })
      hit.push('fill')
    }
    if (t.some((x: string) => x.includes('LineString'))) {
      map.addLayer({ id: 'ln', type: 'line', source: 'd', paint: linePaint(st, 2.4) as any })
      map.addLayer({ id: 'ln-hit', type: 'line', source: 'd',
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 } })
      hit.push('ln-hit')
    }
    if (t.some((x: string) => x.includes('Point'))) {
      map.addLayer({ id: 'pt', type: 'circle', source: 'd', paint: circlePaint(st, 5) as any })
      hit.push('pt')
    }

    // Above the fills, below the points: roads under a circle are clutter,
    // roads under a choropleth are the whole point.
    map.addLayer({ id: 'ref', type: 'raster', source: 'ref', paint: { 'raster-opacity': 0.95 } },
      map.getLayer('pt') ? 'pt' : undefined)

    // Labels, when a dataset provides them. A feature is labelled by carrying a
    // `label` property — that keeps the decision with whoever built the layer
    // rather than guessing which field is a name, and stays silent for the vast
    // majority of datasets that would only be made unreadable by 9,000 labels.
    if (feats.some((f: any) => f?.properties?.label)) {
      map.addLayer({
        id: 'labels', type: 'symbol', source: 'd',
        filter: ['has', 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 12, 12, 15],
          'text-line-height': 1.35,
          'text-max-width': 16,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(15,12,10,0.88)',
          'text-halo-width': 1.8,
        },
      } as any)
    }

    applyBase()

    const pop = new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
    for (const layer of hit) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      map.on('click', layer, (e: any) => {
        const f = e.features?.[0]
        if (f) pop.setLngLat(e.lngLat).setDOMContent(popupNode(f.properties || {})).addTo(map)
      })
    }

    fit(feats)
  })
})

onBeforeUnmount(() => { if (map) map.remove() })

useHead(() => d.value ? { title: `${d.value.title} — map — geopen.io` } : {})
</script>

<style scoped>
.page { display: flex; flex-direction: column; min-height: 100vh; }
.stage { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.bar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid #e2e2dc; background: #fff;
}
.who { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
.back {
  font-size: 0.86rem; color: #0E7C5A; text-decoration: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw;
}
.back:hover { text-decoration: underline; }
.count { font-size: 0.74rem; color: #6b6b66; white-space: nowrap; }

.acts { display: flex; align-items: center; gap: 10px; }
.ghost {
  font-size: 0.74rem; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 6px 11px; border: 1px solid #cfcfc8; background: #fff; color: #24241f;
  cursor: pointer; text-decoration: none; line-height: 1.6;
}
.ghost:hover { border-color: #0E7C5A; color: #0E7C5A; }
.ghost:focus-visible { outline: 2px solid #0E7C5A; outline-offset: 2px; }
.busy, .fail { font-size: 0.74rem; color: #6b6b66; }
.fail { color: #a33; }

.canvas { flex: 1; min-height: 420px; width: 100%; }
.hint { padding: 8px 16px; font-size: 0.72rem; color: #6b6b66; background: #fff;
  border-top: 1px solid #e2e2dc; }
.miss { padding: 60px 16px; }
</style>

<style>
/* popup internals are built in script, so these can't be scoped */
.maplibregl-popup-content .pop-h {
  margin: 0 0 8px; font-weight: 650; font-size: 0.92rem; color: #14161a;
}
.maplibregl-popup-content dl {
  margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
  font-size: 0.78rem; max-height: 260px; overflow-y: auto;
}
.maplibregl-popup-content dl > div { display: contents; }
.maplibregl-popup-content dt {
  color: #6b6b66; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem;
}
.maplibregl-popup-content dd {
  margin: 0; color: #14161a; font-variant-numeric: tabular-nums; word-break: break-word;
}

.canvaswrap { position: relative; flex: 1; min-height: 0; display: flex; }
.basepick {
  position: absolute; left: 12px; bottom: 12px; z-index: 3;
  display: flex; align-items: center; gap: 6px;
  background: rgba(14,15,18,0.82); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.16); border-radius: 4px; padding: 7px 9px;
}
.basepick button {
  font: inherit; font-size: 11px; font-weight: 600; padding: 5px 9px; cursor: pointer;
  color: #cfd4da; background: transparent; border: 1px solid rgba(255,255,255,0.16);
  border-radius: 3px;
}
.basepick button[aria-pressed="true"] { background: #cfe8d8; color: #0e0f12; border-color: #cfe8d8; }
.basepick label { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #aeb4bd;
  cursor: pointer; margin-left: 3px; }
</style>
