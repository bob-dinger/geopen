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

      <ul class="grid" v-if="d && shown.length">
        <li v-for="s in shown" :key="s.host">
          <NuxtLink :to="`/source/${s.host}`">
            <span class="host mono">{{ s.host }}</span>
            <span class="n mono nums">
              {{ (s.layers + s.tilesets).toLocaleString() }}
              {{ (s.layers + s.tilesets) === 1 ? 'dataset' : 'datasets' }}
            </span>
          </NuxtLink>
        </li>
      </ul>

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

.none { padding: 30px 0; color: var(--ink-3); font-size: 13px; }
.note { margin: 26px 0 60px; padding-top: 18px; border-top: 1px solid var(--rule);
  display: flex; flex-direction: column; gap: 10px; }
.note p { font-size: 12.5px; color: var(--ink-3); line-height: 1.6; margin: 0; max-width: 68ch; }
.note strong { color: var(--ink-2); }


/* A grid of buttons rather than a table. A table asks to be read top to bottom;
   this is a set of doors, and the point is that there are a lot of them.

   The fill has to be set per mode: --accent is a dark green in light mode and a
   bright one in dark, so white text on it would fail contrast in dark. Declared
   under both the media query and the data-theme scope so the toggle wins either
   way. */
.grid { --btn-bg: var(--accent); --btn-fg: #FFFFFF; --btn-sub: rgba(255,255,255,.74);
  --btn-edge: rgba(0,0,0,.18);
  list-style: none; margin: 0 0 44px; padding: 0; display: grid; gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .grid { --btn-bg: #16362A; --btn-fg: #E8EDE9;
    --btn-sub: var(--accent); --btn-edge: rgba(0,0,0,.5); }
}
:root[data-theme='dark'] .grid { --btn-bg: #16362A; --btn-fg: #E8EDE9;
  --btn-sub: var(--accent); --btn-edge: rgba(0,0,0,.5); }
:root[data-theme='light'] .grid { --btn-bg: var(--accent); --btn-fg: #FFFFFF;
  --btn-sub: rgba(255,255,255,.74); --btn-edge: rgba(0,0,0,.18); }

.grid a { display: flex; flex-direction: column; gap: 7px; height: 100%;
  min-height: 92px; padding: 13px 14px; border-radius: 7px; text-decoration: none;
  background: var(--btn-bg); color: var(--btn-fg);
  box-shadow: 0 2px 0 var(--btn-edge); transition: transform .08s, box-shadow .08s; }
.grid a:hover { transform: translateY(-2px); box-shadow: 0 4px 0 var(--btn-edge); }
.grid a:active { transform: translateY(1px); box-shadow: 0 1px 0 var(--btn-edge); }
.grid a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.host { font-size: 12.5px; line-height: 1.35; word-break: break-word;
  font-weight: 600; }
.grid .n { margin-top: auto; font-size: 11.5px; color: var(--btn-sub);
  letter-spacing: .02em; }

@media (max-width: 900px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 660px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
