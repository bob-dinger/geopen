/**
 * GET /api/drought/texas — Texas drought coverage, this week and last.
 *
 * The US Drought Monitor's statistics service has no CORS header, so a browser
 * cannot call it directly however public the data is. This proxies it and adds
 * one, and caches for six hours because the Monitor only redraws on Thursdays —
 * polling it harder would add nothing but load on a university server.
 *
 * Returns the current week and the previous one, so a page can show the
 * direction as well as the level. A drought that is 8 points worse than last
 * week is a different story from one that has been flat all summer.
 */
export default defineCachedEventHandler(async () => {
  const day = 86_400_000
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  const url = 'https://usdmdataservices.unl.edu/api/StateStatistics/'
    + 'GetDroughtSeverityStatisticsByAreaPercent'
    + `?aoi=48&startdate=${fmt(new Date(Date.now() - 21 * day))}`
    + `&enddate=${fmt(new Date())}&statisticsType=1`

  try {
    const rows = await $fetch<any[]>(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'geopen.io' },
      timeout: 20_000,
    })
    if (!Array.isArray(rows) || !rows.length) return { ok: false, weeks: [] }
    // the service returns newest-last in some windows and newest-first in
    // others; sort rather than trust the order
    rows.sort((a, b) => +new Date(b.mapDate) - +new Date(a.mapDate))
    const weeks = rows.slice(0, 2).map((r) => ({
      date: r.mapDate,
      d0: Number(r.d0), d1: Number(r.d1), d2: Number(r.d2),
      d3: Number(r.d3), d4: Number(r.d4), none: Number(r.none),
    }))
    return { ok: true, weeks }
  } catch (e: any) {
    // a page that loses one statistic should still draw its maps
    return { ok: false, weeks: [], error: String(e?.message || e).slice(0, 120) }
  }
}, { maxAge: 60 * 60 * 6, swr: true, name: 'drought-tx' })
