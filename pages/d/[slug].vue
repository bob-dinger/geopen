<template>
  <div>
    <SiteHeader />

    <main class="wrap" v-if="d">
      <nav class="crumb mono"><NuxtLink to="/">catalogue</NuxtLink> / {{ d.slug }}</nav>

      <header class="head">
        <h1>{{ d.title }}</h1>
        <p class="desc" v-if="d.description">{{ d.description }}</p>
        <ul class="tags mono" v-if="d.tags?.length">
          <li v-for="t in d.tags.slice(0, 8)" :key="t">{{ t }}</li>
        </ul>
      </header>

      <div class="cols">
        <div class="main">
          <div class="mapbox"><div id="map"></div></div>
          <p class="cap mono" v-if="data.truncated">
            Showing {{ data.preview_count.toLocaleString() }} of
            {{ (d.feature_count || 0).toLocaleString() }} features. The download has all of them.
          </p>

          <section class="fields">
            <h2 class="mono">Fields</h2>
            <div class="scroll-x">
              <table>
                <thead>
                  <tr><th>Name</th><th class="r">Filled</th><th>Example</th></tr>
                </thead>
                <tbody>
                  <tr v-for="f in fields" :key="f.name">
                    <td class="mono nm">{{ f.name }}</td>
                    <td class="r mono nums" :class="{ low: f.coverage < 60 }">{{ f.coverage }}%</td>
                    <td class="ex">{{ f.sample }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="side">
          <div class="dl">
            <p class="lbl mono">Download</p>
            <a class="btn" :href="`/api/d/${d.slug}/download?format=geojson`">GeoJSON</a>
            <div class="alt">
              <a :href="`/api/d/${d.slug}/download?format=csv`">CSV</a>
              <a :href="`/api/d/${d.slug}/download?format=kml`">KML</a>
            </div>
            <p class="free mono">No account. No key. {{ d.licence }}.</p>
          </div>

          <div class="prov">
            <p class="lbl mono">Provenance</p>
            <dl>
              <div><dt>Features</dt><dd class="nums">{{ (d.feature_count || 0).toLocaleString() }}</dd></div>
              <div><dt>Geometry</dt><dd>{{ d.geometry_types.join(', ') || '—' }}</dd></div>
              <div v-if="d.source_url"><dt>Source</dt>
                <dd><a :href="d.source_url" target="_blank" rel="noopener">{{ sourceHost }}</a></dd></div>
              <div v-if="d.updated"><dt>Updated</dt><dd class="nums">{{ d.updated.slice(0, 10) }}</dd></div>
              <div><dt>Licence</dt><dd>{{ d.licence }}</dd></div>
            </dl>
            <p class="note">
              Derived data released CC0. Source material keeps its own terms — check the
              source before relying on it commercially.
            </p>
          </div>
        </aside>
      </div>
    </main>

    <main class="wrap miss" v-else>
      <h1>Not found</h1>
      <p>No public dataset at this address. <NuxtLink to="/">Browse the catalogue</NuxtLink>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const cfg = useRuntimeConfig()

const { data } = await useFetch<any>(() => `/api/d/${route.params.slug}`, {
  default: () => null as any,
})
const d = computed(() => data.value?.dataset || null)
const fields = computed(() => data.value?.fields || [])
const sourceHost = computed(() => {
  try { return new URL(d.value.source_url).hostname.replace('www.', '') } catch { return d.value?.source_url }
})

// Machine-readable description of the dataset. This is the single highest-value
// thing on the page for discovery — it is what lets a crawler or a model know
// this is a dataset, who published it, what licence it carries and where the
// file is, without parsing prose.
useHead(() => {
  if (!d.value) return {}
  const url = `${cfg.public.siteUrl}/d/${d.value.slug}`
  return {
    title: `${d.value.title} — geopen.io`,
    meta: [
      { name: 'description', content: (d.value.description || '').slice(0, 300) },
      { property: 'og:title', content: d.value.title },
      { property: 'og:description', content: (d.value.description || '').slice(0, 300) },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'website' },
    ],
    link: [{ rel: 'canonical', href: url }],
    script: [{
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: d.value.title,
        description: d.value.description,
        url,
        license: 'https://creativecommons.org/publicdomain/zero/1.0/',
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'geopen.io', url: cfg.public.siteUrl },
        keywords: d.value.tags,
        ...(d.value.source_url ? { isBasedOn: d.value.source_url } : {}),
        ...(d.value.bbox ? {
          spatialCoverage: {
            '@type': 'Place',
            geo: {
              '@type': 'GeoShape',
              box: `${d.value.bbox[1]} ${d.value.bbox[0]} ${d.value.bbox[3]} ${d.value.bbox[2]}`,
            },
          },
        } : {}),
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/geo+json',
            contentUrl: `${url.replace('/d/', '/api/d/')}/download?format=geojson` },
          { '@type': 'DataDownload', encodingFormat: 'text/csv',
            contentUrl: `${url.replace('/d/', '/api/d/')}/download?format=csv` },
        ],
      }),
    }],
  }
})

onMounted(async () => {
  if (!d.value || !data.value?.features?.length) return
  const maplibregl = (await import('maplibre-gl')).default
  await import('maplibre-gl/dist/maplibre-gl.css')
  const map = new maplibregl.Map({
    container: 'map',
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
  map.on('load', () => {
    map.addSource('d', { type: 'geojson', data: { type: 'FeatureCollection', features: data.value.features } })
    const t = d.value.geometry_types
    if (t.some((x: string) => x.includes('Polygon'))) {
      map.addLayer({ id: 'fill', type: 'fill', source: 'd',
        paint: { 'fill-color': '#0E7C5A', 'fill-opacity': 0.45 } })
      map.addLayer({ id: 'line', type: 'line', source: 'd',
        paint: { 'line-color': '#0E7C5A', 'line-width': 0.8 } })
    }
    if (t.some((x: string) => x.includes('LineString'))) {
      map.addLayer({ id: 'ln', type: 'line', source: 'd',
        paint: { 'line-color': '#0E7C5A', 'line-width': 1.6 } })
    }
    if (t.some((x: string) => x.includes('Point'))) {
      map.addLayer({ id: 'pt', type: 'circle', source: 'd',
        paint: { 'circle-radius': 4, 'circle-color': '#0E7C5A',
                 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } })
    }
    if (d.value.bbox) {
      map.fitBounds([[d.value.bbox[0], d.value.bbox[1]], [d.value.bbox[2], d.value.bbox[3]]],
        { padding: 30, duration: 0 })
    }
  })
})
</script>

<style scoped>
.crumb { font-size: 12px; color: var(--ink-3); padding: 18px 0 0; }
.crumb a { text-decoration: none; color: var(--accent); }
.head { padding: 18px 0 26px; display: grid; gap: 12px; }
h1 { font-family: var(--mono); font-size: clamp(24px, 3.4vw, 36px); font-weight: 600;
     letter-spacing: -.035em; line-height: 1.12; text-wrap: balance; max-width: 24ch; }
.desc { color: var(--ink-2); max-width: 68ch; font-size: 16.5px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
.tags li { border: 1px solid var(--rule); border-radius: 999px; padding: 2px 10px; color: var(--ink-3); }

.cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 26px; padding-bottom: 70px; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }

.mapbox { border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; background: var(--panel); }
#map { height: 460px; width: 100%; }
.cap { font-size: 11.5px; color: var(--ink-3); padding-top: 8px; }

.fields { margin-top: 30px; }
.fields h2 { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2);
             font-weight: 600; padding-bottom: 10px; border-bottom: 1px solid var(--rule); }
table { width: 100%; font-size: 13.5px; }
th { text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em;
     text-transform: uppercase; color: var(--ink-3); font-weight: 400; padding: 10px 12px 8px 0; }
td { padding: 7px 12px 7px 0; border-top: 1px solid var(--rule-2); vertical-align: top; }
.r { text-align: right; padding-right: 18px; }
.nm { color: var(--ink); }
.ex { color: var(--ink-3); }
.low { color: var(--signal); }

.side { display: grid; gap: 16px; align-content: start; }
.lbl { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 10px; }
.dl, .prov { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px; padding: 16px 18px; }
.btn { display: block; text-align: center; text-decoration: none; background: var(--accent);
       color: #fff; font-family: var(--mono); font-size: 13px; letter-spacing: .04em;
       padding: 11px; border-radius: 3px; }
.alt { display: flex; gap: 8px; margin-top: 8px; }
.alt a { flex: 1; text-align: center; text-decoration: none; font-family: var(--mono); font-size: 12px;
         border: 1px solid var(--rule); border-radius: 3px; padding: 7px; color: var(--ink-2); }
.alt a:hover { border-color: var(--accent); color: var(--accent); }
.free { font-size: 11px; color: var(--ink-3); margin-top: 10px; }

.prov dl { display: grid; gap: 8px; }
.prov dl > div { display: flex; gap: 12px; font-size: 13px; }
.prov dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
           color: var(--ink-3); width: 82px; flex: none; padding-top: 2px; }
.prov dd { color: var(--ink); word-break: break-word; }
.prov dd a { color: var(--accent); }
.prov .note { font-size: 11.5px; color: var(--ink-3); margin-top: 12px;
              padding-top: 10px; border-top: 1px solid var(--rule-2); }
.miss { padding: 90px 0; display: grid; gap: 10px; }
.miss h1 { font-size: 26px; }
</style>
