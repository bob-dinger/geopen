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
