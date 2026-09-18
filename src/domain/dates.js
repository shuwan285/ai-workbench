// 日期一律用 'YYYY-MM-DD' 字符串存，避免时区把日期算偏一天。

export function toDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayString() {
  return toDateString(new Date())
}

export function parseDate(str) {
  if (!str) return null
  const [y, m, d] = String(str).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr) || new Date()
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

// 相差天数，正数表示还有几天，负数表示已过期
export function daysUntil(dateStr) {
  const target = parseDate(dateStr)
  if (!target) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86400000)
}

export function formatDate(dateStr, withYear = false) {
  const d = parseDate(dateStr)
  if (!d) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return withYear ? `${d.getFullYear()}-${m}-${day}` : `${m}-${day}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayLabel(date = new Date()) {
  return WEEKDAYS[date.getDay()]
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

// 本周一到周日
export function currentWeekRange(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toDateString(monday), end: toDateString(sunday) }
}

// 本地时区的 ISO 时间戳，用于 createdAt / updatedAt
export function nowISO() {
  return new Date().toISOString()
}
