import { useEffect, useState } from 'react'
import { Button } from './ui/Button.jsx'
import { EmptyState } from './ui/EmptyState.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './ReviewPlanModal.module.css'

const KIND = {
  missing_step: { label: '缺一步', tone: 'red' },
  missing_knowledge: { label: '缺知识点', tone: 'amber' },
  weak_step: { label: '这步说不清', tone: 'amber' },
}

// 复核结果。缺的一步/知识点能当场补进去，补过的那条就地标记，
// 免得同一个东西点两遍。
export function ReviewPlanModal({
  open,
  onClose,
  verdict = '',
  gaps = [],
  source = null,
  model = null,
  onAddStep,
  onAddKnowledge,
}) {
  const [done, setDone] = useState({})

  useEffect(() => {
    if (open) setDone({})
  }, [open, gaps])

  const mark = (idx) => setDone((d) => ({ ...d, [idx]: true }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="完整度检查"
      width={680}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="primary" onClick={onClose}>
            知道了
          </Button>
        </>
      }
    >
      <div className={styles.wrap}>
        {source && (
          <span className={styles.source} data-kind={source}>
            {source === 'claude' ? `由 ${model || 'Claude'} 复核` : '本地模拟数据（只能查有没有写全）'}
          </span>
        )}

        {verdict && <p className={styles.verdict}>{verdict}</p>}

        {gaps.length === 0 ? (
          <EmptyState
            compact
            icon="✓"
            title="没看出缺口"
            description="计划里的步骤和知识点都对得上。"
          />
        ) : (
          <ul className={styles.list}>
            {gaps.map((g, idx) => {
              const kind = KIND[g.kind] || KIND.weak_step
              const applied = done[idx]
              return (
                <li key={`${g.kind}-${idx}`} className={styles.row} data-done={applied}>
                  <div className={styles.head}>
                    <span className={styles.kind} data-tone={kind.tone}>
                      {kind.label}
                    </span>
                    <span className={styles.about}>{g.about}</span>
                  </div>
                  <p className={styles.detail}>{g.detail}</p>

                  <div className={styles.actions}>
                    {applied ? (
                      <span className={styles.applied}>已补进去</span>
                    ) : (
                      <>
                        {g.kind === 'missing_step' && onAddStep && (
                          <Button
                            size="sm"
                            onClick={() => {
                              onAddStep(g)
                              mark(idx)
                            }}
                          >
                            加为一步
                          </Button>
                        )}
                        {g.kind === 'missing_knowledge' && g.knowledgeName && onAddKnowledge && (
                          <Button
                            size="sm"
                            onClick={() => {
                              onAddKnowledge(g)
                              mark(idx)
                            }}
                          >
                            加这个知识点
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
