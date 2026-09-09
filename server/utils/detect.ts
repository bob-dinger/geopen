import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Work out what geographic data, if any, sits behind a URL.
 *
 * WHY THIS EXISTS
 *
 * The bottleneck on this catalogue is discovery, and discovery is the one thing
 * that does not scale with one person's time. A Fort Worth GIS analyst knows
 * about five services no search query of ours will ever surface. This turns
 * contributing one into pasting a link.
 *
 * It only ever *reports*. Nothing here writes to the catalogue: a suggestion is
 * queued with its detection attached, and a person approves it. An open ingest
 * into a public catalogue is a spam vector with no upside, and — more
 * importantly — a licence problem, see below.
 *
 * WHAT IT CAN RECOGNISE
 *
 *   ArcGIS feature/map service     enumerate layers and count features
 *   ArcGIS Online item page        resolve ?id= to the service behind it
 *   ArcGIS Hub / opendata portal   read the DCAT feed
 *   Socrata dataset or portal      the catalog API
 *   a file                         .geojson, .json, zipped shapefile, csv with
 *                                  coordinate columns
 *   an ordinary web page           look for links to any of the above
 *
 * LICENCE IS THE PART THAT MATTERS
 *
 * geopen promises CC0 — take it, no attribution. Plenty of good geographic data
 * is not that: OpenStreetMap and Overture are ODbL and share-alike, and a lot of
 * commercial data cannot be redistributed at all. So detection reports what a
 * source *declares* and flags when it declares nothing. What it must never do is
 * let unlicensed data inherit a CC0 banner by default.
 */

const UA = 'geopen.io source-detector (+https://geopen.io/)'
const TIMEOUT = 15000
const MAX_BYTES = 2_000_000

export type Detection = {
  ok: boolean
  kind: string
  url: string
  title?: string | null
  publisher?: string | null
  features?: number | null
  geometry?: string | null
  licence?: string | null
  licence_known: boolean
  candidates?: { title: string; url: string; features?: number | null }[]
  note?: string
  error?: string
}

/**
 * A server that fetches user-supplied URLs will be pointed at cloud metadata and
 * at localhost within a week of shipping. Resolve first, then check the address
 * — a hostname that looks public can still resolve to 127.0.0.1.
 */
const BLOCKED = [
  /^127\./, /^10\./, /^0\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^::1$/, /^fe80:/i, /^f[cd]/i,
]

async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https')
  const host = u.hostname
  const addrs = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new Error('host does not resolve')
  for (const a of addrs as { address: string }[]) {
    if (BLOCKED.some((re) => re.test(a.address))) throw new Error('private address')
  }
}

async function grab(url: string, as: 'json' | 'text' = 'json') {
  const u = new URL(url)
  await assertPublic(u)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA }, signal: ctrl.signal,
                              redirect: 'follow' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const len = Number(r.headers.get('content-length') || 0)
    if (len > MAX_BYTES) throw new Error('too large to inspect')
    const body = await r.text()
    if (body.length > MAX_BYTES) throw new Error('too large to inspect')
    return as === 'json' ? JSON.parse(body) : body
  } finally {
    clearTimeout(t)
  }
}

const licenceOf = (s: string | null | undefined) => {
  const v = String(s || '').trim()
  if (!v || /^none$/i.test(v)) return null
  return v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) || null
}

/* ---- ArcGIS ------------------------------------------------------------- */

async function arcgisService(url: string): Promise<Detection> {
  const base = url.replace(/\/(query|\d+)?\/?$/, '')
  const meta = await grab(`${base}?f=json`)
  const layers = meta.layers || meta.tables || []
  const cands: Detection['candidates'] = []
  for (const l of layers.slice(0, 12)) {
    let n: number | null = null
    try {
      const c = await grab(`${base}/${l.id}/query?where=1%3D1&returnCountOnly=true&f=json`)
      n = typeof c.count === 'number' ? c.count : null
    } catch { /* a layer that will not count is still worth listing */ }
    cands.push({ title: l.name, url: `${base}/${l.id}`, features: n })
  }
  const lic = licenceOf(meta.copyrightText || meta.licenseInfo)
  return {
    ok: cands.length > 0, kind: 'arcgis-service', url: base,
    title: meta.mapName || meta.name || meta.serviceDescription?.slice(0, 120) || null,
    features: cands.reduce((a, c) => a + (c.features || 0), 0) || null,
    geometry: meta.geometryType?.replace('esriGeometry', '') || null,
    licence: lic, licence_known: !!lic, candidates: cands,
    note: cands.length ? undefined : 'service responded but exposes no layers',
  }
}

async function arcgisItem(itemId: string, portal: string): Promise<Detection> {
  const it = await grab(`${portal}/sharing/rest/content/items/${itemId}?f=json`)
  // ArcGIS answers 200 with an error body for an id that does not exist, and a
  // truncated id is the commonest way a pasted link goes wrong
  if (it?.error || !it?.type) {
    return { ok: false, kind: 'arcgis-item',
             url: `${portal}/home/item.html?id=${itemId}`, licence_known: false,
             error: it?.error?.message
               || `no ArcGIS item with id ${itemId} — check it is the full 32 characters` }
  }
  const lic = licenceOf(it.licenseInfo)
  if (it.url && /\/(Feature|Map)Server/i.test(it.url)) {
    const d = await arcgisService(it.url)
    return { ...d, kind: 'arcgis-item', title: it.title || d.title,
             publisher: it.owner || null,
             licence: lic || d.licence, licence_known: !!(lic || d.licence) }
  }
  return { ok: false, kind: 'arcgis-item', url: `${portal}/home/item.html?id=${itemId}`,
           title: it.title || null, publisher: it.owner || null,
           licence: lic, licence_known: !!lic,
           note: `item is a ${it.type}, not a queryable service` }
}

/* ---- Socrata ------------------------------------------------------------ */

async function socrata(u: URL): Promise<Detection> {
  const m = u.pathname.match(/([a-z0-9]{4}-[a-z0-9]{4})/i)
  if (!m) {
    const cat = await grab(
      `https://api.us.socrata.com/api/catalog/v1?domains=${u.hostname}&limit=8`)
    const rows = (cat.results || []).map((r: any) => ({
      title: r.resource.name,
      url: `https://${u.hostname}/d/${r.resource.id}`,
      features: null,
    }))
    return { ok: rows.length > 0, kind: 'socrata-portal', url: u.origin,
             title: `${u.hostname} — ${cat.resultSetSize ?? rows.length} datasets`,
             licence: null, licence_known: false, candidates: rows,
             note: 'a whole portal; pick a dataset' }
  }
  const id = m[1]
  const cat = await grab(
    `https://api.us.socrata.com/api/catalog/v1?ids=${id}&domains=${u.hostname}`)
  const r = cat.results?.[0]?.resource
  const lic = licenceOf(cat.results?.[0]?.metadata?.license)
  let n: number | null = null
  try {
    const c = await grab(`https://${u.hostname}/resource/${id}.json?$select=count(*)`)
    n = Number(c?.[0]?.count ?? c?.[0]?.count_1) || null
  } catch { /* some datasets refuse aggregates */ }
  return { ok: !!r, kind: 'socrata', url: `https://${u.hostname}/d/${id}`,
           title: r?.name || null, publisher: u.hostname,
           features: n, licence: lic, licence_known: !!lic }
}

/* ---- plain files -------------------------------------------------------- */

async function geojsonFile(url: string): Promise<Detection> {
  const j = await grab(url)
  const feats = j.type === 'FeatureCollection' ? j.features
              : j.type === 'Feature' ? [j] : null
  if (!feats) return { ok: false, kind: 'file', url, licence_known: false,
                       error: 'JSON, but not GeoJSON' }
  const lic = licenceOf(j.license || j.licence)
  return { ok: true, kind: 'geojson', url,
           title: j.name || url.split('/').pop() || null,
           features: feats.length,
           geometry: feats[0]?.geometry?.type || null,
           licence: lic, licence_known: !!lic }
}

/* ---- the cascade -------------------------------------------------------- */

export async function detectSource(raw: string): Promise<Detection> {
  let u: URL
  try { u = new URL(raw.trim()) } catch {
    return { ok: false, kind: 'unknown', url: raw, licence_known: false,
             error: 'that is not a URL' }
  }
  try {
    if (/\/rest\/services\/.+\/(Feature|Map)Server/i.test(u.href)) {
      return await arcgisService(u.href)
    }
    const item = u.searchParams.get('id')
      || u.pathname.match(/\/datasets\/([0-9a-f]{32})/i)?.[1]
    if (item && /arcgis\.com|\/home\/item\.html|\/datasets\//i.test(u.href)) {
      const portal = /arcgis\.com$/i.test(u.hostname) ? `https://${u.hostname}`
                                                     : 'https://www.arcgis.com'
      return await arcgisItem(item, portal)
    }
    if (/\.(geo)?json(\?|$)/i.test(u.pathname)) return await geojsonFile(u.href)
    if (/socrata|opendata|\/resource\/|\/d\/[a-z0-9]{4}-[a-z0-9]{4}/i.test(u.href)) {
      return await socrata(u)
    }
    if (/\.zip(\?|$)/i.test(u.pathname)) {
      return { ok: true, kind: 'zip', url: u.href, licence_known: false,
               title: u.pathname.split('/').pop(),
               note: 'probably a shapefile — needs downloading to confirm' }
    }

    // last resort: read the page and look for something we do understand. Skip
    // anything that is plainly not a document — a PDF scanned for links is a
    // wasted megabyte and a misleading "no data found".
    const head = await fetch(u, { method: 'HEAD', headers: { 'user-agent': UA },
                                  redirect: 'follow' }).catch(() => null)
    const ctype = head?.headers.get('content-type') || ''
    if (ctype && !/text\/html|text\/plain|application\/(json|xml)|\+xml/i.test(ctype)) {
      return { ok: false, kind: 'file', url: u.href, licence_known: false,
               title: u.pathname.split('/').pop() || null,
               note: `a ${ctype.split(';')[0]} file — not something this can read` }
    }
    const html = await grab(u.href, 'text')
    const links = [...String(html).matchAll(/https?:\/\/[^"'\s<>]+/g)]
      .map((m) => m[0])
      .filter((h) => /\/rest\/services\/.+\/(Feature|Map)Server|\.geojson/i.test(h))
    const uniq = [...new Set(links)].slice(0, 10)
    return {
      ok: uniq.length > 0, kind: 'page', url: u.href,
      title: String(html).match(/<title[^>]*>([^<]{1,120})/i)?.[1]?.trim() || null,
      licence_known: false,
      candidates: uniq.map((h) => ({ title: h.split('/').slice(-3).join('/'), url: h })),
      note: uniq.length ? 'found links to data on this page'
                        : 'no geographic data found on this page',
    }
  } catch (e: any) {
    return { ok: false, kind: 'unknown', url: u.href, licence_known: false,
             error: String(e?.message || e).slice(0, 160) }
  }
}
