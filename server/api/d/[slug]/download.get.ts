import { db, pageAll, slugify } from '~~/server/utils/db'

/**
 * GET /api/d/:slug/download?format=geojson|csv|kml
 *
 * The endpoint the whole catalogue exists to serve. No account, no key, no
 * rate limit — a layer you can look at but not take is a viewer, not a library.
 *
 * Provenance travels IN the file, not just on the page. A GeoJSON that ends up
 * on someone's disk should still say where it came from a year later, so the
 * source, retrieval date and licence go into a top-level `metadata` object
 * (which the spec permits as a foreign member) as well as the filename.
 */

const LICENCE = 'CC0-1.0'

/**
 * Round coordinates in place.
 *
 * Raw appraisal and survey geometry carries 14+ decimal places — sub-micron
 * precision on a parcel boundary, which is noise. Six decimals is roughly 10cm
 * at this latitude, far finer than any source here is actually accurate.
 *
 * Worth knowing this is the SMALLER win: on the aquifer layer it saved 6%.
 * The large one is serialising compactly — see below.
 */
function roundCoords(c: any, dp: number): any {
  if (typeof c === 'number') return Number(c.toFixed(dp))
  if (Array.isArray(c)) return c.map((x) => roundCoords(x, dp))
  return c
}

function thinGeometry(geom: any, dp: number): any {
  if (!geom?.coordinates) return geom
  return { ...geom, coordinates: roundCoords(geom.coordinates, dp) }
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function centroid(geom: any): [number, number] | null {
  const pts: number[][] = []
  const walk = (c: any) => {
    if (typeof c?.[0] === 'number') pts.push(c as number[])
    else if (Array.isArray(c)) c.forEach(walk)
  }
  if (!geom?.coordinates) return null
  walk(geom.coordinates)
  if (!pts.length) return null
  const n = pts.length
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n]
}

function toKml(name: string, feats: any[]): string {
  const esc = (s: any) =>
    String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
  const placemark = (f: any) => {
    const p = f.properties || {}
    const title = p.title || p.name || p.case_number || p.owner || 'Feature'
    const rows = Object.entries(p)
      .filter(([k]) => k !== 'uuid')
      .map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`)
      .join('')
    const g = f.geometry
    let geom = ''
    if (g?.type === 'Point') {
      geom = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>`
    } else {
      // KML polygon/line output is lossy for multipart geometry; a representative
      // point keeps the file valid and useful in Earth without pretending otherwise.
      const c = centroid(g)
      if (!c) return ''
      geom = `<Point><coordinates>${c[0]},${c[1]}</coordinates></Point>`
    }
    return `<Placemark><name>${esc(title)}</name><ExtendedData>${rows}</ExtendedData>${geom}</Placemark>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>
${feats.map(placemark).filter(Boolean).join('\n')}
</Document></kml>`
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const format = String(getQuery(event).format || 'geojson').toLowerCase()
  if (!['geojson', 'csv', 'kml'].includes(format)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported format: ${format}` })
  }

  const sb = db()

  // Slugs are derived from titles rather than stored, so resolve by uuid first
  // and fall back to matching a slugified title.
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
  if (!layer) throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  if (layer.visibility !== 'public') {
    throw createError({ statusCode: 403, statusMessage: 'This dataset is not public' })
  }

  const rows = await pageAll<any>((from, to) =>
    sb.from('features').select('geometry,properties').eq('layer_uuid', layer.uuid).range(from, to),
  )

  // `precision` is capped at 9 to stop a caller asking for a payload we then
  // have to build; 6 is the sensible default for anything from a CAD or survey.
  const rawDp = parseInt(String(getQuery(event).precision ?? 6))
  const dp = Number.isFinite(rawDp) ? Math.min(Math.max(rawDp, 0), 9) : 6

  const feats = rows
    .filter((r) => r.geometry)
    .map((r) => ({
      type: 'Feature',
      geometry: thinGeometry(r.geometry, dp),
      properties: r.properties || {},
    }))

  const base = slugify(layer.title) || layer.uuid
  const cfg = useRuntimeConfig()
  const pageUrl = `${cfg.public.siteUrl}/d/${base}`
  const retrieved = new Date().toISOString().slice(0, 10)

  if (format === 'geojson') {
    const body = {
      type: 'FeatureCollection',
      metadata: {
        title: layer.title,
        description: layer.description || null,
        source: layer.source_url || null,
        published_by: cfg.public.siteName,
        page: pageUrl,
        licence: LICENCE,
        feature_count: feats.length,
        coordinate_precision: dp,
        downloaded: retrieved,
      },
      features: feats,
    }
    setHeader(event, 'content-type', 'application/geo+json; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${base}.geojson"`)
    // Serialise compactly and return a string. Returning the object lets Nitro
    // pretty-print it, and on geometry-heavy layers the indentation is most of
    // the file: the Texas aquifers came to 76.8MB formatted against 20.7MB
    // compact — 73% whitespace. Nobody reads a downloaded GeoJSON by eye.
    return JSON.stringify(body)
  }

  if (format === 'csv') {
    const keys = [...new Set(feats.flatMap((f) => Object.keys(f.properties)))].filter(
      (k) => k !== 'uuid',
    )
    const head = ['longitude', 'latitude', ...keys]
    const lines = [head.join(',')]
    for (const f of feats) {
      const c = centroid(f.geometry)
      lines.push(
        [
          c ? c[0].toFixed(6) : '',
          c ? c[1].toFixed(6) : '',
          ...keys.map((k) => csvEscape(f.properties[k])),
        ].join(','),
      )
    }
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${base}.csv"`)
    // CSV cannot hold the metadata object, so the provenance rides along as a
    // comment header rather than being dropped silently.
    return (
      `# ${layer.title}\n# source: ${layer.source_url || 'see ' + pageUrl}\n` +
      `# licence: ${LICENCE}  downloaded: ${retrieved}  via: ${pageUrl}\n` +
      lines.join('\n')
    )
  }

  setHeader(event, 'content-type', 'application/vnd.google-earth.kml+xml; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${base}.kml"`)
  return toKml(layer.title, feats)
})
