import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_STATUS } from '../../data/options.js'
import {
  aggregateConcept,
  canDeleteConcept,
  groupConceptsByCategory,
} from '../../domain/knowledge.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './Knowledge.module.css'

export function Knowledge() {
  const { state, actions } = useApp()
  const toast = useToast()

  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('all')
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const groups = useMemo(
    () =>
      groupConceptsByCategory(
        state.knowledgeConcepts,
        state.projectKnowledge,
        state.projects,
      ),
    [state.knowledgeConcepts, state.projectKnowledge, state.projects],
  )

  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const out = {}
    for (const [cat, list] of Object.entries(groups)) {
      if (category !== 'all' && cat !== category) continue
      const items = kw
        ? list.filter(
            (x) =>
              x.concept.name.toLowerCase().includes(kw) ||
              (x.concept.description || '').toLowerCase().includes(kw),
          )
        : list
      if (items.length > 0) out[cat] = items
    }
    return out
  }, [groups, keyword, category])

  const total = state.knowledgeConcepts.length
  const shown = Object.values(filteredGroups).reduce((n, list) => n + list.length, 0)
  const categoriesPresent = Object.keys(groups).sort()

  const openEdit = (concept) =>
    setEditing({
      isNew: false,
      id: concept.id,
      name: concept.name,
      category: concept.category,
      description: concept.description || '',
      resourcesText: (concept.defaultResources || [])
        .map((r) => `${r.label} | ${r.url}`)
        .join('\n'),
    })

  const openNew = () =>
    setEditing({
      isNew: true,
      name: '',
      category: KNOWLEDGE_CATEGORIES[0],
      description: '',
      resourcesText: '',
    })

  const saveConcept = () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      toast.warn('知识点名称不能为空')
      return
    }
    const defaultResources = editing.resourcesText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, url] = line.split('|').map((s) => s.trim())
        return { label: label || url, url: url || label }
      })
      .filter((r) => r.url)

    const payload = {
      name,
      category: editing.category,
      description: editing.description,
      defaultResources,
    }

    if (editing.isNew) {
      actions.createConcept(payload)
      toast.success('知识点已创建。在项目里关联它就能用了。')
    } else {
      actions.updateConcept(editing.id, payload)
      toast.success('知识点已更新')
    }
    setEditing(null)
  }

  const deleteState = useMemo(() => {
    if (!deleting) return null
    const basic = canDeleteConcept(deleting.id, state.projectKnowledge)
    const agg = aggregateConcept(deleting.id, state.projectKnowledge, state.projects)
    return { ...basic, references: agg.references }
  }, [deleting, state.projectKnowledge, state.projects])

  if (total === 0) {
    return (
      <>
        <header className={styles.head}>
          <h1>知识库</h1>
        </header>
        <EmptyState
          icon="◈"
          title="知识库还是空的"
          description="在项目里添加知识点后，会自动汇总到这里，跨项目复用。"
        >
          <Button variant="primary" onClick={openNew}>
            直接新建一个知识点
          </Button>
          <Link to="/projects" className={styles.linkBtn}>
            去项目中心
          </Link>
        </EmptyState>
        <ConceptModal editing={editing} onClose={() => setEditing(null)} onSave={saveConcept} />
      </>
    )
  }

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1>知识库</h1>
          <p className={styles.sub}>
            共 <strong className="num">{total}</strong> 个知识点
            {(keyword || category !== 'all') && (
              <>
                ，当前显示 <strong className="num">{shown}</strong> 个
              </>
            )}
          </p>
        </div>
        <Button variant="primary" icon="+" onClick={openNew}>
          新建知识点
        </Button>
      </header>

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索知识点"
          aria-label="搜索知识点"
        />
        <Select
          className={styles.catSelect}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="按领域筛选"
        >
          <option value="all">全部领域</option>
          {categoriesPresent.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {shown === 0 ? (
        <EmptyState
          compact
          icon="🔍"
          title="没有匹配的知识点"
          description="换个关键词，或者把领域筛选调回「全部」。"
        />
      ) : (
        Object.entries(filteredGroups).map(([cat, list]) => (
          <section key={cat} className={styles.group}>
            <h2 className={styles.groupTitle}>
              {cat}
              <span className={`${styles.groupCount} num`}>{list.length}</span>
            </h2>

            <ul className={styles.list}>
              {list.map((entry) => {
                const status = KNOWLEDGE_STATUS[entry.status] || KNOWLEDGE_STATUS.notStarted
                const isOpen = expanded[entry.concept.id]
                return (
                  <li key={entry.concept.id} className={styles.item}>
                    <div className={styles.itemHead}>
                      <span className={styles.itemName}>{entry.concept.name}</span>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {entry.blockingCount > 0 && (
                        <span className={styles.blockTag}>
                          {entry.blockingCount} 处阻塞
                        </span>
                      )}

                      <button
                        type="button"
                        className={styles.useToggle}
                        aria-expanded={isOpen}
                        disabled={entry.usedBy === 0}
                        onClick={() =>
                          setExpanded((e) => ({
                            ...e,
                            [entry.concept.id]: !isOpen,
                          }))
                        }
                      >
                        {entry.usedBy > 0 ? `被 ${entry.usedBy} 个项目使用` : '还没被使用'}
                        {entry.usedBy > 0 && (
                          <span className={styles.chevron} data-open={isOpen} aria-hidden="true">
                            ▾
                          </span>
                        )}
                      </button>

                      <Menu
                        ariaLabel={`${entry.concept.name} 的操作`}
                        items={[
                          { label: '编辑', onClick: () => openEdit(entry.concept) },
                          {
                            label: '保存为模板',
                            onClick: () =>
                              toast.info('知识模板库是第二阶段的功能，暂时先把这条留在知识库里。'),
                          },
                          {
                            label: '删除',
                            tone: 'danger',
                            onClick: () => setDeleting(entry.concept),
                          },
                        ]}
                      />
                    </div>

                    {entry.concept.description && (
                      <p className={styles.desc}>{entry.concept.description}</p>
                    )}

                    {isOpen && (
                      <ul className={styles.refs}>
                        {entry.references.map(({ relation, project }) => {
                          const relStatus =
                            KNOWLEDGE_STATUS[relation.status] || KNOWLEDGE_STATUS.notStarted
                          return (
                            <li key={relation.id}>
                              <Link to={`/projects/${project.id}?tab=knowledge`}>
                                {project.name}
                              </Link>
                              <span className={styles.refMeta}>
                                {relStatus.label}
                                {relation.blocksProject && relation.status !== 'mastered'
                                  ? ' · 阻塞'
                                  : ''}
                                {relation.estimatedMinutes
                                  ? ` · 预计 ${relation.estimatedMinutes} 分钟`
                                  : ''}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {(entry.concept.defaultResources || []).length > 0 && (
                      <p className={styles.resources}>
                        <span aria-hidden="true">📚</span>
                        {entry.concept.defaultResources.map((r, i) => (
                          <span key={r.url}>
                            {i > 0 && ' · '}
                            <a href={r.url} target="_blank" rel="noreferrer noopener">
                              {r.label}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <ConceptModal editing={editing} onClose={() => setEditing(null)} onSave={saveConcept} />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="删除知识点"
        description={deleting?.name}
        width={520}
        footer={
          <>
            <div className={styles.spacer} />
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              关闭
            </Button>
            <Button
              variant="danger"
              disabled={!deleteState?.allowed}
              onClick={() => {
                const res = actions.deleteConcept(deleting.id)
                if (res.ok) {
                  toast.success('知识点已删除')
                  setDeleting(null)
                } else {
                  toast.error('还有项目在引用它，先解除关联。')
                }
              }}
            >
              删除
            </Button>
          </>
        }
      >
        {deleteState?.allowed ? (
          <p className={styles.deleteNote}>
            已经没有任何项目在用它了，可以放心删除。
          </p>
        ) : (
          <>
            <p className={styles.deleteWarn}>
              有 <strong className="num">{deleteState?.count}</strong> 个项目在引用它，
              不能直接删除。知识点是长期积累的东西，误删代价高，所以这里不提供一键清空。
            </p>
            <ul className={styles.delRefs}>
              {deleteState?.references.map(({ relation, project }) => (
                <li key={relation.id}>
                  <span>{project.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      actions.unlinkKnowledge(relation.id)
                      toast.success(`已从「${project.name}」移除`)
                    }}
                  >
                    从该项目移除
                  </Button>
                </li>
              ))}
            </ul>
            <p className={styles.deleteHint}>
              全部移除之后，删除按钮才会变成可点。
            </p>
          </>
        )}
      </Modal>
    </>
  )
}

function ConceptModal({ editing, onClose, onSave }) {
  const [form, setForm] = useState(editing)

  useEffect(() => {
    setForm(editing)
  }, [editing])

  if (!form) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={form.isNew ? '新建知识点' : '编辑知识点'}
      description="这里维护的是通用信息，所有关联它的项目都能看到。"
      width={560}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={onSave}>
            保存
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="名称" required>
          <Input
            value={form.name}
            autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="例如：理解曝光三要素"
          />
        </Field>

        <Field label="领域">
          <Select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="通用说明" hint="和具体项目无关的那部分解释">
          <Textarea
            value={form.description}
            rows={3}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>

        <Field
          label="默认学习资源"
          hint="一行一条，格式：名称 | 网址。所有关联这个知识点的项目都会看到。"
        >
          <Textarea
            value={form.resourcesText}
            rows={3}
            onChange={(e) => setForm((f) => ({ ...f, resourcesText: e.target.value }))}
            placeholder="摄影构图入门 | https://www.bilibili.com/"
          />
        </Field>
      </div>
    </Modal>
  )
}
