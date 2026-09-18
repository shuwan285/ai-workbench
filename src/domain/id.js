const counters = {}

function rand(n) {
  return Math.random().toString(36).slice(2, 2 + n)
}

// 前缀 + 时间戳 + 随机后缀，同一毫秒内连续创建也不会撞
export function makeId(prefix = 'x') {
  const n = (counters[prefix] = (counters[prefix] || 0) + 1)
  return `${prefix}_${Date.now().toString(36)}${n.toString(36)}${rand(3)}`
}
