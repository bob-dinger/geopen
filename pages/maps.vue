<template>
  <div>
    <SiteHeader />

    <main class="wrap">
      <nav class="crumb mono"><NuxtLink to="/">catalogue</NuxtLink> / maps</nav>

      <header class="head">
        <p class="eyebrow mono">Every map on this site</p>
        <h1>Maps</h1>
        <p class="lead">
          One map, one question. Each is built from the open data in the
          catalogue and says on the page where its numbers came from and what
          they cannot tell you.
        </p>
        <ul class="facts mono nums" v-if="d">
          <li><strong>{{ d.count }}</strong> maps</li>
        </ul>
      </header>

      <div class="tools" v-if="d">
        <input v-model="q" type="search" class="mono" placeholder="Filter maps…"
               aria-label="Filter maps" />
        <span class="count mono nums" v-if="q">{{ shown.length }} of {{ d.count }}</span>
      </div>

      <div class="grid" v-if="shown.length">
        <article v-for="m in shown" :key="m.slug" class="card">
          <a class="shot" :href="m.url" v-if="m.card">
            <img :src="m.card" :alt="`Preview of ${m.title}`" loading="lazy"
                 decoding="async" width="1200" height="630" @error="hide" />
          </a>
          <div class="body">
            <h2><a :href="m.url">{{ m.title }}</a></h2>
            <p v-if="m.blurb">{{ m.blurb }}</p>
          </div>
        </article>
      </div>
      <p class="none mono" v-else-if="d">No map matches “{{ q }}”.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
const cfg = useRuntimeConfig()
const SITE = String(cfg.public.siteUrl || '').trim().replace(/\s+/g, '').replace(/\/+$/, '')

const { data: d } = await useFetch<any>('/api/maps', { default: () => null as any })

const q = ref('')
const shown = computed(() => {
  const list = d.value?.maps || []
  const n = q.value.trim().toLowerCase()
  return n
    ? list.filter((m: any) =>
        (m.title + ' ' + m.blurb + ' ' + m.slug).toLowerCase().includes(n))
    : list
})

function hide(e: Event) {
  const el = (e.target as HTMLElement)?.closest('.shot') as HTMLElement | null
  if (el) el.style.display = 'none'
}

useHead(() => ({
  title: 'Maps — geopen.io',
  meta: [{ name: 'description',
           content: d.value
             ? `${d.value.count} maps built from open geographic data — Texas land, housing, wildfire, surveillance and construction.`
             : 'Maps built from open geographic data.' }],
  link: [{ rel: 'canonical', href: `${SITE}/maps` }],
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
  gap: 18px; margin-bottom: 60px; }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 6px;
  overflow: hidden; display: flex; flex-direction: column; }
.card:hover { border-color: var(--accent); }
.shot { display: block; line-height: 0; }
/* the card is 1200x630; reserving the ratio stops the grid jumping as they load */
.shot img { display: block; width: 100%; height: auto; aspect-ratio: 1200 / 630;
  object-fit: cover; }
.body { padding: 13px 15px 15px; display: flex; flex-direction: column; gap: 6px; }
.card h2 { font-size: 15px; font-weight: 600; line-height: 1.32; letter-spacing: -.01em;
  margin: 0; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--accent); }
.card p { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin: 0; }
.none { padding: 30px 0; color: var(--ink-3); font-size: 13px; }
.nums { font-variant-numeric: tabular-nums; }
</style>
