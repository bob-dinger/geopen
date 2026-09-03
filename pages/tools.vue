<template>
  <div>
    <SiteHeader />

    <main class="wrap">
      <nav class="crumb mono"><NuxtLink to="/">catalogue</NuxtLink> / tools</nav>

      <header class="head">
        <p class="eyebrow mono">Things you check, not things you read</p>
        <h1>Tools</h1>
        <p class="lead">
          Most of the maps here answer a question once. These answer it again
          tomorrow. Some query a city's own server the moment you open them and
          keep no copy at all; the rest let you search a dataset for the one
          record you care about.
        </p>
        <ul class="facts mono nums" v-if="d">
          <li><strong>{{ d.toolCount }}</strong> tools</li>
          <li><strong>{{ liveCount }}</strong> read live from the source</li>
        </ul>
      </header>

      <div class="tools" v-if="d">
        <input v-model="q" type="search" class="mono" placeholder="Filter tools…"
               aria-label="Filter tools" />
        <span class="count mono nums" v-if="q">{{ shown.length }} of {{ d.toolCount }}</span>
      </div>

      <div class="grid" v-if="shown.length">
        <article v-for="m in shown" :key="m.slug" class="card">
          <a class="shot" :href="m.url" v-if="m.card">
            <img :src="m.card" :alt="`Preview of ${m.title}`" loading="lazy"
                 decoding="async" width="1200" height="630" @error="hide" />
          </a>
          <div class="body">
            <span class="tag mono" :class="m.live">
              {{ m.live === 'live' ? 'Live' : 'Lookup' }}
            </span>
            <h2><a :href="m.url">{{ m.title }}</a></h2>
            <p v-if="m.blurb">{{ m.blurb }}</p>
          </div>
        </article>
      </div>
      <p class="none mono" v-else-if="d">No tool matches “{{ q }}”.</p>

      <section class="note" v-if="d">
        <h2 class="mono">What makes something a tool</h2>
        <p>
          <strong>Live</strong> means the page holds no data. It queries the
          agency's own service when you load it, so it is current to whatever the
          agency published last and it goes blank if they go down. That is the
          trade: a stale copy that looks current is worse than nothing.
        </p>
        <p>
          <strong>Lookup</strong> means the data is ours and does not change by
          the hour, but the point is to find your parcel, your permit, your
          street — not to read the whole thing.
        </p>
        <p>
          Everything here is free, needs no account, and says on the page where
          its numbers came from and what they cannot tell you.
        </p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
const cfg = useRuntimeConfig()
const SITE = String(cfg.public.siteUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '')

const { data: d } = await useFetch<any>('/api/maps', { default: () => null as any })

const q = ref('')
// live first, then alphabetical — the live ones are the reason to come back
const ordered = computed(() => {
  const list = [...(d.value?.tools || [])]
  return list.sort((a: any, b: any) =>
    (a.live === 'live' ? 0 : 1) - (b.live === 'live' ? 0 : 1) ||
    a.title.localeCompare(b.title))
})
const liveCount = computed(() =>
  (d.value?.tools || []).filter((m: any) => m.live === 'live').length)

const shown = computed(() => {
  const n = q.value.trim().toLowerCase()
  return n
    ? ordered.value.filter((m: any) =>
        (m.title + ' ' + m.blurb + ' ' + m.slug).toLowerCase().includes(n))
    : ordered.value
})

function hide(e: Event) {
  const el = (e.target as HTMLElement)?.closest('.shot') as HTMLElement | null
  if (el) el.style.display = 'none'
}

useHead(() => ({
  title: 'Tools — geopen.io',
  meta: [{ name: 'description',
           content: d.value
             ? `${d.value.toolCount} live and searchable tools built on open government data — building permits, street work, wildfire and property records in Texas.`
             : 'Live and searchable tools built on open government data.' }],
  link: [{ rel: 'canonical', href: `${SITE}/tools` }],
}))
</script>

<style scoped>
.crumb { padding: 18px 0 0; font-size: 12px; color: var(--ink-3); }
.crumb a { color: var(--ink-3); }
.head { padding: 14px 0 24px; border-bottom: 1px solid var(--rule); margin-bottom: 22px;
  display: flex; flex-direction: column; gap: 10px; }
.eyebrow { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); letter-spacing: -.02em; margin: 0; }
.lead { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; margin: 0; max-width: 62ch; }
.facts { display: flex; gap: 18px; font-size: 12.5px; color: var(--ink-2); }
.facts strong { color: var(--ink); }

.tools { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.tools input { background: var(--panel); border: 1px solid var(--rule); border-radius: 4px;
  color: var(--ink); font-size: 12.5px; padding: 7px 11px; width: min(300px, 100%);
  font-family: inherit; }
.tools input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.tools .count { font-size: 11.5px; color: var(--ink-3); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px; margin-bottom: 40px; }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px;
  overflow: hidden; display: flex; flex-direction: column; }
.card:hover { border-color: var(--accent); }
.shot { display: block; line-height: 0; }
.shot img { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630;
  object-fit: cover; }
.body { padding: 13px 15px 15px; display: flex; flex-direction: column; gap: 6px;
  align-items: flex-start; }
.tag { font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  border: 1px solid var(--rule); border-radius: 3px; padding: 2px 6px; color: var(--ink-3); }
.tag.live { color: var(--accent); border-color: var(--accent); }
.card h2 { font-size: 15px; font-weight: 600; line-height: 1.32; letter-spacing: -.01em;
  margin: 0; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--accent); }
.card p { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin: 0; }
.none { padding: 30px 0; color: var(--ink-3); font-size: 13px; }

.note { border-top: 1px solid var(--rule); padding: 20px 0 60px; max-width: 62ch; }
.note h2 { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--ink-3); margin: 0 0 10px; font-weight: 600; }
.note p { font-size: 13px; color: var(--ink-2); line-height: 1.6; margin: 0 0 9px; }
.note strong { color: var(--ink); }
.nums { font-variant-numeric: tabular-nums; }
</style>
