import { db, pageAll, slugify, siteUrl } from '~~/server/utils/db'

/**
 * sitemap.xml — every public dataset, plus the static pages.
 *
 * Built from titles because slugs are derived rather than stored, which means
 * two layers whose titles slugify identically collapse to one URL. That is a
 * genuine collision, not a sitemap bug: the second one is unreachable at that
 * address anyway, so listing it would advertise a URL that resolves to its
 * neighbour. Dropped here, and worth fixing at the source with a slug column.
 *
 * At 4,672 datasets this is comfortably inside the 50,000-URL / 50MB limit, so
 * no index file is needed. If the catalogue passes ~40,000, split it.
 *
 * Cached for an hour — recomputing a full catalogue page per crawler hit is
 * exactly the kind of thing that makes a small dyno look broken.
 */
export default defineCachedEventHandler(
  async (event) => {
    const sb = db()
    const rows = await pageAll<any>((from, to) =>
      sb
        .from('layers')
        .select('title,updated_at,created_at')
        .eq('visibility', 'public')
        .gt('feature_count', 0)
        .range(from, to),
    )

    const SITE = siteUrl()
    const seen = new Set<string>()
    const urls: string[] = []

    // Static pages first — they matter more than any single dataset.
    urls.push(`  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`)
    urls.push(`  <url><loc>${SITE}/licence</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`)
    urls.push(`  <url><loc>${SITE}/sources</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    urls.push(`  <url><loc>${SITE}/maps</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`)
    urls.push(`  <url><loc>${SITE}/tools</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`)

    /* The map pages are static HTML in public/, so nothing else knows they
       exist: until this was added, 26 maps were absent from the sitemap, unlinked
       from the site and invisible to search. They are read from disk rather than
       hard-coded so a new map appears here the moment it is deployed. */
    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir('public/maps')
      for (const f of files.sort()) {
        if (!f.endsWith('.html') || f.startsWith('_')) continue
        urls.push(`  <url><loc>${SITE}/maps/${f}</loc>`
          + `<changefreq>monthly</changefreq><priority>0.8</priority></url>`)
      }
    } catch {
      // a missing directory should not take the whole sitemap down
    }

    for (const r of rows) {
      const slug = slugify(r.title)
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      const stamp = String(r.updated_at || r.created_at || '').slice(0, 10)
      const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(stamp) ? `<lastmod>${stamp}</lastmod>` : ''
      // slugify() emits only [a-z0-9-], so nothing here needs XML escaping.
      urls.push(`  <url><loc>${SITE}/d/${slug}</loc>${lastmod}<changefreq>monthly</changefreq></url>`)
    }

    setHeader(event, 'content-type', 'application/xml; charset=utf-8')
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
  },
  { maxAge: 3600, name: 'sitemap', getKey: () => 'v1', swr: true },
)
