<template>
  <div>
    <SiteHeader />

    <main class="wrap">
      <nav class="crumb mono"><NuxtLink to="/">catalogue</NuxtLink> / sources</nav>

      <header class="head">
        <p class="eyebrow mono">Where all of it came from</p>
        <h1>Sources</h1>
        <p class="lead">
          Every dataset here was published by someone else first. This is the full list of
          who, and how much of the catalogue each one accounts for.
        </p>
        <ul class="facts mono nums" v-if="d">
          <li><strong>{{ d.totals.publishers.toLocaleString() }}</strong> publishers</li>
          <li><strong>{{ d.totals.datasets.toLocaleString() }}</strong> datasets</li>
          <li><strong>{{ d.totals.features.toLocaleString() }}</strong> features</li>
        </ul>
      </header>

      <div class="tools" v-if="d">
        <input v-model="q" type="search" class="mono" placeholder="Filter publishers…"
               aria-label="Filter publishers" />
        <span class="count mono nums" v-if="q">{{ shown.length }} of {{ d.sources.length }}</span>
      </div>

      <table class="src mono" v-if="d && shown.length">
        <thead>
          <tr>
            <th>Publisher</th>
            <th class="n">Datasets</th>
            <th class="n">Features</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in shown" :key="s.host">
            <td class="host">
              <NuxtLink :to="`/source/${s.host}`">{{ s.host }}</NuxtLink>
            </td>
            <td class="n nums">
              {{ (s.layers + s.tilesets).toLocaleString() }}
              <span class="sub" v-if="s.tilesets">({{ s.tilesets }} tiled)</span>
            </td>
            <td class="n nums">{{ s.features.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>

      <p class="none mono" v-else-if="d">No publisher matches “{{ q }}”.</p>

      <footer class="note" v-if="d">
        <p v-if="d.totals.unsourced">
          <strong>{{ d.totals.unsourced.toLocaleString() }}</strong>
          {{ d.totals.unsourced === 1 ? 'dataset carries' : 'datasets carry' }} no source URL
          ({{ d.totals.unsourced_features.toLocaleString() }} features). They are counted here
          rather than hidden — a sources page that quietly dropped them would overstate the
          very thing it exists to show.
        </p>
        <p>
          Source material keeps its own terms, which are sometimes more restrictive than
          ours. What we derived is <NuxtLink to="/licence">CC0</NuxtLink>; every download
          carries its source, licence and retrieval date inside the file.
        </p>
      </footer>
    </main>
  </div>
</template>

<script setup lang="ts">
const cfg = useRuntimeConfig()
const SITE = String(cfg.public.siteUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '')

const { data: d } = await useFetch<any>('/api/sources', { default: () => null as any })

const q = ref('')
const shown = computed(() => {
  const list = d.value?.sources || []
  const needle = q.value.trim().toLowerCase()
  return needle ? list.filter((s: any) => s.host.includes(needle)) : list
})

useHead(() => ({
  title: 'Sources — every publisher in the catalogue — geopen.io',
  meta: [{ name: 'description',
           content: d.value
             ? `The ${d.value.totals.publishers} publishers behind geopen.io's `
               + `${d.value.totals.datasets} datasets and `
               + `${d.value.totals.features.toLocaleString()} features.`
             : 'Every publisher behind the geopen.io catalogue.' }],
  link: [{ rel: 'canonical', href: `${SITE}/sources` }],
}))
</script>

<style scoped>
.crumb { padding: 18px 0 0; font-size: 12px; color: var(--ink-3); }
.crumb a { color: var(--ink-3); }
.head { padding: 14px 0 24px; border-bottom: 1px solid var(--rule); margin-bottom: 20px;
  display: flex; flex-direction: column; gap: 10px; }
.eyebrow { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); letter-spacing: -.02em; margin: 0; }
.lead { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; margin: 0; max-width: 60ch; }
.facts { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; color: var(--ink-2); }
.facts strong { color: var(--ink); }

.tools { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.tools input { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px;
  color: var(--ink); font-size: 12.5px; padding: 7px 11px; width: min(300px, 100%);
  font-family: inherit; }
.tools input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.tools .count { font-size: 11.5px; color: var(--ink-3); }

/* the table scrolls inside itself so the page never scrolls sideways */
.src { width: 100%; border-collapse: collapse; font-size: 12.5px; display: block;
  overflow-x: auto; white-space: nowrap; }
.src thead th { text-align: left; font-size: 10.5px; letter-spacing: .1em; font-weight: 600;
  text-transform: uppercase; color: var(--ink-3); padding: 0 14px 8px 0;
  border-bottom: 1px solid var(--rule); }
.src th.n, .src td.n { text-align: right; }
.src tbody td { padding: 8px 14px 8px 0; border-bottom: 1px solid var(--rule);
  color: var(--ink-2); }
.src tbody tr:hover td { background: var(--panel); }
.src .host a { color: var(--ink); text-decoration: none; }
.src .host a:hover { color: var(--accent); text-decoration: underline; }
.src .sub { color: var(--ink-3); font-size: 11px; margin-left: 5px; }
.nums { font-variant-numeric: tabular-nums; }

.none { padding: 30px 0; color: var(--ink-3); font-size: 13px; }
.note { margin: 26px 0 60px; padding-top: 18px; border-top: 1px solid var(--rule);
  display: flex; flex-direction: column; gap: 10px; }
.note p { font-size: 12.5px; color: var(--ink-3); line-height: 1.6; margin: 0; max-width: 68ch; }
.note strong { color: var(--ink-2); }

</style>
