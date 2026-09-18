import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, Textarea } from '../../components/ui/Field.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { RESOURCE_TYPE, RESOURCE_TYPE_ORDER } from '../../data/options.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './ResourcesTab.module.css'

const GROUP_EMPTY = {
  doc: '还没有项目文档。把需求文档、指导书、模板链接放这里。',
  asset: '还没有素材。数据文件、图片、参考素材都可以记在这里。',
  reference: '还没有参考资料。看到讲得清楚的网页和视频就丢进来。',
  retro: '还没有复盘。做完一个阶段随手写两句，下次能少踩坑。',
}

export function ResourcesTab({ project }) {
  const { state, actions } = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [collapsed, setCollapsed] = useState({})

  const items = state.resources.filter((r) => r.projectId === project.id)

  const groups = RESOURCE_TYPE_ORDER.map((key) => ({
    key,
    ...RESOURCE_TYPE[key],
    items: items
      .filter((r) => r.type === key)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
  }))

  return (
    <div className={styles.wrap}>
      {groups.map((group) => {
        const isOpen = !collapsed[group.key]
        return (
          <section key={group.key} className={styles.group}>
            <div className={styles.groupHead}>
              <button
                type="button"
                className={styles.groupToggle}
                aria-expanded={isOpen}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [group.key]: isOpen }))
                }
              >
                <span className={styles.chevron} data-open={isOpen} aria-hidden="true">
                  ▸
                </span>
                <span aria-hidden="true">{group.icon}</span>
                <span className={styles.groupTitle}>{group.label}</span>
                <span className={`${styles.groupCount} num`}>{group.items.length}</span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                icon="+"
                onClick={() =>
                  setEditing({
                    isNew: true,
                    type: group.key,
                    title: '',
                    description: '',
                    urlOrPath: '',
                  })
                }
              >
                添加
              </Button>
            </div>

            {isOpen && (
              <div className={styles.groupBody}>
                {group.items.length === 0 ? (
                  <p className={styles.groupEmpty}>{GROUP_EMPTY[group.key]}</p>
                ) : (
                  <ul className={styles.list}>
                    {group.items.map((r) => (
                      <li key={r.id} className={styles.item}>
                        <div className={styles.itemMain}>
                          <div className={styles.itemTitle}>
                            {r.urlOrPath ? (
                              <a href={r.urlOrPath} target="_blank" rel="noreferrer noopener">
                                {r.title}
                              </a>
                            ) : (
                              r.title
                            )}
                          </div>
                          {r.description && (
                            <p className={styles.itemDesc}>{r.description}</p>
                          )}
                        </div>
                        <Menu
                          ariaLabel={`${r.title} 的操作`}
                          items={[
                            {
                              label: '编辑',
                              onClick: () =>
                                setEditing({
                                  isNew: false,
                                  id: r.id,
                                  type: r.type,
                                  title: r.title,
                                  description: r.description,
                                  urlOrPath: r.urlOrPath,
                                }),
                            },
                            {
                              label: '删除',
                              tone: 'danger',
                              onClick: () => {
                                actions.deleteResource(r.id)
                                toast.success('已删除')
                              },
                            },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )
      })}

      <ResourceModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(payload) => {
          if (editing.isNew) {
            actions.createResource(project.id, payload)
            toast.success('已添加')
          } else {
            actions.updateResource(editing.id, payload)
            toast.success('已更新')
          }
          setEditing(null)
        }}
      />
    </div>
  )
}

function ResourceModal({ editing, onClose, onSave }) {
  const [form, setForm] = useState(editing)

  useEffect(() => {
    setForm(editing)
  }, [editing])

  if (!form) {
    return <Modal open={false} onClose={onClose} title="" />
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.isNew ? `添加${RESOURCE_TYPE[form.type].label}` : '编辑'}
      width={520}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave({ ...form, title: form.title.trim() || '未命名' })}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="标题" required>
          <Input
            value={form.title}
            autoFocus
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="例如：实验指导书第三章"
          />
        </Field>

        <Field label="链接或路径" hint="网页链接、本地文件路径都可以">
          <Input
            value={form.urlOrPath}
            onChange={(e) => setForm((f) => ({ ...f, urlOrPath: e.target.value }))}
            placeholder="https:// 或 D:\资料\指导书.pdf"
          />
        </Field>

        <Field label="说明">
          <Textarea
            value={form.description}
            rows={5}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={
              form.type === 'retro'
                ? '这次哪里顺、哪里卡、下次怎么改'
                : '这东西是干什么用的、在哪找到的'
            }
          />
        </Field>
      </div>
    </Modal>
  )
}
