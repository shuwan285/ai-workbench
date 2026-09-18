import styles from './Badge.module.css'

// 状态徽章。颜色只表达状态，所以 tone 由调用方按语义传。
export function Badge({ tone = 'gray', children, dot = false, className = '' }) {
  return (
    <span className={`${styles.badge} ${className}`} data-tone={tone}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}
