import styles from './Button.module.css'

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  icon = null,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  const classes = [
    styles.btn,
    styles[size] || styles.md,
    styles[variant] || styles.secondary,
    block ? styles.block : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  )
}
