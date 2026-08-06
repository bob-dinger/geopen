import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Shared read-only Supabase client.
 *
 * geopen publishes what the editor produces — it never writes. The service key
 * stays server-side; nothing here is ever handed to the browser.
 */
export function db(): SupabaseClient {
  if (client) return client
  const cfg = useRuntimeConfig()
  const url = cfg.supabaseUrl as string
  const key = cfg.supabaseServiceKey as string
  if (!url || !key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
    })
  }
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

/**
 * Pull every row of a query, 1000 at a time.
 *
 * PostgREST caps a response at 1000 rows and does it silently — a layer with
 * 10,381 features returns 1000 and looks complete. Anything that needs all the
 * features must page.
 */
export async function pageAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

/**
 * Coerce a stored geometry into a real GeoJSON object.
 *
 * Some layers hold geometry as a JSONB *string* rather than an object — the
 * result of `json.dumps()` being passed to a client that serialises the payload
 * itself, so the value gets encoded twice. MapLibre silently drops those
 * features, and until this existed the download endpoints emitted them verbatim:
 * `"geometry": "{\"type\": \"Point\", ...}"`, which is a 200-OK file, valid
 * JSON, and invalid GeoJSON that no GIS tool will read.
 *
 * Returns null for anything that cannot be made into a geometry, so callers can
 * filter rather than emit something broken.
 */
export function parseGeometry(g: any): any | null {
  if (!g) return null
  if (typeof g === 'string') {
    try {
      const p = JSON.parse(g)
      return p && typeof p === 'object' && p.type ? p : null
    } catch {
      return null
    }
  }
  return typeof g === 'object' && g.type ? g : null
}

/** "Dallas County — Government-Owned Parcels" -> "dallas-county-government-owned-parcels" */
export function slugify(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[‐-―]/g, '-')       // unicode dashes
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 80)
    .replace(/^-|-$/g, '')
}

/**
 * Resolve a URL slug to a layer row.
 *
 * There is no slug column, so a slug can only be matched by slugifying titles
 * and comparing. The obvious way to do that — pull the catalogue and scan it —
 * used to run `.limit(2000)` with no ORDER BY against 4,672 public layers.
 * Postgres is free to return any 2,000 of them, so the majority of datasets
 * were unreachable, and *which* ones varied between requests. That is invisible
 * in testing, because whatever you check by hand tends to be recent.
 *
 * Instead, narrow in the database. Slugification is lossy but order-preserving:
 * every word of the title survives, in sequence, so the title must match those
 * words joined by wildcards. That turns a 2,000-row scan into a targeted query.
 *
 * The paged fallback exists because slugify() applies NFKD normalisation —
 * "Café" becomes "cafe" in the slug, which no longer ILIKEs the accented title.
 * Rare, but silent, so it gets a real fallback rather than a 404.
 */
export async function findLayerBySlug(sb: SupabaseClient, slug: string): Promise<any | null> {
  if (/^[0-9a-f-]{36}$/i.test(slug)) {
    const { data } = await sb.from('layers').select('*').eq('uuid', slug).maybeSingle()
    if (data) return data
  }

  const words = slug.split('-').filter(Boolean)
  if (!words.length) return null

  // Two layers can carry byte-identical titles, so a slug is not guaranteed
  // unique. When that happens, prefer the one that actually has features: an
  // abandoned empty duplicate otherwise shadows the real dataset at its own
  // address, and the page renders as an empty map with a working download link
  // that returns nothing. Exactly that hid a rebuilt 1,508-feature Zillow layer
  // behind a zero-feature namesake.
  const best = (rows: any[]) => {
    const hits = rows.filter((l: any) => slugify(l.title) === slug)
    if (!hits.length) return null
    return hits.sort((a, b) => (b.feature_count || 0) - (a.feature_count || 0))[0]
  }

  // slugify() emits only [a-z0-9-], so no ILIKE wildcard can be injected here.
  const { data: near } = await sb
    .from('layers')
    .select('*')
    .eq('visibility', 'public')
    .ilike('title', `%${words.join('%')}%`)
    .limit(200)
  const hit = best(near || [])
  if (hit) return hit

  // Last resort: page the whole catalogue for titles only, then fetch the one row.
  const all = await pageAll<any>((from, to) =>
    sb.from('layers').select('uuid,title,feature_count').eq('visibility', 'public').range(from, to))
  const match = best(all)
  if (!match) return null
  const { data } = await sb.from('layers').select('*').eq('uuid', match.uuid).maybeSingle()
  return data || null
}

/**
 * Normalise the public site URL.
 *
 * Config vars get pasted by hand, and a trailing space or slash silently
 * corrupts every URL built from them — "https://geopen.io /d/foo" ended up in
 * download payloads and canonical tags before this existed. Since those URLs
 * travel inside files people keep, a typo here is not self-correcting.
 */
export function siteUrl(): string {
  const raw = String(useRuntimeConfig().public.siteUrl || '').trim()
  return raw.replace(/\s+/g, '').replace(/\/+$/, '')
}
