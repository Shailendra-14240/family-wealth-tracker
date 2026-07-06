export function formatIndian(num) {
  if (num == null || isNaN(num)) return '0'
  const n = Math.round(Number(num))
  const sign = n < 0 ? '-' : ''
  const s = Math.abs(n).toString()
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  if (!rest) return sign + last3
  return sign + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
}
