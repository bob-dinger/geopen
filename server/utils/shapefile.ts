import JSZip from 'jszip'
import proj4 from 'proj4'

/**
 * Read what is inside a zipped shapefile without parsing a single geometry.
 *
 * WHY HEADERS AND NOT A PARSE
 *
 * A shapefile states its own size up front — that is the property that makes it
 * unstreamable on the way out, and the same property makes it cheap to inspect on
 * the way in. Everything detection needs is in two fixed-offset headers:
 *
 *   .shp  byte 32     shape type
 *         bytes 36-67 bounding box, in the file's own coordinate system
 *   .dbf  bytes 4-7   record count, little-endian
 *         byte 32+    32-byte field descriptors, terminated by 0x0D
 *
 * Measured on Dallas County's parcel file — 77MB zipped, 696,560 polygons — a
 * full parse costs 5.9s and 1,982MB of heap. Reading the headers costs 1.4s and
 * 7MB. The numbers are not estimates either way; the record count is exact.
 *
 * That 25x memory blow-up matters because /api/detect fetches URLs a stranger
 * supplied. Parsing whatever comes back is a one-paste way to take the dyno down,
 * and Texas ships genuinely enormous shapefiles — the StratMap statewide parcel
 * zip is 2.6GB. Hence a cap here as well as headers.
 *
 * PROJECTION IS THE WHOLE GAME
 *
 * GeoJSON is WGS84 by definition (RFC 7946 §4). Texas shapefiles overwhelmingly
 * are not: State Plane Texas North Central (EPSG:2276) in survey feet is the
 * common case across appraisal districts and municipal zoning. Read one without
 * honouring its .prj and you get coordinates in the millions, silently, and a
 * layer that renders somewhere off the coast of Africa. So the .prj is applied to
 * the bounding box, and a file without one is reported as unknown rather than
 * assumed to be degrees.
 */

const SHAPE_TYPES: Record<number, string> = {
  0: 'Null', 1: 'Point', 3: 'LineString', 5: 'Polygon', 8: 'MultiPoint',
  11: 'PointZ', 13: 'LineStringZ', 15: 'PolygonZ', 18: 'MultiPointZ',
  21: 'PointM', 23: 'LineStringM', 25: 'PolygonM', 28: 'MultiPointM',
  31: 'MultiPatch',
}

/** Anything above this is reported honestly rather than pulled into memory. */
export const MAX_ZIP_BYTES = 100_000_000

export type ShapefileLayer = {
  name: string
  features: number
  geometry: string
  has_z: boolean
  fields: string[]
  crs: string | null
  bbox: [number, number, number, number] | null
  bbox_native: [number, number, number, number]
  note?: string
}

/** The human-readable name out of a .prj, which is WKT and not worth parsing. */
function crsName(wkt: string): string | null {
  const m = wkt.match(/^\s*(?:PROJCS|GEOGCS)\s*\[\s*"([^"]+)"/i)
  return m ? m[1].replace(/_/g, ' ') : null
}

/**
 * Corners of the native box, reprojected. This is the box's image, not the true
 * envelope of the reprojected geometry — for a conformal projection over a county
 * or a city the difference lands in the fourth decimal, and it is a locator, not a
 * measurement. Cheap and honest beats exact and unaffordable.
 */
function toWgs84(
  bbox: [number, number, number, number],
  wkt: string | null,
): [number, number, number, number] | null {
  if (!wkt) {
    // No .prj. If it already looks like degrees, say so; otherwise admit defeat
    // rather than publishing survey feet as if they were longitude.
    const [x1, y1, x2, y2] = bbox
    const plausible = Math.abs(x1) <= 180 && Math.abs(x2) <= 180
      && Math.abs(y1) <= 90 && Math.abs(y2) <= 90
    return plausible ? bbox : null
  }
  try {
    const [x1, y1] = proj4(wkt, 'EPSG:4326', [bbox[0], bbox[1]])
    const [x2, y2] = proj4(wkt, 'EPSG:4326', [bbox[2], bbox[3]])
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null
    return [x1, y1, x2, y2]
  } catch {
    return null // exotic WKT proj4 cannot build; not a reason to fail the read
  }
}

/**
 * Every shapefile in a zip. Archives routinely hold more than one — StratMap's
 * statewide parcel download carries 60 entries — so this returns a list and lets
 * the caller decide which matters.
 */
export async function inspectShapefileZip(buf: Buffer): Promise<ShapefileLayer[]> {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)

  // __MACOSX/ holds AppleDouble copies of every entry; they parse as garbage
  const shps = names.filter(
    (n) => /\.shp$/i.test(n) && !n.startsWith('__MACOSX') && !n.split('/').pop()!.startsWith('._'),
  )

  const out: ShapefileLayer[] = []
  for (const shpName of shps) {
    const stem = shpName.replace(/\.shp$/i, '')
    const sibling = (ext: string) => {
      const want = (stem + ext).toLowerCase()
      const hit = names.find((n) => n.toLowerCase() === want)
      return hit ? zip.files[hit] : null
    }

    const shpFile = zip.files[shpName]
    const dbfFile = sibling('.dbf')
    if (!shpFile || !dbfFile) continue // a .shp with no .dbf is not a shapefile

    const head = (await shpFile.async('nodebuffer')).subarray(0, 100)
    if (head.length < 100) continue
    const code = head.readInt32LE(32)
    const geometry = SHAPE_TYPES[code] || `unknown (${code})`
    const bboxNative: [number, number, number, number] = [
      head.readDoubleLE(36), head.readDoubleLE(44),
      head.readDoubleLE(52), head.readDoubleLE(60),
    ]

    const dbf = await dbfFile.async('nodebuffer')
    const features = dbf.length >= 8 ? dbf.readUInt32LE(4) : 0
    const headerLen = dbf.length >= 10 ? dbf.readUInt16LE(8) : 0
    const fields: string[] = []
    for (let o = 32; o + 32 <= headerLen && o + 11 <= dbf.length && dbf[o] !== 0x0d; o += 32) {
      const name = dbf.subarray(o, o + 11).toString('latin1').replace(/\0.*$/, '').trim()
      if (name) fields.push(name)
    }

    const prjFile = sibling('.prj')
    const wkt = prjFile ? await prjFile.async('string') : null

    out.push({
      name: stem.split('/').pop() || stem,
      features,
      geometry,
      // Z values survive a conversion and then break the editor, so flag them
      // here rather than discovering it downstream.
      has_z: /Z$/.test(geometry),
      fields,
      crs: wkt ? crsName(wkt) : null,
      bbox: toWgs84(bboxNative, wkt),
      bbox_native: bboxNative,
      note: !prjFile
        ? 'no .prj — coordinate system undeclared'
        : undefined,
    })
  }
  return out
}
