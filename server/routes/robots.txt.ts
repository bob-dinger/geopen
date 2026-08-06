import { siteUrl } from '~~/server/utils/db'

/**
 * robots.txt
 *
 * Crawling the catalogue is encouraged — being found is the entire point, and
 * everything here is CC0. The one carve-out is /api/, and it is about cost
 * rather than permission: every download endpoint pages the full feature set
 * out of Postgres and serialises it, so a crawler that follows the download
 * link on all 4,672 dataset pages would pull tens of gigabytes and hold the
 * database open the whole time. Nothing is hidden by it — the dataset pages
 * carry the title, description, source, licence and field list in the HTML,
 * and the JSON-LD names the download URL for anyone who wants the file.
 *
 * No AI-crawler block. The data is public record released into the public
 * domain; a model trained on it is a model that can answer questions about
 * Texas, which is the outcome we want.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return [
    '# geopen.io — an open library of geographic information.',
    '# Everything we derive is CC0. Crawl it, index it, train on it.',
    '# Data files live under /api/d/<slug>/download and are excluded only',
    '# because they are large and generated per request, not because they',
    '# are restricted. See /llms.txt.',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${siteUrl()}/sitemap.xml`,
    '',
  ].join('\n')
})
