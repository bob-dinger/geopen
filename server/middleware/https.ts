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
// Exempted: the ACM challenge path, which must stay reachable over HTTP or
// certificate renewal fails, and dev, which has no proxy header and no cert.
const CANONICAL_HOST = 'geopen.io'

export default defineEventHandler((event) => {
  if (import.meta.dev) return

  const url = getRequestURL(event)
  if (url.pathname.startsWith('/.well-known/acme-challenge/')) return

  const proto = getRequestHeader(event, 'x-forwarded-proto')
  const host = (getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]

  if ((proto && proto !== 'https') || (host && host !== CANONICAL_HOST)) {
    return sendRedirect(event, `https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301)
  }

  // One year, subdomains included. Not preloaded — that is irreversible in
  // practice, and worth deciding separately.
  setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})
