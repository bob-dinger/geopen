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

      <div id="fullmap" class="canvas"></div>

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
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256, maxzoom: 19, attribution: '© Esri',
        },
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }],
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
</style>
