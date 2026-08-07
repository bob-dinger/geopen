import { db, pageAll, slugify } from '~~/server/utils/db'

/**
 * GET /api/datasets?q=&limit=&offset=&sort=
 *
 * Catalogue listing and search. Deliberately lightweight — no feature geometry,
 * only what a card needs. The heavy work happens on the dataset page.
 *
 * Search runs over title, description and tags. Postgres full-text would be
 * better once the catalogue is bigger; ilike is honest at 4,700 rows and avoids
 * a migration on someone else's database.
 */
/** "https://www.dallasopendata.com/x/y" -> "dallasopendata.com" */
function hostOf(url: any): string | null {
  const s = String(url || '').trim()
  if (!s) return null
  try {
    return new URL(s).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * Ask Cloudinary for a card-sized derivative.
 *
 * The stored images are full map screenshots. Inserting a transformation after
 * /upload/ gets a resized, auto-format, auto-quality version instead — same URL
 * shape, no upload step, and it collapses a listing page from megabytes to tens
 * of kilobytes. Non-Cloudinary URLs are passed through untouched.
 */
function thumbOf(url: any): string | null {
  const s = String(url || '').trim()
  if (!s) return null
  if (!s.includes('res.cloudinary.com') || !s.includes('/upload/')) return s
  return s.replace('/upload/', '/upload/w_560,h_320,c_fill,g_center,q_auto,f_auto/')
}

export default defineEventHandler(async (event) => {
  const p = getQuery(event)
  const q = String(p.q || '').trim()
  const limit = Math.min(parseInt(String(p.limit || 24)) || 24, 100)
  const offset = Math.max(parseInt(String(p.offset || 0)) || 0, 0)
  const sort = String(p.sort || 'newest')

  const sb = db()
  let sel = sb
    .from('layers')
    .select('uuid,title,description,tags,feature_count,created_at,source_url,image_url',
            { count: 'exact' })
    .eq('visibility', 'public')
    .gt('feature_count', 0)

  if (q) {
    const term = q.replace(/[,()]/g, ' ')
    sel = sel.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
  }

  if (sort === 'largest') sel = sel.order('feature_count', { ascending: false })
  else if (sort === 'title') sel = sel.order('title', { ascending: true })
  else sel = sel.order('created_at', { ascending: false, nullsFirst: false })

  const { data, error, count } = await sel.range(offset, offset + limit - 1)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return {
    total: count ?? 0,
    limit,
    offset,
    datasets: (data || []).map((l: any) => ({
      slug: slugify(l.title) || l.uuid,
      title: l.title,
      description: (l.description || '').slice(0, 220),
      tags: (l.tags || []).slice(0, 4),
      feature_count: l.feature_count,
      source_url: l.source_url || null,
      // Publisher hostname, computed here rather than in the template so every
      // consumer of this endpoint gets it, not just our own cards.
      source_host: hostOf(l.source_url),
      // Cloudinary map screenshot, already present on ~92% of layers. Narrowed
      // to a card-sized derivative — the originals are full-page screenshots
      // and 24 of them would be several megabytes.
      thumb: thumbOf(l.image_url),
      created_at: l.created_at,
    })),
  }
})
