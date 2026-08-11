/**
 * Paint properties for a dataset's map layers.
 *
 * Both map views used to hardcode one green for every dataset, which threw away
 * styling the catalogue already carries: the Project Connect plan colours its
 * Orange, Blue and Gold lines distinctly, and the subdivisions layer ramps by
 * decade built. All of it rendered as identical green.
 *
 * `layers.maplibre_layers` holds the real style — an object keyed
 * fill / fill_stroke / line / circle / symbol, each a MapLibre layer spec. This
 * reads paint out of it and falls back where a dataset has none.
 *
 * The fallback is violet rather than green on purpose: the default basemap is
 * satellite, which is mostly vegetation and soil, so a green mark sits in the
 * same hue family as the ground under it. Violet is green's complement and
 * separates from imagery at any zoom.
 */

export const DEFAULT_COLOUR = '#b14aff'

type Paint = Record<string, unknown>

function paintOf(style: any, key: string): Paint | null {
  const node = style?.[key]
  if (!node) return null
  // stored either as { paint: {...} } or flattened
  const p = node.paint && typeof node.paint === 'object' ? node.paint : node
  return p && typeof p === 'object' && Object.keys(p).length ? (p as Paint) : null
}

export function fillPaint(style: any): Paint {
  return paintOf(style, 'fill') ?? { 'fill-color': DEFAULT_COLOUR, 'fill-opacity': 0.45 }
}

/**
 * Polygon outlines stay white regardless of the dataset's own style: a coloured
 * outline on a same-coloured fill leaves adjacent polygons with no visible edge
 * over satellite imagery.
 */
export function fillStrokePaint(): Paint {
  return { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.9 }
}

export function linePaint(style: any, width = 2): Paint {
  const p = paintOf(style, 'line')
  if (p && p['line-color']) return p
  return { 'line-color': DEFAULT_COLOUR, 'line-width': width, 'line-opacity': 0.95 }
}

export function circlePaint(style: any, radius = 5): Paint {
  const p = paintOf(style, 'circle')
  if (p && p['circle-color']) return p
  return {
    'circle-radius': radius,
    'circle-color': DEFAULT_COLOUR,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.5,
  }
}

/**
 * Legend rows, when the dataset colours itself by a field via a `match`
 * expression. Returns [] for a flat colour, so callers can hide the legend.
 */
export function legendItems(style: any): Array<{ label: string; color: string }> {
  for (const key of ['fill', 'line', 'circle']) {
    const p = paintOf(style, key)
    const expr: any = p?.[`${key === 'circle' ? 'circle' : key === 'line' ? 'line' : 'fill'}-color`]
    if (Array.isArray(expr) && expr[0] === 'match') {
      const out: Array<{ label: string; color: string }> = []
      for (let i = 2; i < expr.length - 1; i += 2) {
        if (typeof expr[i] === 'string' && typeof expr[i + 1] === 'string') {
          out.push({ label: expr[i], color: expr[i + 1] })
        }
      }
      if (out.length) return out
    }
  }
  return []
}
