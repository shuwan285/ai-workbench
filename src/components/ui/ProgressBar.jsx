import styles from './ProgressBar.module.css'

export function ProgressBar({ value = 0, tone = 'blue', size = 'md', label = null }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))

  return (
    <div className={styles.wrap}>
      {label && <div className={styles.label}>{label}</div>}
      <div
        className={`${styles.track} ${styles[size] || styles.md}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} data-tone={tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
