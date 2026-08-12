<template>
  <header class="top">
    <div class="wrap inner">
      <NuxtLink to="/" class="brand" aria-label="geopen.io — home">
        <!--
          The wordmark is real text with the globe standing in for the "o",
          rather than an image of itself: it stays sharp at any density, scales
          with the type, inherits the theme's ink, and is still "geopen.io" to a
          screen reader and to search. The separate mark that used to sit to the
          left is gone — it said the same thing twice.
        -->
        <span class="wm" aria-hidden="true">
          <span class="lt">ge</span><svg class="globe" viewBox="0 0 100 100" role="presentation"
            focusable="false"><circle cx="50" cy="50" r="46" class="sea" /><path class="land"
              d="M20 34c8-4 15-1 21 3s13 4 18 0 12-3 16 2c-3 12-11 20-21 24-6 2-9 7-8 13-7-1-13-5-17-11-3-5-9-6-14-4-1-9 1-19 5-27z" /><path
              class="land" d="M66 74c4-3 9-4 13-2-3 7-8 12-15 15 0-5 0-9 2-13z" /><circle cx="50"
              cy="50" r="46" class="rim" /></svg><span class="lt">pen</span><b>.io</b>
        </span>
      </NuxtLink>
      <nav class="mono">
        <NuxtLink to="/">Browse</NuxtLink>
        <NuxtLink to="/licence">Licence</NuxtLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.top { border-bottom: 1px solid var(--rule); background: var(--panel); }
.inner { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 13px 24px; }

.brand { text-decoration: none; display: flex; align-items: center; }
.wm {
  display: inline-flex; align-items: center;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 25px; font-weight: 800; letter-spacing: -0.035em; line-height: 1;
  color: var(--ink);
}
.wm .lt { display: inline-block; }
.wm b { color: var(--accent); font-weight: 800; letter-spacing: -0.02em; }

/* sized to the lowercase bowl so it sits on the baseline like a real "o" */
.globe {
  width: 0.86em; height: 0.86em; display: block; flex: none;
  margin: 0 -0.012em; position: relative; top: 0.012em;
}
.globe .sea { fill: var(--accent); }
.globe .land { fill: #ffffff; opacity: 0.92; }
.globe .rim { fill: none; stroke: var(--accent); stroke-width: 8; }

nav { display: flex; gap: 20px; font-size: 12.5px; color: var(--ink-2); }
nav a { text-decoration: none; }
nav a:hover { color: var(--accent); }

@media (max-width: 520px) { .wm { font-size: 21px; } }
</style>
