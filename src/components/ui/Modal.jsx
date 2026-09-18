import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button.jsx'
import styles from './Modal.module.css'

// 弹窗开着的时候把通知挪到顶部去。通知的层级比弹窗高（要保证弹窗里的报错看得见），
// 而两者都在底部的话，中等宽度屏幕和手机上通知会盖住弹窗的按钮 ——
// 对「必须选一个」的弹窗来说，那就是直接卡死。
let openCount = 0

function markModalOpen() {
  openCount += 1
  document.body.dataset.modalOpen = 'true'
}

function markModalClosed() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) delete document.body.dataset.modalOpen
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

// dismissible=false 用于必须做出选择才能继续的弹窗：
// 藏掉右上角的 ✕，Esc 和点遮罩也不再关闭，避免「关掉」被误解成「取消操作」。
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
  dismissible = true,
}) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    restoreRef.current = document.activeElement
    markModalOpen()

    const panel = panelRef.current
    const first = panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (dismissible) onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      // 焦点锁在弹窗里，Tab 不会跑到背后的页面上
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      markModalClosed()
      restoreRef.current?.focus?.()
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        style={{ maxWidth: `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.desc}>{description}</p>}
          </div>
          {dismissible && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
              ✕
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

// 需要用户手动输入名字才能确认的二次确认框，用在删除项目这种不可逆操作上
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  requireText = null,
  secondAction = null,
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const blocked = requireText ? typed.trim() !== requireText : false

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      width={480}
      footer={
        <>
          {secondAction && (
            <Button variant="ghost" onClick={secondAction.onClick}>
              {secondAction.label}
            </Button>
          )}
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={blocked}
            onClick={() => {
              onConfirm()
              onClose?.()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText && (
        <label className={styles.confirmInput}>
          <span>
            请输入项目名称 <strong>{requireText}</strong> 以确认：
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireText}
            autoComplete="off"
          />
        </label>
      )}
    </Modal>
  )
}
