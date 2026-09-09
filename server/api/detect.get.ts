import { detectSource } from '~~/server/utils/detect'

/**
 * GET /api/detect?url=…
 *
 * Reports what geographic data sits behind a URL. Read-only by design: it never
 * writes to the catalogue. A suggestion is queued with this attached and a
 * person approves it.
 */
export default defineEventHandler(async (event) => {
  const url = String(getQuery(event).url || '').trim()
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'pass ?url=' })
  }
  if (url.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'url too long' })
  }
  // detection fetches a third-party server, so never cache a failure long
  const result = await detectSource(url)
  setHeader(event, 'cache-control', result.ok ? 'public, max-age=600' : 'no-store')
  return result
})
