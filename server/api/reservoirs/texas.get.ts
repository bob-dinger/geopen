/**
 * GET /api/reservoirs/texas — how full every gauged Texas reservoir is today.
 *
 * The Texas Water Development Board publishes daily conditions for 122
 * reservoirs as a CSV at waterdatafortexas.org. It sends no CORS header, so a
 * browser cannot read it however public it is — this proxies it and adds one.
 *
 * Cached for three hours: the gauges report once a day, so polling harder would
 * only add load without adding a number. Keyed by `condensed_name`, which is the
 * value baked into the `live` property of /data/texas_reservoirs.geojson.
 *
 * Returns statewide totals alongside the per-reservoir rows. "Texas is 63% full"
 * is the headline, and computing it here means every page that wants it gets the
 * same number rather than each summing the CSV its own way.
 */
type Row = {
  name: string
  percent_full: number | null
  volume_af: number | null
  capacity_af: number | null
  elevation_ft: number | null
  surface_ac: number | null
  date: string | null
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** The CSV has no embedded commas today, but a lake named "Smith, Lake" would
 *  silently shift every column, so parse quotes properly rather than split. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false }
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const head = rows.shift() || []
  return rows.filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])))
}

export default defineCachedEventHandler(async () => {
  const url = 'https://www.waterdatafortexas.org/reservoirs/recent-conditions.csv'
  try {
    const text = await $fetch<string>(url, {
      responseType: 'text',
      headers: { Accept: 'text/csv', 'User-Agent': 'geopen.io' },
      timeout: 25_000,
    })
    const rows: Record<string, Row> = {}
    let vol = 0, cap = 0, gauged = 0, latest = ''
    for (const r of parseCsv(text)) {
      const key = (r.condensed_name || '').trim()
      if (!key) continue
      const v = num(r.volume), c = num(r.conservation_capacity)
      rows[key] = {
        name: (r.full_name || key).trim(),
        percent_full: num(r.percent_full),
        volume_af: v,
        capacity_af: c,
        elevation_ft: num(r.elevation),
        surface_ac: num(r.area),
        date: (r.timestamp || '').trim() || null,
      }
      // flood-control-only pools (Addicks, Barker) report an elevation and no
      // volume — they are supposed to be empty, so counting them as 0% full
      // would drag the statewide figure down for doing their job
      if (v !== null && c) { vol += v; cap += c; gauged++ }
      if (rows[key].date && rows[key].date! > latest) latest = rows[key].date!
    }
    return {
      ok: true,
      date: latest || null,
      reservoirs: rows,
      statewide: {
        gauged,
        volume_af: Math.round(vol),
        capacity_af: Math.round(cap),
        percent_full: cap ? Math.round((vol / cap) * 1000) / 10 : null,
      },
    }
  } catch (e: any) {
    // the map is worth drawing without today's levels
    return { ok: false, reservoirs: {}, statewide: null, date: null,
      error: String(e?.message || e).slice(0, 120) }
  }
}, { maxAge: 60 * 60 * 3, swr: true, name: 'reservoirs-tx' })
