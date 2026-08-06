import { db, pageAll, findLayerBySlug, parseGeometry } from '~~/server/utils/db'

/**
 * GET /api/d/:slug
 *
 * Dataset metadata plus a bounded sample of features. The full data is behind
 * the download endpoint; this is what the page needs to render and what a
 * crawler needs to understand the dataset.
 */
/**
 * Preview budget.
 *
 * Feature count is a poor proxy for payload size: 4,000 points is trivial,
 * 4,000 parcel polygons is not. Sending the latter at full precision drove the
 * dyno past its 512MB quota and Heroku killed it (R14 -> R15 -> exit 137), so
 * the whole site went down when someone opened the government-parcels page.
 *
 * Budget by coordinate pairs instead, and round to 5 decimals — about a metre,
 * far finer than anything visible on a preview map. Full precision is still in
 * every download.
 */
const PREVIEW_LIMIT = 4000
const COORD_BUDGET = 260_000
const PREVIEW_DP = 5

function roundPreview(c: any): any {
  if (typeof c === 'number') return Number(c.toFixed(PREVIEW_DP))
  if (Array.isArray(c)) return c.map(roundPreview)
  return c
}

function countCoords(c: any): number {
  if (!Array.isArray(c)) return 0
  if (typeof c[0] === 'number') return 1
  let n = 0
  for (const x of c) n += countCoords(x)
  return n
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const sb = db()

  const layer = await findLayerBySlug(sb, slug)
  if (!layer || layer.visibility !== 'public') {
    throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  }

  // Page and process together, rather than collecting every raw row first and
  // shrinking afterwards — on a large polygon layer the raw set is the thing
  // that will not fit in memory.
  //
  // This previously used pageAll() with range(from, min(to, PREVIEW_LIMIT - 1)),
  // which at from=4000 asked Postgres for range(4000, 3999). PostgREST answers
  // "Requested range not satisfiable", so EVERY dataset page with 4,000 or more
  // features returned a 500.
  const PAGE = 1000
  const features: any[] = []
  let coords = 0

  for (let from = 0; from < PREVIEW_LIMIT; from += PAGE) {
    const to = Math.min(from + PAGE - 1, PREVIEW_LIMIT - 1)
    const { data, error } = await sb
      .from('features')
      .select('geometry,properties')
      .eq('layer_uuid', layer.uuid)
      .range(from, to)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data?.length) break

    for (const r of data) {
      const g = parseGeometry(r.geometry)
      if (!g) continue
      coords += countCoords(g.coordinates)
      features.push({
        type: 'Feature',
        geometry: g.coordinates ? { ...g, coordinates: roundPreview(g.coordinates) } : g,
        properties: r.properties || {},
      })
      if (features.length >= PREVIEW_LIMIT || coords >= COORD_BUDGET) break
    }

    if (features.length >= PREVIEW_LIMIT || coords >= COORD_BUDGET) break
    if (data.length < to - from + 1) break
  }

  // Field summary drives the table and tells a reader what is actually in here
  // before they download 200MB to find out.
  const fieldCounts = new Map<string, number>()
  const samples = new Map<string, any>()
  for (const f of features) {
    for (const [k, v] of Object.entries(f.properties)) {
      if (k === 'uuid') continue
      if (v === null || v === undefined || v === '') continue
      fieldCounts.set(k, (fieldCounts.get(k) || 0) + 1)
      if (!samples.has(k)) samples.set(k, v)
    }
  }
  const fields = [...fieldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, filled]) => ({
      name,
      filled,
      coverage: features.length ? Math.round((100 * filled) / features.length) : 0,
      sample: String(samples.get(name)).slice(0, 60),
    }))

  const geometryTypes = [...new Set(features.map((f) => f.geometry?.type).filter(Boolean))]

  // Bounds, so the page can fit the map without loading anything extra.
  let bbox: number[] | null = null
  for (const f of features) {
    const walk = (c: any) => {
      if (typeof c?.[0] === 'number') {
        const [x, y] = c
        if (!bbox) bbox = [x, y, x, y]
        else {
          bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y)
          bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y)
        }
      } else if (Array.isArray(c)) c.forEach(walk)
    }
    walk(f.geometry?.coordinates)
  }

  return {
    dataset: {
      uuid: layer.uuid,
      slug: slugify(layer.title) || layer.uuid,
      title: layer.title,
      description: layer.description,
      tags: layer.tags || [],
      feature_count: layer.feature_count,
      source_url: layer.source_url || null,
      updated: layer.updated_at || layer.created_at || null,
      base_map: layer.base_map,
      lat: layer.lat, lng: layer.lng, zoom: layer.zoom,
      style: layer.maplibre_layers || null,
      licence: /^(unspecified|unknown|none|n\/a|tbd|)$/i.test(String(layer.license ?? '').trim())
        ? 'CC0-1.0' : String(layer.license).trim(),
      geometry_types: geometryTypes,
      bbox,
    },
    fields,
    features,
    truncated: (layer.feature_count || 0) > features.length,
    preview_count: features.length,
  }
})
