import { mapExists } from '~~/server/utils/mapCatalogue'

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
// Map pages moved to maps.thetexasatlas.com on 20 Nov 2026 (repo
// bob-dinger/thetexasatlas); geopen keeps the data catalogue. Old map links,
// /maps/<slug>.html, are sent there permanently so nothing shared breaks. The
// copies under public/maps stay so the redirect can tell a real map from a typo;
// card images and data are still served here for the catalogue.
//
// Exempted: the ACM challenge path, which must stay reachable over HTTP or
// certificate renewal fails, and dev, which has no proxy header and no cert.
const CANONICAL_HOST = 'geopen.io'
const MAPS_HOST = 'maps.thetexasatlas.com'
const HSTS = 'max-age=31536000; includeSubDomains'
const MAP_PAGE = /^\/maps\/([a-z0-9][a-z0-9-]*)\.html$/

export default defineEventHandler(async (event) => {
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

  const m = url.pathname.match(MAP_PAGE)
  if (m && (await mapExists(m[1]))) {
    return sendRedirect(event, `https://${MAPS_HOST}/${m[1]}${url.search}`, 301)
  }

  if (proto !== 'https' || (host && host !== CANONICAL_HOST)) {
    return sendRedirect(event, `https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301)
  }

  // One year, subdomains included. Not preloaded — that is irreversible in
  // practice, and worth deciding separately.
  setResponseHeader(event, 'Strict-Transport-Security', HSTS)
})
