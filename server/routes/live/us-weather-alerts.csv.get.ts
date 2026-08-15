/**
 * GET /live/us-weather-alerts.csv — active National Weather Service alerts,
 * flattened to one row per county.
 *
 * An alert covers a list of zones, and a county can sit under several at once,
 * so this expands each alert to its counties and keeps the most severe per
 * county. Otherwise a choropleth would show whichever alert happened to be
 * last in the array.
 *
 * Counties come from the SAME codes the alert carries: six digits, a leading
 * zero followed by the five-digit FIPS, which is what a US county basemap
 * matches on.
 */
const NWS = 'https://api.weather.gov/alerts/active'

const RANK: Record<string, number> = {
  Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0,
}

const esc = (v: any) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const build = defineCachedFunction(async (): Promise<string> => {
  const j = await $fetch<any>(NWS, {
    params: { status: 'actual', message_type: 'alert' },
    headers: { Accept: 'application/geo+json', 'User-Agent': 'geopen.io' },
    timeout: 30_000,
  }).catch(() => null)

  const best = new Map<string, any>()
  for (const f of (j?.features || [])) {
    const p = f?.properties || {}
    const same: string[] = p?.geocode?.SAME || []
    const rank = RANK[p.severity] ?? 0
    for (const code of same) {
      // SAME is 0 + five-digit FIPS
      const fips = String(code).replace(/^0/, '')
      if (fips.length !== 5) continue
      const cur = best.get(fips)
      if (!cur || rank > cur.rank) {
        best.set(fips, { rank, event: p.event, severity: p.severity,
                         urgency: p.urgency, headline: p.headline,
                         area: p.areaDesc, ends: p.ends || p.expires })
      }
    }
  }

  const head = ['fips', 'event', 'severity', 'severity_rank', 'urgency', 'ends', 'area']
  const rows: string[] = [head.join(',')]
  for (const [fips, a] of best) {
    rows.push([esc(fips), esc(a.event), esc(a.severity), a.rank,
               esc(a.urgency), esc(a.ends ? String(a.ends).slice(0, 16) : ''),
               esc(String(a.area || '').slice(0, 90))].join(','))
  }
  return rows.join('\n')
}, { maxAge: 60 * 5, swr: true, name: 'us-weather-alerts-csv' })

export default defineEventHandler(async (event) => {
  const body = await build()
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=120')
  return send(event, body, 'text/csv; charset=utf-8')
})
