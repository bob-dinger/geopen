/**
 * GET /api/fire-watch/counties.csv — live Texas county fire conditions, as CSV.
 *
 * Built to be the data source for a Datawrapper visualisation, which is the one
 * live-updating format Substack embeds natively. Datawrapper's "Link external
 * dataset" re-reads a CSV URL about once a minute and updates published charts
 * without anyone republishing, so a post can carry a map that stays current
 * long after it was written.
 *
 * Two requirements come from that consumer and shape this file. Datawrapper
 * needs CSV specifically — not JSON — and it matches Texas counties on the
 * five-digit FIPS code, so that column is emitted zero-padded and as text.
 *
 * Everything here is read live from the Texas A&M Forest Service and NIFC on
 * request. Cached for fifteen minutes, which is well inside how often either
 * source actually changes and keeps Datawrapper's polling off their servers.
 */

type Row = {
  fips: string
  county: string
  burn_ban: string
  days_under_ban: number | ''
  active_fires: number
  acres_burning: number
}

const TFS = 'https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0/query'
const NIFC = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/'
  + 'WFIGS_Incident_Locations_Current/FeatureServer/0/query'

function csv(rows: Row[]): string {
  const head = ['fips', 'county', 'burn_ban', 'days_under_ban', 'active_fires', 'acres_burning']
  const esc = (v: any) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head.join(','),
    ...rows.map((r) => head.map((k) => esc((r as any)[k])).join(','))].join('\n')
}

/**
 * The fetch+shape step is cached, not the response. defineCachedEventHandler
 * stores the body and replays it without the headers set inside, so the CSV was
 * being served as application/json — correct bytes, wrong label, and a consumer
 * that trusts content-type would reject it.
 */
const build = defineCachedFunction(async (): Promise<string> => {
  const [bans, fires] = await Promise.all([
    $fetch<any>(TFS, {
      params: { where: '1=1', outFields: 'FIPS,County,BurnBan,StartDate',
                returnGeometry: false, f: 'json' },
      timeout: 25_000,
    }).catch(() => null),
    $fetch<any>(NIFC, {
      params: { where: "IncidentTypeCategory='WF' AND POOState='US-TX'",
                outFields: 'POOCounty,IncidentSize', returnGeometry: false,
                resultRecordCount: 2000, f: 'json' },
      timeout: 25_000,
    }).catch(() => null),
  ])

  // fires arrive keyed by county *name*, bans by name and FIPS — so the join is
  // on a normalised name, and the FIPS from the ban service is what Datawrapper
  // ultimately matches on
  const fire = new Map<string, { n: number; acres: number }>()
  for (const f of (fires?.features || [])) {
    const k = String(f.attributes?.POOCounty || '').trim().toLowerCase()
    if (!k) continue
    const cur = fire.get(k) || { n: 0, acres: 0 }
    cur.n += 1
    cur.acres += Number(f.attributes?.IncidentSize || 0)
    fire.set(k, cur)
  }

  const now = Date.now()
  const rows: Row[] = []
  for (const f of (bans?.features || [])) {
    const a = f.attributes || {}
    const county = String(a.County || '').trim()
    if (!county) continue
    // the service pads FIPS with trailing spaces and omits the state prefix
    const local = String(a.FIPS || '').trim().padStart(3, '0')
    const banned = String(a.BurnBan || '').trim() === 'Yes'
    const started = Number(a.StartDate || 0)
    const hit = fire.get(county.toLowerCase())
    rows.push({
      fips: `48${local}`,
      county,
      burn_ban: banned ? 'Burn ban' : 'No ban',
      days_under_ban: banned && started ? Math.round((now - started) / 86_400_000) : '',
      active_fires: hit?.n || 0,
      acres_burning: Math.round(hit?.acres || 0),
    })
  }
  rows.sort((a, b) => a.county.localeCompare(b.county))

  return csv(rows)
}, { maxAge: 60 * 15, swr: true, name: 'fire-watch-counties' })

export default defineEventHandler(async (event) => {
  const body = await build()
  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  // Datawrapper fetches this from its own servers, so it must be readable
  // cross-origin
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=300')
  return body
})
