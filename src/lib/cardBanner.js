// Deterministic gradient banner per section, so each card reads visually
// distinct at a glance — same idea as Brightspace's course thumbnail photos,
// just generated instead of uploaded.
const GRADIENTS = [
  'from-maroon-700 to-maroon-900',
  'from-maroon-600 to-gold-700',
  'from-gold-600 to-maroon-800',
  'from-maroon-800 to-maroon-500',
  'from-gold-500 to-maroon-700',
]

export function bannerGradient(seed) {
  let hash = 0
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}
