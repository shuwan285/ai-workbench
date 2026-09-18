import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { makeId } from '../domain/id.js'
import styles from './Toast.module.css'

const ToastContext = createContext(null)

const ICONS = { info: 'ℹ️', success: '✓', warn: '!', error: '✕' }

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, options = {}) => {
      const id = makeId('toast')
      const tone = options.tone || 'info'
      // 带操作的提示留久一点，别让用户还没点就消失了
      const fallback = options.action ? 12000 : tone === 'error' ? 8000 : 4000
      const duration = options.duration ?? fallback

      setItems((list) => [...list, { id, message, tone, action: options.action }])

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      info: (m, o) => push(m, { ...o, tone: 'info' }),
      success: (m, o) => push(m, { ...o, tone: 'success' }),
      warn: (m, o) => push(m, { ...o, tone: 'warn' }),
      error: (m, o) => push(m, { ...o, tone: 'error' }),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} role="region" aria-label="通知">
        {items.map((t) => (
          <div key={t.id} className={styles.toast} data-tone={t.tone} role="status">
            <span className={styles.icon} aria-hidden="true">
              {ICONS[t.tone]}
            </span>
            <div className={styles.body}>
              <p className={styles.message}>{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => {
                    t.action.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(t.id)}
              aria-label="关闭提示"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
