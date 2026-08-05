// Force HTTPS and pin it with HSTS.
//
// Heroku terminates TLS at the router, so the dyno always sees plain HTTP —
// the only signal of how the client actually connected is x-forwarded-proto.
// Without this, http://geopen.io serves a normal 200 and the visitor stays on
// an unencrypted connection for the whole session.
//
// Skipped in dev (no proxy header, and localhost has no certificate) and for
// the ACM challenge path, which must stay reachable over HTTP or certificate
// renewal fails.
export default defineEventHandler((event) => {
  if (import.meta.dev) return

  const url = getRequestURL(event)
  if (url.pathname.startsWith('/.well-known/acme-challenge/')) return

  const proto = getRequestHeader(event, 'x-forwarded-proto')
  if (proto && proto !== 'https') {
    const host = getRequestHeader(event, 'host') || 'geopen.io'
    return sendRedirect(event, `https://${host}${url.pathname}${url.search}`, 301)
  }

  // One year, subdomains included. Not preloaded — that is irreversible in
  // practice, and worth deciding separately.
  setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})
