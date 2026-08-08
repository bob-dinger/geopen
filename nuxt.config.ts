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
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://geopen.io',
      siteName: 'geopen.io',
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
