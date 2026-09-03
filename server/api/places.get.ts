import { db, pageAll } from '~~/server/utils/db'

/**
 * GET /api/places?q=whataburger        — every place in Texas whose name matches
 * GET /api/places?category=pharmacy    — every place in a category
 *
 * Overture Maps places for Texas, 1.72M of them, in parcels.texas_places.
 *
 * WHY IT RETURNS THE WHOLE STATE AND NOT THE MAP VIEW
 *
 * A brand is a small number statewide — 851 Whataburgers, 926 H-E-Bs, 2,243
 * Starbucks. Returning all of them costs about a second and means panning the
 * map needs no further requests and the export is instant and complete. A
 * bounding-box query would be faster per call and worse in every other way:
 * you would export what happened to be on screen at the moment the request
 * fired, which is a subtly wrong answer to "give me all of them".
 *
 * Categories are bigger (25,260 Mexican restaurants) and are capped.
 *
 * The `parcels` schema is not the PostgREST default, hence .schema('parcels').
 */

const MAX = 12000
const DP = 5 // ~1 metre; the source is not more accurate than its geocoder

type Row = {
  id: string
  primary_name: string | null
  brand: string | null
  primary_category: string | null
  address: string | null
  city: string | null
  operating_status: string | null
  websites: any
  confidence: number | null
  geometry_geojson: string | null
}

export default defineEventHandler(async (event) => {
  const { q, category } = getQuery(event) as { q?: string; category?: string }
  const term = (q || '').trim()
  const cat = (category || '').trim().toLowerCase()

  if (!term && !cat) {
    return { type: 'FeatureCollection', features: [], query: null, count: 0 }
  }
  if (term && term.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Search for at least three characters' })
  }

  const sb = db()
  const cols = 'id,primary_name,brand,primary_category,address,city,operating_status,' +
               'websites,confidence,geometry_geojson'

  const rows = await pageAll<Row>((from, to) => {
    let sel = sb.schema('parcels').from('texas_places').select(cols).range(from, to)
    // Match the brand as well as the recorded name: Overture identifies the
    // chain separately, so a store signed something else still belongs to it.
    // A trigram index covers the unanchored name pattern.
    if (term) sel = sel.or(`primary_name.ilike.%${term}%,brand.ilike.%${term}%`)
    if (cat) sel = sel.eq('primary_category', cat)
    return sel
  })

  const features = []
  for (const r of rows.slice(0, MAX)) {
    if (!r.geometry_geojson) continue
    let g: any
    try { g = JSON.parse(r.geometry_geojson) } catch { continue }
    const c = g?.coordinates
    if (!Array.isArray(c) || typeof c[0] !== 'number') continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+c[0].toFixed(DP), +c[1].toFixed(DP)] },
      properties: {
        id: r.id,
        name: r.primary_name,
        brand: r.brand,
        category: r.primary_category,
        address: r.address,
        city: r.city,
        status: r.operating_status,
        website: Array.isArray(r.websites) ? r.websites[0] || null : null,
        confidence: r.confidence == null ? null : Number(r.confidence.toFixed(2)),
      },
    })
  }

  /* Overture is a compilation and has not fully merged its sources: the same
     Whataburger appears twice, once named "Whataburger" and once "Doniphan &
     Thorn", from two contributors. Brand-matching surfaces both, which took one
     chain from 851 results to 1,586.

     Collapse records sharing a brand within ~110m. Two outlets of one chain
     that close together do not exist, and the threshold matters: at 11m the
     chain still reported 1,058 against a real Texas estimate near 750; at 110m
     it reports 827. A grid alone would miss pairs that straddle a cell edge, so
     each candidate is measured against the cell it lands in and its eight
     neighbours. Unbranded places are left alone — there is no safe key. */
  const MERGE_M = 110
  const CELL = 3 // decimal places, ~110m at this latitude
  const cells = new Map<string, number[]>()
  const merged: typeof features = []
  const metres = (ax: number, ay: number, bx: number, by: number) => {
    const mLat = 111_320, mLon = 111_320 * Math.cos((ay * Math.PI) / 180)
    return Math.hypot((ax - bx) * mLon, (ay - by) * mLat)
  }
  for (const f of features) {
    const b = f.properties.brand
    if (!b) { merged.push(f); continue }
    const [x, y] = f.geometry.coordinates
    const cx = Math.round(x * 10 ** CELL), cy = Math.round(y * 10 ** CELL)
    let hit = -1
    for (let dx = -1; dx <= 1 && hit < 0; dx++) {
      for (let dy = -1; dy <= 1 && hit < 0; dy++) {
        for (const i of cells.get(`${cx + dx}|${cy + dy}`) || []) {
          const k = merged[i]
          if (k.properties.brand !== b) continue
          const [kx, ky] = k.geometry.coordinates
          if (metres(x, y, kx, ky) <= MERGE_M) { hit = i; break }
        }
      }
    }
    if (hit < 0) {
      const key = `${cx}|${cy}`
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key)!.push(merged.length)
      merged.push(f)
      continue
    }
    // keep the record actually named for the brand, then the more confident one
    const kept = merged[hit]
    const namedForBrand = (z: any) => z.properties.name === b
    if ((namedForBrand(f) && !namedForBrand(kept)) ||
        (namedForBrand(f) === namedForBrand(kept) &&
         (f.properties.confidence || 0) > (kept.properties.confidence || 0))) {
      merged[hit] = f
    }
  }

  // Overture is a compilation of open sources; the ODbL share-alike travels
  // with anything derived from it, so it has to be on the payload as well as
  // on the page.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return {
    type: 'FeatureCollection',
    attribution: '© Overture Maps Foundation',
    license: 'ODbL-1.0',
    source: 'Overture Maps places theme, Texas extract',
    query: term || cat,
    count: merged.length,
    duplicates_merged: features.length - merged.length,
    truncated: rows.length > MAX,
    features: merged,
  }
})
