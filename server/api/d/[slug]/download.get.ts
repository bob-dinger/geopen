import { Readable } from 'node:stream'
import { db, pageAll, slugify, siteUrl, findLayerBySlug, parseGeometry } from '~~/server/utils/db'

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

// Site default. Licensing is per-dataset by design: most of this is gathered
// public record rather than authored work, so CC0 is both the honest claim and
// the one that removes friction for machines. If a `license` column is added to
// `layers` later — for something genuinely authored, or a source whose terms
// forbid CC0 — it is respected without touching this file again.
const DEFAULT_LICENCE = 'CC0-1.0'
// The existing `layers.license` column is a placeholder on almost everything —
// 'UNSPECIFIED' on 4,685 of 4,688 public layers. That is not a licence, and
// publishing it as one is worse than saying nothing: an unclear licence is the
// thing that makes a careful user walk away. Placeholders fall through to the
// site default; genuine values (three layers carry CC-BY-4.0) are respected.
const PLACEHOLDER = /^(unspecified|unknown|none|n\/a|tbd|)$/i
function licenceOf(layer: any): string {
  const v = String(layer?.license ?? layer?.licence ?? '').trim()
  return PLACEHOLDER.test(v) ? DEFAULT_LICENCE : v
}

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

/**
 * Split MultiPoint into individual points.
 *
 * A note on why this is so narrow. The original `shp-write` (0.3.2) is broken
 * for polygons in a way that produces a valid-looking file: three separate
 * squares came back as ONE record with three parts, with the .shx offsets wrong
 * so records 1+ were unreadable. The aquifer layer wrote 209 DBF rows against a
 * single geometry. Nothing errored.
 *
 * `@mapbox/shp-write` (0.4.3) writes polygons and polylines correctly, and
 * handles MultiPolygon and MultiLineString natively — which is better than
 * exploding them, because multipart geometry stays one feature and attributes
 * are not duplicated. MultiPoint is the one case it still drops, so it is the
 * only one split here.
 *
 * GeometryCollection has no shapefile equivalent and is dropped.
 */
function explodeMultiPoint(feats: any[]): any[] {
  const out: any[] = []
  for (const f of feats) {
    const g = f.geometry
    if (!g?.type) continue
    if (g.type === 'MultiPoint') {
      for (const coords of g.coordinates || []) {
        out.push({ ...f, geometry: { type: 'Point', coordinates: coords } })
      }
    } else if (g.type === 'GeometryCollection') {
      continue
    } else {
      out.push(f)
    }
  }
  return out
}

/**
 * Collapse each shapefile class to a single GeoJSON type.
 *
 * shp-write emits one file set per geometry TYPE and names it from
 * options.types, keyed by shapefile class. Polygon and MultiPolygon are both
 * class "polygon", so both file sets get the same name and the second silently
 * overwrites the first inside the zip. The Texas aquifers layer — 124 Polygon
 * plus 15 MultiPolygon — produced a shapefile containing 15 records, while the
 * README dutifully reported 139.
 *
 * A shapefile polygon record already supports multiple parts, so promoting
 * Polygon to MultiPolygon (and LineString to MultiLineString) loses nothing and
 * leaves exactly one type per class.
 */
const SHP_CLASS: Record<string, 'point' | 'polyline' | 'polygon'> = {
  Point: 'point',
  LineString: 'polyline', MultiLineString: 'polyline',
  Polygon: 'polygon', MultiPolygon: 'polygon',
}

function unifyGeometryTypes(feats: any[]): { features: any[]; classes: Set<string> } {
  const classes = new Set<string>()
  const features = feats.map((f) => {
    const g = f.geometry
    const cls = SHP_CLASS[g?.type]
    if (cls) classes.add(cls)
    if (g?.type === 'Polygon') {
      return { ...f, geometry: { type: 'MultiPolygon', coordinates: [g.coordinates] } }
    }
    if (g?.type === 'LineString') {
      return { ...f, geometry: { type: 'MultiLineString', coordinates: [g.coordinates] } }
    }
    return f
  })
  return { features, classes }
}

/**
 * Map property names onto what the DBF writer will actually accept.
 *
 * The DBF format permits 10-character field names; the `dbf` package this
 * depends on truncates to 8 (src/structure.js). Deduplicating at 10 and letting
 * it cut to 8 silently recreates the collisions — a Richardson layer came back
 * with DISTRICT twice, and the second column overwrote the first, so the
 * district value was replaced by a URL. Truncate at the limit that is really
 * enforced, not the documented one.
 *
 * Collisions resolve deterministically so a dataset always produces the same
 * field names, and the full mapping ships as FIELDS.csv.
 */
const DBF_NAME_LIMIT = 8

function dbfFieldMap(feats: any[]): Map<string, string> {
  const keys = [...new Set(feats.flatMap((f) => Object.keys(f.properties || {})))]
    .filter((k) => k !== 'uuid')
  const map = new Map<string, string>()
  const used = new Set<string>()
  for (const k of keys) {
    let n = k.replace(/[^A-Za-z0-9_]/g, '_').slice(0, DBF_NAME_LIMIT).replace(/^_+/, '') || 'FIELD'
    if (used.has(n)) {
      // Leave room for the numeric suffix inside the same 8-character budget.
      const stem = n.slice(0, DBF_NAME_LIMIT - 2)
      let i = 1
      while (used.has(`${stem}_${i}`)) i++
      n = `${stem}_${i}`
    }
    used.add(n)
    map.set(k, n)
  }
  return map
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
  const asked = String(getQuery(event).format || 'geojson').toLowerCase()
  // What people actually type, mapped onto what we serve.
  const ALIAS: Record<string, string> = {
    shp: 'shapefile', zip: 'shapefile', excel: 'xlsx', xls: 'xlsx', spreadsheet: 'xlsx',
  }
  const format = ALIAS[asked] || asked
  if (!['geojson', 'csv', 'kml', 'shapefile', 'xlsx'].includes(format)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported format: ${format}` })
  }

  const sb = db()

  // Slugs are derived from titles rather than stored — see findLayerBySlug.
  const layer = await findLayerBySlug(sb, slug)
  if (!layer) throw createError({ statusCode: 404, statusMessage: 'Dataset not found' })
  if (layer.visibility !== 'public') {
    throw createError({ statusCode: 403, statusMessage: 'This dataset is not public' })
  }

  // `precision` is capped at 9 to stop a caller asking for a payload we then
  // have to build; 6 is the sensible default for anything from a CAD or survey.
  const rawDp = parseInt(String(getQuery(event).precision ?? 6))
  const dp = Number.isFinite(rawDp) ? Math.min(Math.max(rawDp, 0), 9) : 6

  const base = slugify(layer.title) || layer.uuid
  const cfg = useRuntimeConfig()
  const pageUrl = `${siteUrl()}/d/${base}`
  const retrieved = new Date().toISOString().slice(0, 10)

  /** One page of features at a time, converted and ready to emit. */
  async function* featurePages(): AsyncGenerator<any[]> {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from('features')
        .select('geometry,properties')
        .eq('layer_uuid', layer.uuid)
        .range(from, from + 999)
      if (error) throw createError({ statusCode: 500, statusMessage: error.message })
      if (!data?.length) return
      const out: any[] = []
      for (const r of data) {
        const g = parseGeometry(r.geometry)
        if (!g) continue
        out.push({ type: 'Feature', geometry: thinGeometry(g, dp), properties: r.properties || {} })
      }
      yield out
      if (data.length < 1000) return
    }
  }

  if (format === 'geojson') {
    setHeader(event, 'content-type', 'application/geo+json; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${base}.geojson"`)

    // Streamed, not buffered. Holding every row AND the serialised string at
    // once is what pushed the dyno past its 512MB quota and killed the site:
    // the Texas ZIP layer alone is 67MB of GeoJSON. Emitting page by page keeps
    // peak memory at roughly one page regardless of layer size.
    //
    // metadata has to be written before the features, so the count comes from
    // the layer row rather than from tallying as we go. That column is
    // trigger-maintained and was audited across the whole catalogue on
    // 2026-08-06, so it is trustworthy — but it is the layer's count, not a
    // tally of what this response emitted, and features with unusable geometry
    // are skipped. Named accordingly rather than implying an exact tally.
    const meta = {
      title: layer.title,
      description: layer.description || null,
      source: layer.source_url || null,
      published_by: cfg.public.siteName,
      page: pageUrl,
      licence: licenceOf(layer),
      features_in_layer: layer.feature_count ?? null,
      coordinate_precision: dp,
      downloaded: retrieved,
    }

    async function* body() {
      // Compact serialisation throughout: on the aquifer layer, pretty-printing
      // was 73% of the bytes (76.8MB against 20.7MB).
      yield `{"type":"FeatureCollection","metadata":${JSON.stringify(meta)},"features":[`
      let first = true
      for await (const page of featurePages()) {
        let chunk = ''
        for (const f of page) {
          chunk += (first ? '' : ',') + JSON.stringify(f)
          first = false
        }
        if (chunk) yield chunk
      }
      yield ']}'
    }

    return sendStream(event, Readable.from(body()))
  }

  // The remaining formats build a single in-memory artefact (a zip, a workbook,
  // a joined string), so they still need the whole set.
  const feats: any[] = []
  for await (const page of featurePages()) feats.push(...page)

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
      `# licence: ${licenceOf(layer)}  downloaded: ${retrieved}  via: ${pageUrl}\n` +
      lines.join('\n')
    )
  }

  if (format === 'shapefile') {
    const shpwrite = (await import('@mapbox/shp-write')) as any
    const JSZip = ((await import('jszip')) as any).default

    const exploded = explodeMultiPoint(feats)
    const { features: parts, classes } = unifyGeometryTypes(exploded)
    if (!parts.length) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No shapefile-compatible geometry in this dataset',
      })
    }
    // A shapefile holds one geometry class per file. When a layer has more than
    // one, each class needs its own name or they overwrite inside the zip.
    const many = classes.size > 1
    const nameFor = (c: string) => (many ? `${base}-${c}` : base)

    // DBF caps text at 254 bytes and field names at 10 characters.
    const fieldMap = dbfFieldMap(parts)
    const shaped = parts.map((f) => {
      const props: Record<string, any> = {}
      for (const [orig, short] of fieldMap) {
        const v = f.properties?.[orig]
        props[short] = typeof v === 'string' ? v.slice(0, 254)
          : v === null || v === undefined ? ''
          : typeof v === 'object' ? JSON.stringify(v).slice(0, 254)
          : v
      }
      return { type: 'Feature', geometry: f.geometry, properties: props }
    })

    // options.types is dereferenced unconditionally, so every key must exist.
    // A dataset with mixed geometry produces one file set per type, which is
    // the only thing a shapefile can represent.
    const zipped = await shpwrite.zip(
      { type: 'FeatureCollection', features: shaped },
      {
        outputType: 'nodebuffer',
        types: {
          point: nameFor('point'),
          polyline: nameFor('line'),
          polygon: nameFor('polygon'),
        },
      },
    )

    const zip = await JSZip.loadAsync(zipped)

    // Count what was actually written, from the DBF headers, rather than
    // reporting what we intended to write. Bytes 4-7 of a dBASE header are the
    // record count, little-endian. This is the check that would have caught the
    // aquifer layer shipping 15 records under a README claiming 139.
    let written = 0
    for (const path of Object.keys(zip.files)) {
      if (!path.toLowerCase().endsWith('.dbf')) continue
      const buf = await zip.files[path].async('nodebuffer')
      if (buf.length >= 8) written += buf.readUInt32LE(4)
    }
    if (written !== parts.length) {
      throw createError({
        statusCode: 500,
        statusMessage:
          `Shapefile export dropped records (${written} written, ${parts.length} expected). ` +
          'Refusing to serve an incomplete file — please report this dataset.',
      })
    }

    const renamed = [...fieldMap.entries()].filter(([a, b]) => a !== b)
    zip.file(
      'README.txt',
      [
        layer.title,
        '',
        `source:    ${layer.source_url || 'see ' + pageUrl}`,
        `licence:   ${licenceOf(layer)}`,
        `page:      ${pageUrl}`,
        `retrieved: ${retrieved}`,
        '',
        `features in source:    ${feats.length}`,
        `records in shapefile:  ${written}`,
        many
          ? `\nThis dataset mixes geometry types, and a shapefile holds only one per\n` +
            `file. It is split into ${classes.size} sets, one per type.`
          : '',
        parts.length !== feats.length
          ? '\nMultiPoint geometry was split into individual points, so one source\n' +
            'feature may appear as several records sharing identical attributes.'
          : '',
        renamed.length
          ? '\nField names were shortened to fit the 8-character limit imposed by the\n' +
            'DBF writer. See FIELDS.csv for the full mapping.'
          : '',
        '',
        'Coordinates are WGS84 (EPSG:4326).',
      ].filter(Boolean).join('\n'),
    )
    if (renamed.length) {
      zip.file(
        'FIELDS.csv',
        'shapefile_field,original_field\n' +
          renamed.map(([a, b]) => `${csvEscape(b)},${csvEscape(a)}`).join('\n'),
      )
    }

    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    setHeader(event, 'content-type', 'application/zip')
    setHeader(event, 'content-disposition', `attachment; filename="${base}-shapefile.zip"`)
    return out
  }

  if (format === 'xlsx') {
    const ExcelJS = ((await import('exceljs')) as any).default

    const keys = [...new Set(feats.flatMap((f) => Object.keys(f.properties)))]
      .filter((k) => k !== 'uuid')

    const wb = new ExcelJS.Workbook()
    wb.creator = cfg.public.siteName as string
    wb.created = new Date(retrieved)

    // Provenance gets its own sheet rather than a comment row. A spreadsheet
    // can hold it properly, and the point is that the file still explains
    // itself once it is sitting on someone's desktop.
    const meta = wb.addWorksheet('Source')
    meta.columns = [{ width: 20 }, { width: 92 }]
    for (const [k, v] of [
      ['Title', layer.title],
      ['Source', layer.source_url || `see ${pageUrl}`],
      ['Licence', licenceOf(layer)],
      ['Published by', cfg.public.siteName],
      ['Page', pageUrl],
      ['Downloaded', retrieved],
      ['Features', feats.length],
      ['Coordinates', 'WGS84 (EPSG:4326)'],
      ['Note', 'Longitude and latitude are a representative point. Full geometry is in the GeoJSON or Shapefile download.'],
    ] as [string, any][]) {
      const row = meta.addRow([k, v])
      row.getCell(1).font = { bold: true }
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    }

    const ws = wb.addWorksheet('Data')
    ws.addRow(['longitude', 'latitude', ...keys])
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length + 2 } }

    for (const f of feats) {
      const c = centroid(f.geometry)
      ws.addRow([
        c ? Number(c[0].toFixed(6)) : null,
        c ? Number(c[1].toFixed(6)) : null,
        ...keys.map((k) => {
          const v = f.properties[k]
          if (v === null || v === undefined) return null
          if (typeof v === 'number' || typeof v === 'boolean') return v
          // Excel rejects a cell longer than 32,767 characters outright.
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
          return s.length > 32000 ? s.slice(0, 32000) : s
        }),
      ])
    }

    const buf = await wb.xlsx.writeBuffer()
    setHeader(event, 'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', `attachment; filename="${base}.xlsx"`)
    return Buffer.from(buf)
  }

  setHeader(event, 'content-type', 'application/vnd.google-earth.kml+xml; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${base}.kml"`)
  return toKml(layer.title, feats)
})
