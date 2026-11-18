import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listMaps, mapExists, MAP_DIR } from '~~/server/utils/mapCatalogue'
import { ATLAS_HOST, renderAtlasIndex } from '~~/server/utils/atlasIndex'

// Canonicalise every request to https://geopen.io and pin it with HSTS.
//
// Two things are enforced here, in one redirect rather than two:
//
//  1. Scheme. Heroku terminates TLS at the router, so the dyno always sees
//     plain HTTP — the only signal of how the client actually connected is
//     x-forwarded-proto. Without this, http://geopen.io serves a normal 200
//     and the visitor stays unencrypted for the whole session.
//
//  2. Host. www.geopen.io and the geopen-*.herokuapp.com name both resolve to
//     this app. Left alone they give every page a second and third address,
//     which splits crawlers and contradicts the canonical tags we emit.
//
// One host is deliberately not folded into geopen.io: maps.thetexasatlas.com,
// the publication's home for its maps (see atlasMaps below).
//
// Exempted: the ACM challenge path, which must stay reachable over HTTP or
// certificate renewal fails, and dev, which has no proxy header and no cert.
const CANONICAL_HOST = 'geopen.io'
const HSTS = 'max-age=31536000; includeSubDomains'

export default defineEventHandler((event) => {
  if (import.meta.dev) return

  const url = getRequestURL(event)
  if (url.pathname.startsWith('/.well-known/acme-challenge/')) return

  // Only external requests carry x-forwarded-proto — the Heroku router sets it.
  // Nuxt's server-side $fetch calls its own API routes through this middleware
  // with an internal host, and redirecting those hands the page a 301 body
  // instead of its data. Absence of the header means "not from the internet".
  const proto = getRequestHeader(event, 'x-forwarded-proto')
  if (!proto) return

  const host = (getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]

  if (host === ATLAS_HOST) return atlasMaps(event, url, proto)

  if (proto !== 'https' || (host && host !== CANONICAL_HOST)) {
    return sendRedirect(event, `https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301)
  }

  // One year, subdomains included. Not preloaded — that is irreversible in
  // practice, and worth deciding separately.
  setResponseHeader(event, 'Strict-Transport-Security', HSTS)
})

// What maps.thetexasatlas.com may serve: the map pages and everything those
// pages fetch. The prefixes come from reading every page in public/maps —
// /data/ for GeoJSON and stats, three live API families, and the card PNGs
// under /maps/. PMTiles are fetched from Supabase storage by absolute URL, so
// they need nothing here. A new map that fetches a new path must be added.
const ATLAS_PASS = [
  '/maps/',
  '/data/',
  '/_nuxt/',
  '/img/',
  '/api/maps',
  '/api/drought/',
  '/api/reservoirs/',
  '/api/places',
  '/favicon.ico',
  '/robots.txt',
]

// Map pages are addressed as /<slug>. Every asset reference inside them is
// absolute (/data/..., /maps/...png, https://...), checked when this was
// written, so serving the page one level up breaks nothing.
const SLUG = /^\/([a-z0-9][a-z0-9-]*)\/?$/

async function atlasMaps(event: any, url: URL, proto: string) {
  if (proto !== 'https') {
    return sendRedirect(event, `https://${ATLAS_HOST}${url.pathname}${url.search}`, 301)
  }
  setResponseHeader(event, 'Strict-Transport-Security', HSTS)
  const path = url.pathname

  if (path === '/') {
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    setResponseHeader(event, 'cache-control', 'public, max-age=300')
    return renderAtlasIndex(await listMaps())
  }

  if (path === '/maps' || path === '/maps/') return sendRedirect(event, `https://${ATLAS_HOST}/`, 301)

  const m = path.match(SLUG)
  if (m && (await mapExists(m[1]))) {
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    setResponseHeader(event, 'cache-control', 'public, max-age=300')
    return readFile(join(MAP_DIR, `${m[1]}.html`), 'utf8')
  }

  if (ATLAS_PASS.some((p) => path === p || path.startsWith(p))) return

  // Everything else is the catalogue, which lives on geopen.io.
  return sendRedirect(event, `https://${CANONICAL_HOST}${path}${url.search}`, 301)
}
