<template>
  <div>
    <SiteHeader />

    <main class="wrap">
      <section class="hero">
        <div class="hero-copy">
          <h1>The open library<br />of <em>geographic files</em></h1>

          <ul class="facts mono">
            <li v-if="stats?.sources">
              <strong class="nums">{{ stats.sources }}+</strong> sources, mostly Texas
            </li>
            <li>CC0 — public domain, no attribution required</li>
            <li>Downloadable, no account required</li>
            <li>GeoJSON · Shapefile · Excel · CSV · KML</li>
          </ul>
        </div>

        <!-- Decorative: the facts beside it carry the meaning, so it is hidden
             from screen readers rather than described. -->
        <picture class="hero-art" aria-hidden="true">
          <source srcset="/img/geopen-hero.webp" type="image/webp" />
          <img src="/img/geopen-hero.png" alt="" width="900" height="796"
               decoding="async" fetchpriority="low" />
        </picture>

        <form class="search" @submit.prevent="run">
          <input v-model="q" type="search" aria-label="Search datasets"
                 placeholder="parcels · zoning · aquifers · crime · census" />
          <button type="submit">Search</button>
        </form>

        <div class="egs mono">
          <span>Try</span>
          <button v-for="e in examples" :key="e" type="button" @click="q = e; run()">{{ e }}</button>
        </div>
      </section>

      <dl class="counts" v-if="stats">
        <div><dt class="mono">Datasets</dt><dd class="mono nums">{{ stats.layers.toLocaleString() }}</dd></div>
        <div><dt class="mono">Features</dt><dd class="mono nums">{{ millions(stats.features) }}</dd></div>
        <div><dt class="mono">Tile sets</dt><dd class="mono nums">{{ stats.tilesets.toLocaleString() }}</dd></div>
        <div><dt class="mono">Documents</dt><dd class="mono nums">{{ stats.documents.toLocaleString() }}</dd></div>
      </dl>

      <section class="results">
        <div class="head">
          <h2 class="mono">{{ q ? `${total.toLocaleString()} matching “${q}”` : 'Recently added' }}</h2>
          <button v-if="q" class="clear mono" type="button" @click="q = ''; run()">Clear</button>
        </div>

        <div class="grid">
          <!--
            A card is a map, so clicking one opens the map. The dataset page —
            description, fields, provenance, downloads — stays one click back from
            there, and remains the canonical URL that sitemap.xml and the
            schema.org markup point at.
          -->
          <NuxtLink v-for="d in datasets" :key="d.slug" class="card" :to="`/d/${d.slug}/map`">
            <div class="thumb" v-if="d.thumb">
              <img :src="d.thumb" :alt="`Map preview of ${d.title}`" loading="lazy"
                   decoding="async" width="560" height="320" @error="hideShot" />
            </div>
            <div class="body">
              <h3>{{ d.title }}</h3>
              <p v-if="d.description">{{ d.description }}</p>
              <p class="src mono" v-if="d.source_host">
                <span class="lbl">source</span>{{ d.source_host }}
              </p>
              <div class="meta mono nums">
                <span>{{ (d.feature_count || 0).toLocaleString() }} features</span>
                <span v-if="d.tags?.length" class="tag">{{ d.tags[0] }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>

        <p v-if="!pending && !datasets.length" class="none">
          Nothing matches that yet.
        </p>

        <div class="more" v-if="datasets.length < total">
          <button type="button" class="mono" :disabled="pending" @click="loadMore">
            {{ pending ? 'Loading…' : `Show more (${(total - datasets.length).toLocaleString()} left)` }}
          </button>
        </div>
      </section>

      <section class="pitch">
        <h2>The data is already public. That's not the same as <em>available</em>.</h2>
        <p>
          Texas governments publish an enormous amount of geographic information. They
          publish it on their own terms, in their own formats, at their own URLs, with no
          index and no obligation to keep it there. Finding it is a research project.
          Using it is a second one.
        </p>
        <p v-if="stats?.sources">
          The {{ stats.layers.toLocaleString() }} datasets here were gathered from
          <strong>{{ stats.sources }}</strong> separate publishers — county appraisal
          districts, city GIS portals, state agencies, federal surveys — and rebuilt into
          one shape, with the source kept attached to every one.
        </p>

        <figure class="shot">
          <picture>
            <source srcset="/img/geopen-overview.webp" type="image/webp" />
            <img src="/img/geopen-overview.png" width="1536" height="1024" loading="lazy"
                 decoding="async"
                 alt="How geopen.io works. Left: thousands of sources — city and county
                      government, open data portals, public databases, cloud storage,
                      research institutions, international sources, non-profits and
                      foundations, APIs and web services. Centre: geopen.io gathers,
                      verifies and standardises them — discover, verify, standardize,
                      organize. Right: one place, downloadable as GeoJSON, Shapefile,
                      Excel, KML and CSV. Open data, free to access and use; always sourced; built for
                      planners, developers, researchers and citizens." />
          </picture>
        </figure>
      </section>

      <section class="promise">
        <div>
          <h3 class="mono">Preview</h3>
          <p>Every dataset renders before you download it. You should be able to tell whether
             it's what you want without unzipping anything.</p>
        </div>
        <div>
          <h3 class="mono">Check the source</h3>
          <p>Each one carries where it came from, when it was retrieved, and what's known to
             be wrong with it. Fields on the data, not a metadata page.</p>
        </div>
        <div>
          <h3 class="mono">Take it</h3>
          <p>GeoJSON, Shapefile, Excel, CSV, KML. One click, no account, no rate limit. Everything we
             derive is released CC0 — no attribution required.</p>
        </div>
      </section>
    </main>

    <footer class="wrap foot mono">
      <span>geopen.io — the open library of geographic information</span>
      <NuxtLink to="/licence">Licence</NuxtLink>
    </footer>
  </div>
</template>

<script setup lang="ts">
const q = ref('')
const examples = ['parcels', 'zoning', 'aquifers', 'census tracts', 'crime']
const PAGE = 24

const { data: stats } = await useFetch<any>('/api/stats', { default: () => null as any })
const { data: first } = await useFetch<any>('/api/datasets', {
  query: { limit: PAGE }, default: () => ({ datasets: [], total: 0 }),
})

const datasets = ref<any[]>(first.value?.datasets || [])
const total = ref<number>(first.value?.total || 0)
const pending = ref(false)

async function run() {
  pending.value = true
  try {
    const r = await $fetch<any>('/api/datasets', { query: { q: q.value, limit: PAGE } })
    datasets.value = r.datasets
    total.value = r.total
  } finally { pending.value = false }
}

async function loadMore() {
  pending.value = true
  try {
    const r = await $fetch<any>('/api/datasets', {
      query: { q: q.value, limit: PAGE, offset: datasets.value.length },
    })
    datasets.value.push(...r.datasets)
  } finally { pending.value = false }
}

// A dead Cloudinary URL should collapse the frame, not leave a grey hole.
function hideShot(e: Event) {
  const box = (e.target as HTMLElement)?.closest('.thumb') as HTMLElement | null
  if (box) box.style.display = 'none'
}

const millions = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString())

const cfg = useRuntimeConfig()
// Trim: a stray space in the config var otherwise corrupts every canonical URL.
const SITE = String(cfg.public.siteUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '')
useHead({
  title: 'geopen.io — the open library of geographic information',
  meta: [
    { name: 'description', content:
      'Open, downloadable geographic data for Texas — land ownership, zoning, construction, water. ' +
      'Every dataset previews in the browser, cites its source, and downloads in one click. No account.' },
    { property: 'og:title', content: 'geopen.io — the open library of geographic information' },
    { property: 'og:url', content: SITE },
  ],
  link: [{ rel: 'canonical', href: SITE }],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'DataCatalog',
      name: 'geopen.io',
      description: 'The open library of geographic information.',
      url: SITE,
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      isAccessibleForFree: true,
    }),
  }],
})
</script>

<style scoped>
/* Pulled up off the header, with the two headline lines given room to breathe
   between them rather than above them.
   Two columns on desktop: copy left, artwork right. The artwork drops out
   entirely below 860px rather than stacking — on a phone the search box should
   be the first thing under the headline, not a picture. */
.hero { padding: 30px 0 30px; display: grid; gap: 20px 40px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
  grid-template-areas: "copy art" "search art" "egs art";
  align-items: start; }
.hero-copy { grid-area: copy; display: grid; gap: 20px; }
.hero .search { grid-area: search; }
.hero .egs { grid-area: egs; }
/* Cut-out artwork on a transparent background — it sits on the page ground
   rather than in a frame. */
.hero-art { grid-area: art; align-self: center; }
.hero-art img { display: block; width: 100%; height: auto; }
@media (prefers-color-scheme: dark) { .hero-art img { filter: brightness(.88) saturate(.95); } }
:root[data-theme="dark"] .hero-art img { filter: brightness(.88) saturate(.95); }
:root[data-theme="light"] .hero-art img { filter: none; }
@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr;
          grid-template-areas: "copy" "search" "egs"; }
  .hero-art { display: none; }
}
h1 { font-family: var(--mono); font-weight: 600; font-size: clamp(30px, 4.6vw, 50px);
     line-height: 1.24; letter-spacing: -.035em; }
h1 em { font-style: normal; color: var(--accent); }

/* Four claims, not four sentences. Stacked rather than in a row: a single
   column is read, a row is skimmed, and these are the answers to the questions
   someone actually arrives with. */
.facts { display: grid; gap: 7px; font-size: 13px; color: var(--ink-2); list-style: none; }
.facts li { display: flex; align-items: baseline; gap: 9px; }
.facts li::before { content: ""; width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent); flex: none; transform: translateY(-1px); }
.facts strong { color: var(--ink); font-weight: 600; }

.search { display: flex; max-width: 620px; margin-top: 4px; }
.search input { flex: 1; min-width: 0; font-family: var(--mono); font-size: 14px; padding: 14px 16px;
  color: var(--ink); background: var(--panel); border: 1px solid var(--rule); border-right: 0;
  border-radius: 3px 0 0 3px; }
.search button { font-family: var(--mono); font-size: 13px; letter-spacing: .04em; text-transform: uppercase;
  padding: 0 22px; cursor: pointer; color: #fff; background: var(--accent);
  border: 1px solid var(--accent); border-radius: 0 3px 3px 0; }
.egs { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; align-items: center; }
.egs span { color: var(--ink-3); }
.egs button { background: none; cursor: pointer; font-family: var(--mono); font-size: 12px;
  color: var(--ink-2); border: 1px solid var(--rule); border-radius: 999px; padding: 3px 11px; }
.egs button:hover { border-color: var(--accent); color: var(--accent); }

.counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--rule);
  border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; margin-bottom: 52px; }
.counts > div { background: var(--panel); padding: 16px 20px; }
.counts dt { font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3); }
.counts dd { font-size: 25px; font-weight: 600; letter-spacing: -.02em; margin-top: 4px; }
@media (max-width: 760px) { .counts { grid-template-columns: repeat(2, 1fr); } }

.results { margin-bottom: 60px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  padding-bottom: 12px; border-bottom: 1px solid var(--rule); margin-bottom: 18px; }
.head h2 { font-size: 12.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }
.clear { background: none; border: 0; cursor: pointer; font-size: 12px; color: var(--accent); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 13px; }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px;
  text-decoration: none; display: flex; flex-direction: column; overflow: hidden;
  transition: border-color .15s; }
.card:hover { border-color: var(--accent); }
.card .body { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
/* Fixed aspect box so a missing or slow image never reflows the grid.
   Named .thumb, not .shot: the pitch section's overview graphic already uses
   .shot, and sharing the name cropped that image to 16:9 via object-fit. */
.thumb { aspect-ratio: 16 / 9; background: var(--rule-2); border-bottom: 1px solid var(--rule); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
@media (prefers-color-scheme: dark) { .thumb img { filter: brightness(.86); } }
:root[data-theme="dark"] .thumb img { filter: brightness(.86); }
:root[data-theme="light"] .thumb img { filter: none; }
.card h3 { font-size: 15.5px; font-weight: 600; line-height: 1.32; letter-spacing: -.01em; }
.card p { font-size: 13px; color: var(--ink-2); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
/* The publisher, stated plainly. Knowing a parcel file came from dallascad.org
   rather than an unnamed aggregator is most of what makes it trustworthy. */
.card p.src { font-size: 11.5px; color: var(--ink-3); display: flex; gap: 7px;
  align-items: baseline; -webkit-line-clamp: 1; }
.card p.src .lbl { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-4, var(--ink-3)); flex: none; }
.meta { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--rule-2);
  display: flex; gap: 10px; font-size: 11px; color: var(--ink-3); }
.tag { margin-left: auto; }
.none { padding: 40px 0; color: var(--ink-3); }
.more { display: flex; justify-content: center; margin-top: 26px; }
.more button { font-size: 12.5px; padding: 10px 22px; cursor: pointer; background: var(--panel);
  color: var(--ink-2); border: 1px solid var(--rule); border-radius: 3px; }

/* The argument, then the picture of it. Sits after the catalogue rather than
   above it — someone who arrived to find a file should meet the search box
   first, and the pitch is for whoever scrolled past it. */
.pitch { max-width: 760px; margin-bottom: 46px; display: grid; gap: 14px; }
.pitch h2 { font-family: var(--mono); font-size: clamp(21px, 2.9vw, 29px); font-weight: 600;
  line-height: 1.16; letter-spacing: -.03em; text-wrap: balance; max-width: 21ch; }
.pitch h2 em { font-style: normal; color: var(--accent); }
.pitch p { font-size: 16.5px; color: var(--ink-2); }
.pitch p strong { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.shot { margin-top: 14px; border: 1px solid var(--rule); border-radius: 4px; overflow: hidden;
  background: #F7F8F4; }
.shot img { display: block; width: 100%; height: auto; }
/* The graphic is drawn on a light ground; on a dark page a hard white block is
   harsh, so take a little brightness out rather than inverting it. */
@media (prefers-color-scheme: dark) { .shot img { filter: brightness(.9); } }
:root[data-theme="dark"] .shot img { filter: brightness(.9); }
:root[data-theme="light"] .shot img { filter: none; }

.promise { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule);
  border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; margin-bottom: 60px; }
.promise > div { background: var(--panel); padding: 20px 22px 22px; }
.promise h3 { font-size: 11.5px; letter-spacing: .09em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 8px; }
.promise p { font-size: 14px; color: var(--ink-2); }
@media (max-width: 800px) { .promise { grid-template-columns: 1fr; } }

.foot { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 24px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--ink-3); }
.foot a { color: var(--ink-2); text-decoration: none; }
</style>
