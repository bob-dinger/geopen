export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',

  // Server-rendered by default, and that is the whole point. The discovery
  // strategy is that a crawler or an AI fetches a layer page and finds the
  // title, the description, the source and the licence in the HTML. A
  // client-rendered shell returns none of that.
  ssr: true,

  devtools: { enabled: false },

  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NUXT_PUBLIC_SUPABASE_URL,
    // Server-only. Never exposed to the client — geopen is read-only in public.
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Server-only. Pays for the PD question box (server/api/pd/ask.post.ts).
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://geopen.io',
      siteName: 'geopen.io',
      azureMapsKey: process.env.NUXT_PUBLIC_AZURE_MAPS_KEY || '',
    },
  },

  nitro: {
    // Layer pages are read-heavy and change rarely. Cache at the edge rather
    // than hitting Postgres for every crawler visit.
    routeRules: {
      '/': { swr: 600 },
      '/d/**': { swr: 600 },
      '/api/datasets': { swr: 300 },
      '/api/stats': { swr: 3600 },
      // map pages moved to maps.thetexasatlas.com (20 Nov 2026). Static files are served before server
      // middleware, so the forward has to be a route rule; the Atlas server turns /maps/<slug>.html into /<slug>
      // and serves the same card images
      '/maps/**': { redirect: { to: 'https://maps.thetexasatlas.com/maps/**', statusCode: 301 } },
      // APIs the map pages on maps.thetexasatlas.com still call here (they need this app's database)
      '/api/drought/**': { cors: true },
      '/api/places': { cors: true },
      '/api/places/**': { cors: true },
      '/api/pd/**': { cors: true },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/img/geopen-logo-64.png', type: 'image/png', sizes: '64x64' },
        { rel: 'apple-touch-icon', href: '/img/geopen-logo.png' },
      ],
    },
  },

  css: ['~/assets/css/base.css'],
})
