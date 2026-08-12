import { db, pageAll, slugify } from '~~/server/utils/db'

/**
 * GET /api/source/:host — everything the catalogue holds from one publisher.
 *
 * The catalogue's whole claim is that each dataset says where it came from, but
 * until now that provenance was a dead end: a card told you a layer came from
 * data.texas.gov and gave you nowhere to go with it. This turns the source into
 * a way in — every layer and every tileset traced to the same publisher.
 *
 * Matching is by parsed hostname, not by substring. `source_url=ilike.*census.gov*`
 * would fold data.census.gov and www.census.gov together with anything else that
 * merely contains the string, so the query narrows with ilike and the hostname
 * is then compared exactly.
 *
 * Tilesets keep their source in `meta.source_url` rather than a column, so they
 * are filtered in code — there are only a few hundred, and reaching into JSON
 * from PostgREST for this would be harder to read than it is worth.
 */

function hostOf(url: any): string | null {
  const s = String(url || '').trim()
  if (!s) return null
  try {
    return new URL(s).hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

function thumbOf(url: any): string | null {
  const s = String(url || '').trim()
  if (!s) return null
  if (!s.includes('res.cloudinary.com') || !s.includes('/upload/')) return s
  return s.replace('/upload/', '/upload/w_560,h_320,c_fill,g_center,q_auto,f_auto/')
}

export default defineEventHandler(async (event) => {
  const raw = String(getRouterParam(event, 'host') || '').trim().toLowerCase()
  const host = raw.replace(/^www\./, '')
  // hostnames only — this value goes into a LIKE pattern
  if (!host || !/^[a-z0-9.-]{3,253}$/.test(host) || !host.includes('.')) {
    throw createError({ statusCode: 400, statusMessage: 'Not a hostname' })
  }

  const sb = db()

  const layerRows = await pageAll((from, to) =>
    sb.from('layers')
      .select('uuid,title,description,tags,feature_count,created_at,source_url,image_url')
      .eq('visibility', 'public')
      .gt('feature_count', 0)
      .ilike('source_url', `%${host}%`)
      .order('feature_count', { ascending: false })
      .range(from, to))

  const layers = (layerRows || [])
    .filter((l: any) => hostOf(l.source_url) === host)
    .map((l: any) => ({
      slug: slugify(l.title) || l.uuid,
      uuid: l.uuid,
      title: l.title,
      description: (l.description || '').slice(0, 220),
      tags: l.tags || [],
      feature_count: l.feature_count || 0,
      thumb: thumbOf(l.image_url),
      source_url: l.source_url,
    }))

  const { data: tileRows } = await sb
    .from('pmtiles')
    .select('id,title,slug,description,category,tags,feature_count,meta,pmtile_url')
    .eq('is_public', true)

  const tilesets = (tileRows || [])
    .filter((t: any) => hostOf(t?.meta?.source_url) === host)
    .map((t: any) => ({
      slug: t.slug,
      title: t.title,
      description: (t.description || '').slice(0, 220),
      category: t.category,
      tags: t.tags || [],
      feature_count: t.feature_count || 0,
      source_url: t?.meta?.source_url || null,
    }))

  if (!layers.length && !tilesets.length) {
    throw createError({ statusCode: 404, statusMessage: 'No public data from that source' })
  }

  return {
    host,
    layers,
    tilesets,
    counts: {
      layers: layers.length,
      tilesets: tilesets.length,
      features: layers.reduce((n: number, l: any) => n + l.feature_count, 0)
        + tilesets.reduce((n: number, t: any) => n + t.feature_count, 0),
    },
  }
})
