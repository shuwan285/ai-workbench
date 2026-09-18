import styles from './Field.module.css'

export function Field({ label, hint, error, required, htmlFor, children, className = '' }) {
  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {required && <span className={styles.req}>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : hint ? (
        <p className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className = '', ...rest }) {
  return <input className={`${styles.input} ${className}`} {...rest} />
}

export function Textarea({ className = '', rows = 4, ...rest }) {
  return (
    <textarea
      className={`${styles.input} ${styles.textarea} ${className}`}
      rows={rows}
      {...rest}
    />
  )
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${styles.input} ${styles.select} ${className}`} {...rest}>
      {children}
    </select>
  )
}

export function Checkbox({ label, className = '', ...rest }) {
  return (
    <label className={`${styles.checkbox} ${className}`}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}
