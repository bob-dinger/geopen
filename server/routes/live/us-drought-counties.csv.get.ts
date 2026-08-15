/**
 * GET /live/us-drought-counties.csv — drought severity for every US county.
 *
 * The Drought Monitor's county endpoint has no national parameter: aoi=us,
 * conus, total and US all return an empty array, and only a two-letter state
 * abbreviation works. So this walks all 50 states plus DC and stitches them
 * together — 51 requests, which is why the result is cached for six hours. The
 * Monitor only redraws once a week, on Thursdays, so that is generous.
 *
 * drought_severity is a 0-5 rank rather than a label because text classes sort
 * alphabetically, and a tool given only "D0 …"/"None" assigns arbitrary hues
 * instead of an ordered ramp.
 */
const USDM = 'https://usdmdataservices.unl.edu/api/CountyStatistics/'
  + 'GetDroughtSeverityStatisticsByAreaPercent'

const STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI '
  + 'MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY')
  .split(' ')

const LABEL: [string, string, number][] = [
  ['d4', 'D4 Exceptional', 5], ['d3', 'D3 Extreme', 4], ['d2', 'D2 Severe', 3],
  ['d1', 'D1 Moderate', 2], ['d0', 'D0 Abnormally dry', 1],
]

const esc = (v: any) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const build = defineCachedFunction(async (): Promise<string> => {
  const d = new Date()
  const day = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  const batches = await Promise.all(STATES.map((s) =>
    $fetch<any[]>(USDM, {
      params: { aoi: s, startdate: day, enddate: day, statisticsType: 1 },
      headers: { Accept: 'application/json' }, timeout: 30_000,
    }).catch(() => [])))

  const head = ['fips', 'county', 'state', 'drought', 'drought_severity',
                'pct_dry', 'pct_moderate_plus', 'pct_severe_plus', 'pct_extreme_plus']
  const rows: string[] = [head.join(',')]
  for (const batch of batches) {
    for (const r of (batch || [])) {
      if (!r?.fips) continue
      let label = 'None', rank = 0
      for (const [k, lab, n] of LABEL) {
        if (Number((r as any)[k] || 0) > 0) { label = lab; rank = n; break }
      }
      rows.push([
        esc(String(r.fips).trim()),
        esc(String(r.county || '').replace(/ County$/, '')),
        esc(r.state || ''),
        esc(label), rank,
        Number(r.d0 || 0), Number(r.d1 || 0), Number(r.d2 || 0), Number(r.d3 || 0),
      ].join(','))
    }
  }
  return rows.join('\n')
}, { maxAge: 60 * 60 * 6, swr: true, name: 'us-drought-counties-csv' })

export default defineEventHandler(async (event) => {
  const body = await build()
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=1800')
  return send(event, body, 'text/csv; charset=utf-8')
})
