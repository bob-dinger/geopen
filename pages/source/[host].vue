<template>
  <div>
    <SiteHeader />

    <main class="wrap" v-if="d">
      <nav class="crumb mono"><NuxtLink to="/">catalogue</NuxtLink> / source / {{ d.host }}</nav>

      <header class="head">
        <p class="eyebrow mono">Everything from one publisher</p>
        <h1>{{ d.host }}</h1>
        <ul class="facts mono nums">
          <li v-if="d.counts.layers"><strong>{{ d.counts.layers }}</strong> {{ d.counts.layers === 1 ? 'dataset' : 'datasets' }}</li>
          <li v-if="d.counts.tilesets"><strong>{{ d.counts.tilesets }}</strong> {{ d.counts.tilesets === 1 ? 'tileset' : 'tilesets' }}</li>
          <li><strong>{{ d.counts.features.toLocaleString() }}</strong> features</li>
        </ul>
        <p class="out mono" v-if="firstSource">
          <a :href="firstSource" target="_blank" rel="noopener">Visit {{ d.host }} ↗</a>
        </p>
      </header>

      <section v-if="d.layers.length">
        <h2 class="mono">Datasets</h2>
        <div class="grid">
          <article v-for="l in d.layers" :key="l.uuid" class="card">
            <div class="thumb" v-if="l.thumb">
              <img :src="l.thumb" :alt="`Map preview of ${l.title}`" loading="lazy"
                   decoding="async" width="560" height="320" @error="hideShot" />
            </div>
            <div class="body">
              <h3><NuxtLink class="stretch" :to="`/d/${l.slug}/map`">{{ l.title }}</NuxtLink></h3>
              <p v-if="l.description">{{ l.description }}</p>
              <div class="meta mono nums">
                <span>{{ l.feature_count.toLocaleString() }} features</span>
                <span v-if="l.tags?.length" class="tag">{{ l.tags[0] }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-if="d.tilesets.length">
        <h2 class="mono">Tilesets</h2>
        <div class="grid">
          <article v-for="t in d.tilesets" :key="t.slug" class="card">
            <div class="body">
              <h3>
                <a class="stretch" :href="`https://themap.io/pmtiles/view/${t.slug}`"
                   target="_blank" rel="noopener">{{ t.title }}</a>
              </h3>
              <p v-if="t.description">{{ t.description }}</p>
              <div class="meta mono nums">
                <span>{{ t.feature_count.toLocaleString() }} features</span>
                <span v-if="t.category" class="tag">{{ t.category }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>

    <main class="wrap miss" v-else>
      <h1>Nothing from that source</h1>
      <p>No public data traces back to that publisher.
        <NuxtLink to="/">Browse the catalogue</NuxtLink>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const cfg = useRuntimeConfig()
const SITE = String(cfg.public.siteUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '')

const { data: d } = await useFetch<any>(() => `/api/source/${route.params.host}`, {
  default: () => null as any,
})

// A source with nothing behind it must answer 404, not 200 — otherwise a
// crawler working through links indexes empty pages as real content.
if (import.meta.server && !d.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

const firstSource = computed(() =>
  d.value?.layers?.[0]?.source_url || d.value?.tilesets?.[0]?.source_url || null)

function hideShot(e: Event) {
  const el = (e.target as HTMLElement)?.closest('.thumb') as HTMLElement | null
  if (el) el.style.display = 'none'
}

useHead(() => d.value ? {
  title: `${d.value.host} — ${d.value.counts.layers + d.value.counts.tilesets} datasets — geopen.io`,
  meta: [{ name: 'description',
           content: `Every dataset in the geopen.io catalogue published by ${d.value.host}: `
             + `${d.value.counts.layers} datasets, ${d.value.counts.tilesets} tilesets, `
             + `${d.value.counts.features.toLocaleString()} features.` }],
  link: [{ rel: 'canonical', href: `${SITE}/source/${d.value.host}` }],
} : {})
</script>

<style scoped>
.crumb { padding: 18px 0 0; font-size: 12px; color: var(--ink-3); }
.crumb a { color: var(--ink-3); }
.head { padding: 14px 0 26px; border-bottom: 1px solid var(--rule); margin-bottom: 26px;
  display: flex; flex-direction: column; gap: 10px; }
.eyebrow { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); letter-spacing: -.02em; margin: 0; word-break: break-word; }
.facts { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; color: var(--ink-2); }
.facts strong { color: var(--ink); }
.out a { font-size: 12px; color: var(--accent); text-decoration: none; }
.out a:hover { text-decoration: underline; }

section { margin-bottom: 34px; }
section h2 { font-size: 11px; letter-spacing: .11em; text-transform: uppercase;
  color: var(--ink-3); margin: 0 0 12px; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { position: relative; background: var(--panel); border: 1px solid var(--rule);
  border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
.card:hover { border-color: var(--accent); }
.card .thumb img { display: block; width: 100%; height: auto; }
.card .body { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
.card h3 { font-size: 15px; font-weight: 600; line-height: 1.32; letter-spacing: -.01em; margin: 0; }
.card h3 a { color: inherit; text-decoration: none; }
/* the title is the card's link; the overlay makes the whole card clickable
   without nesting one anchor inside another */
.stretch::after { content: ''; position: absolute; inset: 0; }
.card p { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin: 0; }
.meta { display: flex; gap: 10px; font-size: 11px; color: var(--ink-3); margin-top: auto;
  padding-top: 6px; }
.meta .tag { border: 1px solid var(--rule); border-radius: 99px; padding: 1px 7px; }
.miss { padding: 60px 0; }
</style>
