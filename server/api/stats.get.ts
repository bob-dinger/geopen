import { db } from '~~/server/utils/db'

/**
 * GET /api/stats
 *
 * Counts for the front page. Real numbers only — a catalogue that inflates its
 * own size is the first thing a sceptical reader checks.
 *
 * Feature totals are summed from layers.feature_count rather than counted on
 * the features table: a COUNT over ~2.2M rows reliably hits the statement
 * timeout, and the per-layer counter is maintained on write.
 */
export default defineEventHandler(async () => {
  const sb = db()

  const layers: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('layers')
      .select('feature_count')
      .eq('visibility', 'public')
      .gt('feature_count', 0)
      .range(from, from + 999)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data?.length) break
    layers.push(...data)
    if (data.length < 1000) break
  }

  const counted = async (table: string, filter?: (q: any) => any) => {
    try {
      let q = sb.from(table).select('*', { count: 'exact', head: true })
      if (filter) q = filter(q)
      const { count } = await q
      return count ?? 0
    } catch {
      return 0
    }
  }

  return {
    layers: layers.length,
    features: layers.reduce((a, l) => a + (l.feature_count || 0), 0),
    tilesets: await counted('pmtiles'),
    documents: await counted('civic_documents'),
  }
})
