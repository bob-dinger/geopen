import { listMaps } from '~~/server/utils/mapCatalogue'

/**
 * GET /api/maps — the map catalogue, read from the map files themselves.
 *
 * There are 26 map pages and until now none of them were reachable from the
 * site: no index, no sitemap entries, nothing linked from the homepage. Every
 * one was an orphan URL that worked only if someone was handed the link, which
 * meant a body of work that search engines did not know existed.
 *
 * The reading itself lives in server/utils/mapCatalogue.ts, shared with the
 * Texas Atlas index on maps.thetexasatlas.com.
 */
export default defineEventHandler(async () => {
  const maps = await listMaps()
  const tools = maps.filter((m) => m.type === 'tool')
  return { maps, count: maps.length, tools, toolCount: tools.length }
})
