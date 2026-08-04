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
export default defineEventHandler(async (event) => {
  const p = getQuery(event)
  const q = String(p.q || '').trim()
  const limit = Math.min(parseInt(String(p.limit || 24)) || 24, 100)
  const offset = Math.max(parseInt(String(p.offset || 0)) || 0, 0)
  const sort = String(p.sort || 'newest')

  const sb = db()
  let sel = sb
    .from('layers')
    .select('uuid,title,description,tags,feature_count,created_at,source_url', { count: 'exact' })
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
      created_at: l.created_at,
    })),
  }
})
