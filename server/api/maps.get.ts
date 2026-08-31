import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * GET /api/maps — the map catalogue, read from the map files themselves.
 *
 * There are 26 map pages and until now none of them were reachable from the
 * site: no index, no sitemap entries, nothing linked from the homepage. Every
 * one was an orphan URL that worked only if someone was handed the link, which
 * meant a body of work that search engines did not know existed.
 *
 * The listing is derived from each page's own <title>, description and og:image
 * rather than a hand-kept manifest. A manifest would drift the first time a map
 * was retitled and nobody remembered to update it; the page is the source of
 * truth for what the page says it is.
 */

const DIR = 'public/maps'

export default defineEventHandler(async () => {
  let files: string[] = []
  try {
    files = await readdir(DIR)
  } catch {
    return { maps: [], count: 0 }
  }

  const maps = []
  for (const f of files) {
    // _TEMPLATE is scaffolding, not a map
    if (!f.endsWith('.html') || f.startsWith('_')) continue
    let html = ''
    try {
      html = await readFile(join(DIR, f), 'utf8')
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
    })
  }
  maps.sort((a, b) => a.title.localeCompare(b.title))
  return { maps, count: maps.length }
})
