<template>
  <div>
    <SiteHeader />

    <main class="wrap">
      <section class="hero">
        <h1>Texas, as <em>files you can take</em>.</h1>
        <p class="lede">
          Points, lines and polygons for the things governments record and rarely publish
          well — land ownership, zoning, construction, water. Every dataset previews in the
          browser, says where it came from, and downloads in one click. No account.
        </p>

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
          <NuxtLink v-for="d in datasets" :key="d.slug" class="card" :to="`/d/${d.slug}`">
            <h3>{{ d.title }}</h3>
            <p v-if="d.description">{{ d.description }}</p>
            <div class="meta mono nums">
              <span>{{ (d.feature_count || 0).toLocaleString() }} features</span>
              <span v-if="d.tags?.length" class="tag">{{ d.tags[0] }}</span>
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
          <p>GeoJSON, CSV, KML. One click, no account, no rate limit. Everything we derive is
             released CC0 — no attribution required.</p>
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

const millions = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString())

const cfg = useRuntimeConfig()
useHead({
  title: 'geopen.io — the open library of geographic information',
  meta: [
    { name: 'description', content:
      'Open, downloadable geographic data for Texas — land ownership, zoning, construction, water. ' +
      'Every dataset previews in the browser, cites its source, and downloads in one click. No account.' },
    { property: 'og:title', content: 'geopen.io — the open library of geographic information' },
    { property: 'og:url', content: cfg.public.siteUrl },
  ],
  link: [{ rel: 'canonical', href: cfg.public.siteUrl }],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'DataCatalog',
      name: 'geopen.io',
      description: 'The open library of geographic information.',
      url: cfg.public.siteUrl,
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      isAccessibleForFree: true,
    }),
  }],
})
</script>

<style scoped>
.hero { padding: 64px 0 40px; display: grid; gap: 20px; }
h1 { font-family: var(--mono); font-weight: 600; font-size: clamp(30px, 4.6vw, 50px);
     line-height: 1.08; letter-spacing: -.035em; text-wrap: balance; max-width: 17ch; }
h1 em { font-style: normal; color: var(--accent); }
.lede { font-size: 17.5px; color: var(--ink-2); max-width: 62ch; }

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
  padding: 15px 17px 13px; text-decoration: none; display: flex; flex-direction: column; gap: 8px;
  transition: border-color .15s; }
.card:hover { border-color: var(--accent); }
.card h3 { font-size: 15.5px; font-weight: 600; line-height: 1.32; letter-spacing: -.01em; }
.card p { font-size: 13px; color: var(--ink-2); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.meta { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--rule-2);
  display: flex; gap: 10px; font-size: 11px; color: var(--ink-3); }
.tag { margin-left: auto; }
.none { padding: 40px 0; color: var(--ink-3); }
.more { display: flex; justify-content: center; margin-top: 26px; }
.more button { font-size: 12.5px; padding: 10px 22px; cursor: pointer; background: var(--panel);
  color: var(--ink-2); border: 1px solid var(--rule); border-radius: 3px; }

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
