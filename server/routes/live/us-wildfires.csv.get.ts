/**
 * GET /live/us-wildfires.csv — every active US wildfire, for a symbol map.
 *
 * Shaped for Datawrapper's symbol map, which takes latitude/longitude columns
 * directly. Size by acres, colour by containment: a 128,000-acre fire at 7%
 * contained and a 107,000-acre fire fully contained are the same size and not
 * the same news.
 *
 * Source: NIFC / WFIGS incident locations, the interagency operational feed.
 * It carries fires that reach the national system — generally where state or
 * federal resources were dispatched — so a fire fought entirely by a county
 * volunteer department may not appear at all.
 */
const NIFC = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/'
  + 'WFIGS_Incident_Locations_Current/FeatureServer/0/query'

const esc = (v: any) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const build = defineCachedFunction(async (): Promise<string> => {
  const j = await $fetch<any>(NIFC, {
    params: {
      where: "IncidentTypeCategory='WF'",
      outFields: 'IncidentName,POOState,POOCounty,IncidentSize,PercentContained,'
        + 'FireDiscoveryDateTime,FireCauseGeneral',
      outSR: 4326, resultRecordCount: 2000, f: 'geojson',
    },
    timeout: 30_000,
  }).catch(() => null)

  const head = ['fire', 'state', 'county', 'latitude', 'longitude', 'acres',
                'percent_contained', 'days_burning', 'cause']
  const rows: string[] = [head.join(',')]
  for (const f of (j?.features || [])) {
    const c = f?.geometry?.coordinates
    if (!c || c.length < 2) continue
    const p = f.properties || {}
    const disc = Number(p.FireDiscoveryDateTime || 0)
    rows.push([
      esc(p.IncidentName || 'Unnamed'),
      esc(String(p.POOState || '').slice(-2)),
      esc(p.POOCounty || ''),
      Number(c[1]).toFixed(5),
      Number(c[0]).toFixed(5),
      p.IncidentSize != null ? Math.round(Number(p.IncidentSize)) : '',
      p.PercentContained != null ? Number(p.PercentContained) : '',
      disc ? Math.round((Date.now() - disc) / 86_400_000) : '',
      esc(p.FireCauseGeneral || ''),
    ].join(','))
  }
  return rows.join('\n')
}, { maxAge: 60 * 10, swr: true, name: 'us-wildfires-csv' })

export default defineEventHandler(async (event) => {
  const body = await build()
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=300')
  return send(event, body, 'text/csv; charset=utf-8')
})
