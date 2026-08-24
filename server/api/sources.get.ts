import { db, pageAll } from '~~/server/utils/db'

/**
 * GET /api/sources — every publisher the catalogue draws from.
 *
 * /source/:host already answers "what do you have from this publisher", but
 * only for someone who already knows the hostname. There was no way to see the
 * list, which meant the catalogue's central claim — that everything here traces
 * to a named source — could not actually be checked by a reader. This is the
 * index that makes the claim inspectable.
 *
 * Grouping is by parsed hostname with `www.` stripped, so data.census.gov and
 * www.data.census.gov are one publisher rather than two.
 *
 * Datasets with no source recorded are counted and reported rather than
 * quietly dropped. A sources page that silently omits the unsourced would
 * overstate exactly the thing it exists to demonstrate.
 */

function hostOf(url: any): string | null {
  const s = String(url || '').trim()
  if (!s) return null
  try {
    const h = new URL(s).hostname.replace(/^www\./, '').toLowerCase()
    return h || null
  } catch {
    return null
  }
}

export default defineEventHandler(async () => {
  const sb = db()

  const layers = await pageAll((from, to) =>
    sb.from('layers')
      .select('source_url,feature_count')
      .eq('visibility', 'public')
      .gt('feature_count', 0)
      .range(from, to))

  const { data: tiles } = await sb
    .from('pmtiles')
    .select('meta,feature_count')
    .eq('is_public', true)

  type Row = { host: string; layers: number; tilesets: number; features: number }
  const byHost = new Map<string, Row>()
  let unsourcedLayers = 0
  let unsourcedFeatures = 0

  const add = (host: string | null, features: number, kind: 'layers' | 'tilesets') => {
    if (!host) {
      unsourcedLayers += 1
      unsourcedFeatures += features
      return
    }
    const r = byHost.get(host) || { host, layers: 0, tilesets: 0, features: 0 }
    r[kind] += 1
    r.features += features
    byHost.set(host, r)
  }

  for (const l of layers || []) add(hostOf(l.source_url), l.feature_count || 0, 'layers')
  for (const t of tiles || []) add(hostOf(t?.meta?.source_url), t.feature_count || 0, 'tilesets')

  const sources = [...byHost.values()].sort(
    (a, b) => (b.layers + b.tilesets) - (a.layers + a.tilesets) || b.features - a.features)

  return {
    sources,
    totals: {
      publishers: sources.length,
      datasets: sources.reduce((n, s) => n + s.layers + s.tilesets, 0),
      features: sources.reduce((n, s) => n + s.features, 0),
      unsourced: unsourcedLayers,
      unsourced_features: unsourcedFeatures,
    },
  }
})
