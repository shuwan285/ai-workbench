export function isNonEmptyString(v, max = 1000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max
}

// 参数数组原样交给 spawn，所以这里只做类型和长度校验，不做转义。
export function sanitizeArgs(args) {
  if (args === undefined || args === null) return []
  if (!Array.isArray(args)) throw new Error('args 必须是字符串数组')
  if (args.length > 64) throw new Error('参数过多，上限 64 个')
  return args.map((a) => {
    if (typeof a !== 'string') throw new Error('args 每一项都必须是字符串')
    if (a.includes('\0')) throw new Error('参数不能包含空字符')
    if (a.length > 2000) throw new Error('单个参数过长')
    return a
  })
}

export function isHttpUrl(v) {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
