import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx'
import { PRIORITY, PRIORITY_ORDER, PROJECT_STATUS, PROJECT_STATUS_ORDER } from '../../data/options.js'
import { addConstraint, normalizeConstraints, removeConstraint } from '../../domain/constraints.js'
import { progressDetail } from '../../domain/progress.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './OverviewTab.module.css'

function InlineText({ value, onSave, placeholder, multiline = false, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    setDraft(value || '')
  }, [value])

  const commit = () => {
    setEditing(false)
    if (draft !== (value || '')) onSave(draft.trim())
  }

  if (editing) {
    return multiline ? (
      <Textarea
        className={className}
        value={draft}
        autoFocus
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value || '')
            setEditing(false)
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
        }}
      />
    ) : (
      <Input
        className={className}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value || '')
            setEditing(false)
          }
          if (e.key === 'Enter') commit()
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className={`${styles.inline} ${className}`}
      data-empty={!value}
      onClick={() => setEditing(true)}
      title="点击编辑"
    >
      {value || placeholder}
    </button>
  )
}

function ProgressRing({ value, tone = 'blue' }) {
  const size = 96
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`项目进度 ${value}%`}
      className={styles.ring}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`var(--c-${tone})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={styles.ringFill}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="19"
        fontWeight="600"
        fill="var(--text)"
      >
        {value}%
      </text>
    </svg>
  )
}

export function OverviewTab({ project }) {
  const { state, actions } = useApp()
  const detail = progressDetail(project, state.tasks)

  const [constraintDraft, setConstraintDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState({ label: '', url: '' })

  const update = (patch) => actions.updateProject(project.id, patch)

  const setMode = (mode) => {
    if (mode === project.progressMode) return
    update({
      progressMode: mode,
      // 切手动时用当前进度打底，避免数字跳变
      manualProgress: mode === 'manual' ? detail.value : project.manualProgress,
    })
  }

  const handleAddConstraint = () => {
    const next = addConstraint(project.constraints, constraintDraft)
    if (next.length === (project.constraints || []).length) {
      setConstraintDraft('')
      return
    }
    update({ constraints: next })
    setConstraintDraft('')
  }

  const handleAddLink = () => {
    const url = linkDraft.url.trim()
    if (!url) return
    update({
      relatedLinks: [
        ...(project.relatedLinks || []),
        { label: linkDraft.label.trim() || url, url },
      ],
    })
    setLinkDraft({ label: '', url: '' })
  }

  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>项目简介</h3>
          <InlineText
            value={project.description}
            onSave={(v) => update({ description: v })}
            placeholder="点这里写两句：这个项目要做出什么、给谁看"
            multiline
            className={styles.descText}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>当前阶段</h3>
          <div className={styles.inlineRow}>
            <Select
              value={project.status}
              onChange={(e) => update({ status: e.target.value })}
              aria-label="项目状态"
            >
              {PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS[s].label}
                </option>
              ))}
            </Select>

            <Select
              value={project.priority}
              onChange={(e) => update({ priority: e.target.value })}
              aria-label="优先级"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  优先级 {PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            下一步行动
            <span className={styles.sectionHint}>首页会把它顶到最显眼的位置</span>
          </h3>
          <InlineText
            value={project.nextAction}
            onSave={(v) => update({ nextAction: v })}
            placeholder="只写一件事，具体到能立刻动手"
            className={styles.nextText}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            工具与限制
            <span className={styles.sectionHint}>会原样填进项目 Prompt</span>
          </h3>

          {(project.constraints || []).length === 0 ? (
            <p className={styles.emptyLine}>
              还没有写。一行一条，例如「只能用免费工具」「不熟悉数学推导」。
            </p>
          ) : (
            <ul className={styles.constraintList}>
              {project.constraints.map((c, i) => (
                <li key={`${c}-${i}`}>
                  <span>{c}</span>
                  <button
                    type="button"
                    aria-label={`删除「${c}」`}
                    onClick={() => update({ constraints: removeConstraint(project.constraints, i) })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.addRow}>
            <Input
              value={constraintDraft}
              onChange={(e) => setConstraintDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddConstraint()
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (text.includes('\n')) {
                  e.preventDefault()
                  const merged = normalizeConstraints([...(project.constraints || []), text])
                  update({ constraints: merged })
                  setConstraintDraft('')
                }
              }}
              placeholder="回车添加，粘贴多行会自动拆开"
            />
            <Button onClick={handleAddConstraint} disabled={!constraintDraft.trim()}>
              添加
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>备注</h3>
          <InlineText
            value={project.notes}
            onSave={(v) => update({ notes: v })}
            placeholder="随手记的东西，只有自己看"
            multiline
            className={styles.descText}
          />
        </section>
      </div>

      <aside className={styles.side}>
        <section className={styles.card}>
          <ProgressRing
            value={detail.value}
            tone={project.status === 'done' ? 'green' : 'blue'}
          />

          <div className={styles.modeToggle} role="group" aria-label="进度模式">
            <button
              type="button"
              data-active={project.progressMode !== 'manual'}
              onClick={() => setMode('auto')}
            >
              自动计算
            </button>
            <button
              type="button"
              data-active={project.progressMode === 'manual'}
              onClick={() => setMode('manual')}
            >
              手动调整
            </button>
          </div>

          <p className={styles.modeHint}>
            {project.progressMode === 'manual'
              ? '当前是手动模式，进度不随任务变化。'
              : detail.hasTasks
                ? `${detail.done} / ${detail.total} 个任务已完成。`
                : '还没有任务，进度会一直是 0%。'}
          </p>

          {project.progressMode === 'manual' && (
            <div className={styles.slider}>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={project.manualProgress ?? 0}
                aria-label="手动进度"
                onChange={(e) => update({ manualProgress: Number(e.target.value) })}
              />
              <span className="num">{project.manualProgress ?? 0}%</span>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <Field label="开始日期">
            <Input
              type="date"
              value={project.startDate || ''}
              onChange={(e) => update({ startDate: e.target.value })}
            />
          </Field>
          <Field label="截止日期">
            <Input
              type="date"
              value={project.dueDate || ''}
              onChange={(e) => update({ dueDate: e.target.value || null })}
            />
          </Field>
          <Field label="类别">
            <Select
              value={project.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              {state.settings.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="标签" hint="用顿号或逗号分隔">
            <Input
              value={(project.tags || []).join('、')}
              onChange={(e) =>
                update({
                  tags: e.target.value
                    .split(/[、,，\s]+/)
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="摄影、作业"
            />
          </Field>
        </section>

        <section className={styles.card}>
          <h3 className={styles.sideTitle}>关联链接</h3>
          {(project.relatedLinks || []).length === 0 ? (
            <p className={styles.emptyLine}>还没有链接。</p>
          ) : (
            <ul className={styles.linkList}>
              {project.relatedLinks.map((l, i) => (
                <li key={`${l.url}-${i}`}>
                  <a href={l.url} target="_blank" rel="noreferrer noopener">
                    {l.label}
                  </a>
                  <button
                    type="button"
                    aria-label={`删除链接 ${l.label}`}
                    onClick={() =>
                      update({
                        relatedLinks: project.relatedLinks.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.linkForm}>
            <Input
              value={linkDraft.label}
              onChange={(e) => setLinkDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="名称"
            />
            <Input
              value={linkDraft.url}
              onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://"
            />
            <Button
              size="sm"
              onClick={handleAddLink}
              disabled={!linkDraft.url.trim()}
              block
            >
              添加链接
            </Button>
          </div>
        </section>
      </aside>
    </div>
  )
}
