<template>
  <header class="top">
    <div class="wrap inner">
      <NuxtLink to="/" class="brand mono">geopen<b>.io</b></NuxtLink>
      <nav class="mono">
        <NuxtLink to="/">Browse</NuxtLink>
        <NuxtLink to="/about">About</NuxtLink>
      </nav>
    </div>
  </header>
</template>
<style scoped>
.top { border-bottom: 1px solid var(--rule); background: var(--panel); }
.inner { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 24px; }
.brand { font-size: 15px; font-weight: 600; text-decoration: none; letter-spacing: -.01em; }
.brand b { color: var(--accent); font-weight: 600; }
nav { display: flex; gap: 20px; font-size: 12.5px; color: var(--ink-2); }
nav a { text-decoration: none; }
nav a:hover { color: var(--accent); }
</style>
