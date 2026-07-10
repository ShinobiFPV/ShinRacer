// World-coordinate <-> map-pixel calibration for the Forza World Map
// (Phase 17). Two very different confidence levels here — see each export's
// own comment.

// ── FH6 ──────────────────────────────────────────────────────────────────
// Real, fetched calibration data — not a guess. Sourced from
// github.com/vasyadiagnost/Forza-Horizon-6-Live-Map (map-with-HUD-mode
// branch), data/map_meta.json's "formula" block:
//   map_x = a*ForzaX + b*ForzaZ + c
//   map_y = d*ForzaX + e*ForzaZ + f
// Their map space is a 20000x20000 "native" coordinate system (their own
// map is tile-based — tile_size 256, zoom 12-18 — but the affine transform
// itself is independent of tiling). Verified against three real points from
// their data/calibration_points.csv before writing the functions below:
// forward-transforming each point's forza_x/forza_z landed within ~50px of
// their published map_x/map_y (out of a 20000px space — the source
// dataset's own calibration points appear to carry a little inherent
// placement noise), and the inverse transform round-trips every point
// exactly. Our own map image (placeholder or user-provided) is treated as
// spanning this same 20000x20000 native space, then scaled to whatever
// pixel size it actually renders at.
export const FH6_CALIBRATION = {
  nativeSize: 20000,
  transform: { a: 0.652837, b: 0.000763, c: 10387.027, d: -0.003754, e: -0.657135, f: 9846.097 },
}

// ── FH5 ──────────────────────────────────────────────────────────────────
// TODO: rough estimated world bounds only — no public per-point calibration
// dataset (equivalent to FH6's calibration_points.csv above) was found for
// FH5 in this pass. This is a simple bounding-box linear fit, not a verified
// affine transform like FH6's. Replace with real calibration points (known
// in-game landmark world coordinates + their pixel position on whatever map
// image ships) if precision matters here.
export const FH5_CALIBRATION = {
  worldBounds: { minX: -9000, maxX: 6000, minZ: -8000, maxZ: 6000 },
}

// Given a world position, return the pixel position on a map image of the
// given rendered size. Clamps to the image bounds so an off-map position
// (e.g. a landmark right at the world edge, or slightly-off calibration)
// never renders a marker outside the visible image.
export function worldToMap(x, z, game, mapWidth, mapHeight) {
  if (x == null || z == null || !mapWidth || !mapHeight) return { px: (mapWidth || 0) / 2, py: (mapHeight || 0) / 2 }
  let px, py
  if (game === 'fh6') {
    const { a, b, c, d, e, f } = FH6_CALIBRATION.transform
    const nativeX = a * x + b * z + c
    const nativeY = d * x + e * z + f
    px = (nativeX / FH6_CALIBRATION.nativeSize) * mapWidth
    py = (nativeY / FH6_CALIBRATION.nativeSize) * mapHeight
  } else {
    const { minX, maxX, minZ, maxZ } = FH5_CALIBRATION.worldBounds
    px = ((x - minX) / (maxX - minX)) * mapWidth
    py = ((z - minZ) / (maxZ - minZ)) * mapHeight
  }
  return {
    px: Math.max(0, Math.min(mapWidth, px)),
    py: Math.max(0, Math.min(mapHeight, py)),
  }
}

// Inverse of worldToMap — used for click-to-mark on the map. For FH6, this
// inverts the 2x2 affine transform exactly (verified round-trip-exact
// against the real calibration points above, unlike the forward direction's
// small inherent dataset noise).
export function mapToWorld(px, py, game, mapWidth, mapHeight) {
  if (game === 'fh6') {
    const { a, b, c, d, e, f } = FH6_CALIBRATION.transform
    const nativeX = (px / mapWidth) * FH6_CALIBRATION.nativeSize
    const nativeY = (py / mapHeight) * FH6_CALIBRATION.nativeSize
    const det = a * e - b * d
    const x = (e * (nativeX - c) - b * (nativeY - f)) / det
    const z = (a * (nativeY - f) - d * (nativeX - c)) / det
    return { x, z }
  }
  const { minX, maxX, minZ, maxZ } = FH5_CALIBRATION.worldBounds
  return {
    x: minX + (px / mapWidth) * (maxX - minX),
    z: minZ + (py / mapHeight) * (maxZ - minZ),
  }
}
