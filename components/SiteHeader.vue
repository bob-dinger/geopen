<template>
  <header class="top">
    <div class="wrap inner">
      <NuxtLink to="/" class="brand mono">
        <img src="/img/geopen-logo-64.png" alt="" width="28" height="28" class="mark" />
        <span>geopen<b>.io</b></span>
      </NuxtLink>
      <nav class="mono">
        <NuxtLink to="/">Browse</NuxtLink>
        <NuxtLink to="/sources">Sources</NuxtLink>
        <NuxtLink to="/licence">Licence</NuxtLink>
      </nav>
    </div>
  </header>
</template>
<style scoped>
.top { border-bottom: 1px solid var(--rule); background: var(--panel); }
.inner { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 24px; }
.brand { font-size: 15px; font-weight: 600; text-decoration: none; letter-spacing: -.01em;
  display: flex; align-items: center; gap: 9px; }
/* alt="" — the wordmark beside it already names the site, so announcing the
   mark again would just repeat it to a screen reader. */
.mark { display: block; width: 28px; height: 28px; object-fit: contain; flex: none; }
.brand b { color: var(--accent); font-weight: 600; }
nav { display: flex; gap: 20px; font-size: 12.5px; color: var(--ink-2); }
nav a { text-decoration: none; }
nav a:hover { color: var(--accent); }
</style>
