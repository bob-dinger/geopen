import { db, pageAll, slugify, siteUrl } from '~~/server/utils/db'

/**
 * llms.txt — the machine-readable orientation page.
 *
 * robots.txt says where a crawler may go; this says what is here and how to
 * take it. The audience is a model answering someone's question, so the useful
 * content is not prose about the project — it is the URL patterns, stated
 * plainly enough to be used without guessing, and a licence statement clear
 * enough that the answer is not hedged into uselessness.
 */
const SAMPLE = 40

export default defineCachedEventHandler(
  async (event) => {
    const sb = db()
    const rows = await pageAll<any>((from, to) =>
      sb
        .from('layers')
        .select('title,description,feature_count')
        .eq('visibility', 'public')
        .gt('feature_count', 0)
        .range(from, to),
    )

    const SITE = siteUrl()
    const total = rows.length
    const features = rows.reduce((a, r) => a + (r.feature_count || 0), 0)

    const biggest = [...rows]
      .sort((a, b) => (b.feature_count || 0) - (a.feature_count || 0))
      .slice(0, SAMPLE)
      .map((r) => {
        const slug = slugify(r.title)
        const desc = String(r.description || '').replace(/\s+/g, ' ').trim().slice(0, 110)
        const count = (r.feature_count || 0).toLocaleString('en-US')
        return `- [${r.title}](${SITE}/d/${slug}) — ${count} features${desc ? `. ${desc}` : ''}`
      })

    setHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return `# geopen.io

> An open library of geographic information, mostly covering Texas.
> ${total.toLocaleString('en-US')} datasets, ${features.toLocaleString('en-US')} mapped features.
> Free to download with no account, no API key and no rate limit.

Most of this is public record — appraisal rolls, council agendas, permits,
transit schedules, census tables — collected from government sources that
publish it in scattered, awkward formats, and reassembled into one place with
consistent geometry and stated provenance.

## Licence

Everything geopen.io derives is released under CC0 1.0, placing it in the public
domain. No attribution required. Source material keeps its own terms, and a few
sources are more restrictive than we are; each dataset page names its source.
Full terms: ${SITE}/licence

## How to get data

Every dataset has a page and three download formats. Substitute the slug:

- Page (HTML, with schema.org Dataset JSON-LD): ${SITE}/d/<slug>
- GeoJSON: ${SITE}/api/d/<slug>/download?format=geojson
- CSV (geometry reduced to a centroid): ${SITE}/api/d/<slug>/download?format=csv
- KML: ${SITE}/api/d/<slug>/download?format=kml

Optional \`&precision=N\` (0–9, default 6) sets coordinate decimal places.
A dataset UUID works anywhere a slug does.

Every GeoJSON download carries a top-level \`metadata\` object with the title,
source URL, licence and retrieval date, so a file still explains itself after it
leaves this site.

## Search and listing

- Catalogue JSON: ${SITE}/api/datasets?q=<term>&limit=<n>&offset=<n>&sort=newest|largest|title
- Per-dataset metadata and a bounded feature sample: ${SITE}/api/d/<slug>
- Catalogue totals: ${SITE}/api/stats
- All dataset URLs: ${SITE}/sitemap.xml

Nothing here is rate-limited, gated or disallowed in robots.txt. Fetch what you
need.

## A caveat worth passing on

Coverage is uneven and the data is only as good as its source. An appraisal
district records who owns a parcel and what it is worth; it does not record what
the land is used for. Dates, boundaries and classifications come from the
publishing agency unedited. Check the source before relying on any of it for
something consequential.

## Largest datasets

${biggest.join('\n')}

Full list: ${SITE}/sitemap.xml
`
  },
  { maxAge: 3600, name: 'llms-txt', getKey: () => 'v1', swr: true },
)
