import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The map catalogue, read from the map files themselves.
 *
 * Shared by /api/maps (the geopen.io index) and the Texas Atlas index on
 * maps.thetexasatlas.com, so both list exactly the same pages from the same
 * source of truth: each page's own <title>, description and og:image. A
 * hand-kept manifest would drift the first time a map was retitled.
 */

export const MAP_DIR = 'public/maps'

export interface MapEntry {
  slug: string
  url: string
  title: string
  blurb: string
  card: string | null
  type: string
  live: string | null
}

export async function listMaps(): Promise<MapEntry[]> {
  let files: string[] = []
  try {
    files = await readdir(MAP_DIR)
  } catch {
    return []
  }

  const maps: MapEntry[] = []
  for (const f of files) {
    // _TEMPLATE is scaffolding, not a map
    if (!f.endsWith('.html') || f.startsWith('_')) continue
    let html = ''
    try {
      html = await readFile(join(MAP_DIR, f), 'utf8')
    } catch {
      continue
    }
    const grab = (re: RegExp) => {
      const m = html.match(re)
      return m ? m[1].replace(/\s+/g, ' ').trim() : ''
    }
    const slug = f.slice(0, -5)
    const card = grab(/<meta property="og:image" content="[^"]*\/([^"/]+\.png)"/i)
    maps.push({
      slug,
      url: `/maps/${f}`,
      title: grab(/<title[^>]*>([\s\S]*?)<\/title>/i) || slug,
      // og:description is the sharper one-liner; the meta description is longer
      blurb: grab(/<meta property="og:description" content="([^"]*)"/i)
             || grab(/<meta name="description" content="([^"]*)"/i),
      card: card ? `/maps/${card}` : null,
      // A tool has a search box and a different answer tomorrow; a map is read
      // once. Declared by the page itself rather than a list kept here, for the
      // same reason the rest of this file reads the pages: a manifest drifts.
      type: grab(/<meta name="geopen:type" content="([^"]*)"/i) || 'map',
      live: grab(/<meta name="geopen:live" content="([^"]*)"/i) || null,
    })
  }
  maps.sort((a, b) => a.title.localeCompare(b.title))
  return maps
}

/** True when public/maps/<slug>.html exists. Slug is validated by the caller. */
export async function mapExists(slug: string): Promise<boolean> {
  try {
    await readFile(join(MAP_DIR, `${slug}.html`))
    return true
  } catch {
    return false
  }
}
