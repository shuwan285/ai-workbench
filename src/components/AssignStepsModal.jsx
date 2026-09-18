import { useEffect, useState } from 'react'
import { stepMarker } from '../domain/roadmap.js'
import { Button } from './ui/Button.jsx'
import { EmptyState } from './ui/EmptyState.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './AssignStepsModal.module.css'

// AI 排完之后先给人过一眼再应用 —— 和「导入前显示预览」是同一个规矩。
// 每条都能当场改，所以这里不需要「全部接受 / 全部拒绝」那种粗粒度的选择。
export function AssignStepsModal({ open, onClose, proposal, steps = [], source = null, model = null, onApply }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (open && proposal) setRows(proposal.map((r) => ({ ...r })))
  }, [open, proposal])

  const setStep = (conceptId, stepId) =>
    setRows((list) => list.map((r) => (r.conceptId === conceptId ? { ...r, stepId } : r)))

  const placedCount = rows.filter((r) => r.stepId).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="让 AI 安排知识点"
      width={640}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => onApply(rows)} disabled={rows.length === 0}>
            应用
          </Button>
        </>
      }
    >
      {steps.length === 0 ? (
        <EmptyState
          compact
          icon="🗺"
          title="这个项目还没有拆出步骤"
          description="先到「任务与进度」里把项目拆成几步，AI 才有地方可排。"
        />
      ) : rows.length === 0 ? (
        <EmptyState compact icon="◌" title="这里还没有知识点" description="先去上面加几条。" />
      ) : (
        <div className={styles.wrap}>
          <div className={styles.head}>
            {source && (
              <span className={styles.source} data-kind={source}>
                {source === 'claude' ? `由 ${model || 'Claude'} 判断` : '本地模拟数据'}
              </span>
            )}
            排上 {placedCount} / {rows.length} 条。不合适就直接改。
          </div>

          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.conceptId} className={styles.row}>
                <div className={styles.name}>
                  <span className={styles.nameText}>{r.name}</span>
                  {r.unrelated && <span className={styles.unrelated}>看起来和这个项目无关</span>}
                </div>
                {r.reason && <p className={styles.reason}>{r.reason}</p>}
                <div className={styles.pick}>
                  <span className={styles.pickLabel}>在哪一步之前补</span>
                  <select
                    className={styles.select}
                    data-assigned={Boolean(r.stepId)}
                    value={r.stepId || ''}
                    aria-label={`${r.name} 在哪一步之前补`}
                    onChange={(e) => setStep(r.conceptId, e.target.value || null)}
                  >
                    <option value="">未安排</option>
                    {steps.map((t, i) => (
                      <option key={t.id} value={t.id}>
                        {stepMarker(i)} {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
