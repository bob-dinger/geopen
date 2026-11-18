import type { MapEntry } from './mapCatalogue'

/**
 * The map index served at the root of maps.thetexasatlas.com.
 *
 * Rendered as one plain HTML string, not a Vue page. The Atlas host shares this
 * app's router with geopen.io, where "/" is the catalogue; a Vue page reached
 * by rewriting the URL would hydrate on the client as geopen's homepage. A
 * self-contained document has no router to disagree with.
 */

export const ATLAS_HOST = 'maps.thetexasatlas.com'
const PUBLICATION = 'https://www.thetexasatlas.com'

const GROUPS: { key: string; label: string; test: (m: MapEntry) => boolean }[] = [
  { key: 'tools', label: 'Tools', test: (m) => m.type === 'tool' },
  { key: 'houston', label: 'Houston', test: (m) => /houston/.test(m.slug) },
  { key: 'dallas', label: 'Dallas', test: (m) => /dallas/.test(m.slug) },
  { key: 'dfw', label: 'Dallas–Fort Worth', test: (m) => /^(dfw|fort-worth)-/.test(m.slug) },
  { key: 'beyond', label: 'Beyond Texas', test: (m) => /^us-/.test(m.slug) },
  { key: 'texas', label: 'Texas', test: () => true },
]
// Display order differs from matching order: tools are matched first so a
// Dallas tool is not also listed as a Dallas map, but read last.
const ORDER = ['dallas', 'dfw', 'houston', 'texas', 'beyond', 'tools']

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function card(m: MapEntry): string {
  const href = `/${m.slug}`
  const shot = m.card
    ? `<a class="shot" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(m.card)}" alt="" loading="lazy" decoding="async" width="1200" height="630" onerror="this.parentNode.remove()"></a>`
    : ''
  return `<article class="card">${shot}<div class="body"><h3><a href="${href}">${esc(m.title)}</a></h3>${m.blurb ? `<p>${esc(m.blurb)}</p>` : ''}</div></article>`
}

export function renderAtlasIndex(maps: MapEntry[]): string {
  const buckets: Record<string, MapEntry[]> = {}
  for (const m of maps) {
    const g = GROUPS.find((g) => g.test(m))!
    ;(buckets[g.key] ||= []).push(m)
  }
  const sections = ORDER.filter((k) => buckets[k]?.length).map((k) => {
    const label = GROUPS.find((g) => g.key === k)!.label
    return `<section id="${k}"><h2>${label} <span class="n">${buckets[k].length}</span></h2><div class="grid">${buckets[k].map(card).join('')}</div></section>`
  })
  const nav = ORDER.filter((k) => buckets[k]?.length)
    .map((k) => `<a href="#${k}">${GROUPS.find((g) => g.key === k)!.label}</a>`)
    .join('')
  const desc = `${maps.length} maps of Texas land, housing, zoning, wildfire and public records from The Texas Atlas. Every map's data is free to download on geopen.io.`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maps — The Texas Atlas</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://${ATLAS_HOST}/">
<meta property="og:title" content="Maps — The Texas Atlas">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://${ATLAS_HOST}/">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
:root { --bg:#faf8f4; --panel:#fff; --ink:#1d1b18; --ink-2:#4a4640; --ink-3:#7a746b; --rule:#e4dfd6; --accent:#9a3d1c; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#16140f; --panel:#1f1c17; --ink:#f1ece4; --ink-2:#c9c2b6; --ink-3:#958d80; --rule:#34302a; --accent:#e0875f; } }
:root[data-theme="dark"] { --bg:#16140f; --panel:#1f1c17; --ink:#f1ece4; --ink-2:#c9c2b6; --ink-3:#958d80; --rule:#34302a; --accent:#e0875f; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width:1180px; margin:0 auto; padding:0 16px; }
header.top { padding:34px 0 22px; border-bottom:1px solid var(--rule); }
.brand { font-family: Georgia, "Times New Roman", serif; font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); text-decoration:none; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight:400; font-size:clamp(2rem,5vw,3rem); letter-spacing:-.01em; margin:8px 0 10px; }
.lead { color:var(--ink-2); max-width:62ch; margin:0; }
.lead a { color:var(--accent); }
nav.jump { display:flex; flex-wrap:wrap; gap:6px 16px; padding:14px 0; font-size:13px; border-bottom:1px solid var(--rule); }
nav.jump a { color:var(--ink-2); text-decoration:none; }
nav.jump a:hover { color:var(--accent); }
section { padding:26px 0 8px; }
h2 { font-family: Georgia, "Times New Roman", serif; font-weight:400; font-size:1.45rem; margin:0 0 14px; }
h2 .n { font-family: inherit; font-size:.8rem; color:var(--ink-3); font-variant-numeric:tabular-nums; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
.card { background:var(--panel); border:1px solid var(--rule); border-radius:6px; overflow:hidden; display:flex; flex-direction:column; }
.card:hover { border-color:var(--accent); }
.shot { display:block; line-height:0; }
.shot img { display:block; width:100%; height:auto; aspect-ratio:1200/630; object-fit:cover; }
.body { padding:12px 14px 14px; }
h3 { font-size:15px; font-weight:600; line-height:1.3; margin:0 0 5px; }
h3 a { color:inherit; text-decoration:none; }
h3 a:hover { color:var(--accent); }
.card p { font-size:13px; color:var(--ink-2); margin:0; }
footer { margin:40px 0 0; padding:20px 0 40px; border-top:1px solid var(--rule); font-size:13px; color:var(--ink-3); }
footer a { color:var(--ink-2); }
</style>
</head>
<body>
<div class="wrap">
<header class="top">
<a class="brand" href="${PUBLICATION}">The Texas Atlas</a>
<h1>Maps</h1>
<p class="lead">One map, one question. These are the maps behind the stories in <a href="${PUBLICATION}">The Texas Atlas</a>. Each page says where its numbers came from and what they cannot tell you, and the data is on <a href="https://geopen.io">geopen.io</a>.</p>
</header>
<nav class="jump" aria-label="Sections">${nav}</nav>
${sections.join('\n')}
<footer>${maps.length} maps · Stories at <a href="${PUBLICATION}">thetexasatlas.com</a> · Data on <a href="https://geopen.io">geopen.io</a>, free to download</footer>
</div>
</body>
</html>`
}
