import { getDeadlineShort } from '../domain/deadline.js'
import styles from './DeadlineChip.module.css'

// 超过 30 天的截止日期不显示，免得每个卡片都在喊倒计时
export function DeadlineChip({ dueDate, done = false, emptyLabel = null }) {
  if (done) {
    return <span className={styles.done}>已完成</span>
  }

  const info = getDeadlineShort(dueDate)
  if (!info) return emptyLabel ? <span className={styles.none}>{emptyLabel}</span> : null

  return (
    <span className={styles.chip} data-level={info.level}>
      {(info.level === 'overdue' || info.level === 'urgent') && (
        <span aria-hidden="true">●</span>
      )}
      {info.label}
    </span>
  )
}
