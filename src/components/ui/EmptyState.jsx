import styles from './EmptyState.module.css'

// 空状态不能只是一片空白。每个空状态都要说清「为什么空」和「下一步点哪」。
export function EmptyState({ icon = '◌', title, description, children, compact = false }) {
  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.desc}>{description}</p>}
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  )
}
