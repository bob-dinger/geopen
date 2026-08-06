import { siteUrl } from '~~/server/utils/db'

/**
 * robots.txt
 *
 * Nothing is disallowed, including the download endpoints.
 *
 * They were briefly excluded on the assumption that a full crawl would be
 * ruinously expensive. Measured, it is not: the median dataset holds 10
 * features, 95% hold under 1,000 — a single Supabase round trip each — and
 * downloading the entire catalogue comes to roughly 3.4GB across ~6,500 round
 * trips, spread over however many days a crawler takes. Blocking that would
 * have traded the project's whole purpose against a cost that isn't real.
 *
 * The concentration worth knowing about is that ten datasets hold 30% of all
 * features. If crawl load ever does become a problem, those are the ones to
 * address specifically — not the catalogue as a whole.
 *
 * No AI-crawler block either. The data is public record released into the
 * public domain; a model trained on it is a model that can answer questions
 * about Texas, which is the outcome we want.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return [
    '# geopen.io — an open library of geographic information.',
    '# Everything we derive is CC0. Crawl it, index it, train on it.',
    '# Bulk data: /api/d/<slug>/download?format=geojson|csv|kml',
    '# Orientation for machines: /llms.txt',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl()}/sitemap.xml`,
    '',
  ].join('\n')
})
