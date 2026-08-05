import { db, pageAll, slugify } from '~~/server/utils/db'

/**
 * GET /api/d/:slug
 *
 * Dataset metadata plus a bounded sample of features. The full data is behind
 * the download endpoint; this is what the page needs to render and what a
 * crawler needs to understand the dataset.
 */
const PREVIEW_LIMIT = 4000

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const sb = db()

  const isUuid = /^[0-9a-f-]{36}$/i.test(slug)
  let layer: any = null
  if (isUuid) {
    const { data } = await sb.from('layers').select('*').eq('uuid', slug).maybeSingle()
    layer = data
  }
  if (!layer) {
    const { data } = await sb
      .from('layers')
      .select('*')
      .eq('visibility', 'public')
      .limit(2000)
    layer = (data || []).find((l: any) => slugify(l.title) === slug) || null
  }
  if (!layer || layer.visibility !== 'public') {
    throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  }

  const rows = await pageAll<any>(
    (from, to) =>
      sb
        .from('features')
        .select('geometry,properties')
        .eq('layer_uuid', layer.uuid)
        .range(from, Math.min(to, PREVIEW_LIMIT - 1)),
    1000,
  )

  const features = rows
    .filter((r) => r.geometry)
    .slice(0, PREVIEW_LIMIT)
    .map((r) => ({ type: 'Feature', geometry: r.geometry, properties: r.properties || {} }))

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
