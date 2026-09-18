import { useEffect, useState } from 'react'
import { Button } from './ui/Button.jsx'
import { EmptyState } from './ui/EmptyState.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './PlanStepsModal.module.css'

// AI 拆出来的步骤先给人过一眼再落库 —— 和「导入前显示预览」一个规矩。
// 每条都能改，也能不勾。
export function PlanStepsModal({ open, onClose, proposal, source = null, model = null, onApply }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (open && proposal) setRows(proposal.map((s) => ({ ...s, selected: true })))
  }, [open, proposal])

  const patch = (idx, key, value) =>
    setRows((list) => list.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))

  const selectedCount = rows.filter((r) => r.selected).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="让 AI 拆解项目"
      width={680}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => onApply(rows.filter((r) => r.selected).map(({ selected, ...s }) => s))}
            disabled={selectedCount === 0}
          >
            加进项目（{selectedCount}）
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon="🗺"
          title="没有拆出新步骤"
          description="可能这个项目已有的步骤已经覆盖得差不多了。"
        />
      ) : (
        <div className={styles.wrap}>
          <div className={styles.head}>
            {source && (
              <span className={styles.source} data-kind={source}>
                {source === 'claude' ? `由 ${model || 'Claude'} 拆解` : '本地模拟数据'}
              </span>
            )}
            勾选要加进项目的步骤，标题和说明都能改。
          </div>

          <ul className={styles.list}>
            {rows.map((s, idx) => (
              <li key={`${s.title}-${idx}`} className={styles.row} data-off={!s.selected}>
                <label className={styles.pick}>
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={(e) => patch(idx, 'selected', e.target.checked)}
                  />
                  <input
                    className={styles.title}
                    value={s.title}
                    aria-label="步骤标题"
                    onChange={(e) => patch(idx, 'title', e.target.value)}
                  />
                </label>

                <div className={styles.field}>
                  <span className={styles.label}>要做什么</span>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={s.description}
                    onChange={(e) => patch(idx, 'description', e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>算完成</span>
                  <textarea
                    className={styles.textarea}
                    rows={1}
                    value={s.doneWhen}
                    onChange={(e) => patch(idx, 'doneWhen', e.target.value)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
