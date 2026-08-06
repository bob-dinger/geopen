import { db } from '~~/server/utils/db'

/**
 * GET /api/stats — counts for the front page. Real numbers only.
 *
 * This is the most expensive thing the front page does, so it is cached for an
 * hour rather than recomputed per visitor. Three of the four numbers are cheap
 * (head-only counts transfer no rows); the feature total is not, and the reason
 * is worth writing down:
 *
 *   - COUNT(*) over the ~2.2M-row features table reliably hits the statement
 *     timeout, so that is out.
 *   - PostgREST aggregates would give us SUM(feature_count) in one request, but
 *     this project has them disabled (PGRST123: "Use of aggregate functions is
 *     not allowed"), so that is out too.
 *
 * What is left is paging layers.feature_count — five round trips at 4,688
 * layers. Cheap enough once an hour, far too slow once per page view.
 *
 * If the catalogue grows enough that even the hourly refresh hurts, the fix is
 * a Postgres function returning all four numbers in one query, or enabling
 * aggregates in the project's API settings.
 */

const TTL_SECONDS = 3600

export default defineCachedEventHandler(
  async () => {
    const sb = db()

    // head: true asks Postgres for the count and transfers no rows.
    const headCount = async (table: string, apply?: (q: any) => any) => {
      try {
        let q = sb.from(table).select('*', { count: 'exact', head: true })
        if (apply) q = apply(q)
        const { count, error } = await q
        return error ? 0 : count ?? 0
      } catch {
        return 0
      }
    }

    const [layerCount, tilesets, documents] = await Promise.all([
      headCount('layers', (q) => q.eq('visibility', 'public').gt('feature_count', 0)),
      headCount('pmtiles'),
      headCount('civic_documents'),
    ])

    // The one that has to page. Selecting two small columns keeps the payload
    // to a few hundred KB rather than several MB.
    let features = 0
    const hosts = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from('layers')
        .select('feature_count,source_url')
        .eq('visibility', 'public')
        .gt('feature_count', 0)
        .range(from, from + 999)
      if (error || !data?.length) break
      for (const l of data) {
        features += l.feature_count || 0
        // Distinct publishing hostnames — the "scattered across N sites" claim
        // on the front page. Computed rather than hardcoded so it cannot drift
        // away from the catalogue it describes.
        const u = String(l.source_url || '').trim()
        if (u) {
          try {
            const h = new URL(u).hostname.replace(/^www\./, '')
            if (h) hosts.add(h)
          } catch { /* unparseable source_url — not a host */ }
        }
      }
      if (data.length < 1000) break
    }

    return {
      layers: layerCount, features, tilesets, documents,
      sources: hosts.size,
      computed: new Date().toISOString(),
    }
  },
  {
    maxAge: TTL_SECONDS,
    name: 'catalogue-stats',
    getKey: () => 'v1',
    // Serve the stale value while refreshing in the background, so a visitor
    // never waits for this even when the cache has just expired.
    swr: true,
  },
)
