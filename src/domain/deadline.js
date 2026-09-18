import { daysUntil, formatDate } from './dates.js'

// 分级阈值：逾期 < 0 <= 3天内 <= 7天内 <= 30天内 < 更远
export function getDeadlineInfo(dueDate) {
  if (!dueDate) {
    return { level: 'none', days: null, label: '', tone: 'gray', date: null }
  }

  const days = daysUntil(dueDate)
  if (days === null) {
    return { level: 'none', days: null, label: '', tone: 'gray', date: null }
  }

  let level
  if (days < 0) level = 'overdue'
  else if (days <= 3) level = 'urgent'
  else if (days <= 7) level = 'soon'
  else if (days <= 30) level = 'normal'
  else level = 'far'

  const tone =
    level === 'overdue' || level === 'urgent' ? 'red' : level === 'soon' ? 'amber' : 'gray'

  let label
  if (days < 0) label = `已逾期 ${Math.abs(days)} 天`
  else if (days === 0) label = '今天截止'
  else if (days === 1) label = '明天截止'
  else label = `还剩 ${days} 天`

  return { level, days, label, tone, date: formatDate(dueDate) }
}

// 卡片和列表上用短标签，超过 30 天不显示，免得界面到处都是倒计时
export function getDeadlineShort(dueDate) {
  const info = getDeadlineInfo(dueDate)
  if (info.level === 'far' || info.level === 'none') return null
  return info
}

export function isOverdue(dueDate) {
  const days = daysUntil(dueDate)
  return days !== null && days < 0
}
