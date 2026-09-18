import { stepMarker } from '../domain/roadmap.js'
import styles from './SuggestionList.module.css'

export function SuggestionSkeleton() {
  return (
    <div className={styles.skeletonBox} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  )
}

// suggestions 每项带 stepId（该在哪一步之前补）和 unrelated（看着和项目无关）。
// steps 是项目已拆好的步骤，按 order 排好 —— 下拉里按这个顺序编号，
// 和「执行路线」页的 ① ② ③ 对得上。
export function SuggestionList({
  suggestions,
  setSuggestions,
  matches,
  source = null,
  model = null,
  steps = [],
}) {
  if (suggestions.length === 0) return null

  const selectedCount = suggestions.filter((s) => s.selected).length

  const setStep = (idx, stepId) =>
    setSuggestions((list) => list.map((item, i) => (i === idx ? { ...item, stepId } : item)))

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        {source && (
          <span className={styles.source} data-kind={source}>
            {source === 'claude' ? `由 ${model || 'Claude'} 生成` : '本地模拟数据'}
          </span>
        )}
        勾选要加入的知识点（{selectedCount}/{suggestions.length}）
      </div>

      {suggestions.map((s, idx) => {
        const match = matches[s.name]
        return (
          // 步骤下拉不能放进 <label> 里 —— 点它会把复选框一起切换掉
          <div key={`${s.name}-${idx}`} className={styles.row}>
            <label className={styles.item}>
              <input
                type="checkbox"
                checked={s.selected}
                onChange={(e) =>
                  setSuggestions((list) =>
                    list.map((item, i) =>
                      i === idx ? { ...item, selected: e.target.checked } : item,
                    ),
                  )
                }
              />
              <span className={styles.body}>
                <span className={styles.name}>
                  {s.name}
                  <span className={styles.cat}>{s.category}</span>
                  <span className={styles.tag} data-kind={match ? 'reuse' : 'new'}>
                    {match ? '关联已有概念' : '新建概念'}
                  </span>
                  {s.unrelated && (
                    <span className={styles.unrelated}>看起来和这个项目无关</span>
                  )}
                </span>
                <span className={styles.reason}>{s.reasonNeeded}</span>
                {s.estimatedMinutes ? (
                  <span className={styles.meta}>预计 {s.estimatedMinutes} 分钟</span>
                ) : null}
              </span>
            </label>

            {steps.length > 0 && (
              <div className={styles.stepRow}>
                <span className={styles.stepLabel}>在哪一步之前补</span>
                <select
                  className={styles.stepSelect}
                  data-assigned={Boolean(s.stepId)}
                  value={s.stepId || ''}
                  aria-label={`${s.name} 在哪一步之前补`}
                  onChange={(e) => setStep(idx, e.target.value || null)}
                >
                  <option value="">未安排</option>
                  {steps.map((t, i) => (
                    <option key={t.id} value={t.id}>
                      {stepMarker(i)} {t.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
