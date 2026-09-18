import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { AGENT_TYPE } from '../../data/options.js'
import { agentOptionsFrom, isAgentConfigured } from '../../domain/agents.js'
import {
  buildProjectPrompt,
  extractVariables,
  fillTemplate,
} from '../../domain/promptBuilder.js'
import { useAgentLaunch } from '../../hooks/useAgentLaunch.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './AgentTab.module.css'

export function AgentTab({ project }) {
  const { state, actions } = useApp()
  const toast = useToast()
  const [templateModal, setTemplateModal] = useState(null)

  const { launchAndCopy, copyText } = useAgentLaunch({ onNeedConfig: () => {} })

  const built = useMemo(
    () =>
      buildProjectPrompt({
        project,
        tasks: state.tasks,
        projectKnowledge: state.projectKnowledge,
        concepts: state.knowledgeConcepts,
      }),
    [project, state.tasks, state.projectKnowledge, state.knowledgeConcepts],
  )

  const projectAgents = useMemo(
    () => agentOptionsFrom(state).filter((a) => (a.projectIds || []).includes(project.id)),
    [state, project.id],
  )

  const templates = useMemo(
    () =>
      state.promptTemplates
        .filter((t) => t.projectId === null || t.projectId === project.id)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [state.promptTemplates, project.id],
  )

  const openNewTemplate = () =>
    setTemplateModal({ isNew: true, name: '', content: built.text, projectId: project.id })

  const saveTemplate = () => {
    if (!templateModal) return
    const payload = {
      name: templateModal.name.trim() || '未命名模板',
      content: templateModal.content,
      variables: extractVariables(templateModal.content),
      projectId: templateModal.projectId ?? null,
    }
    if (templateModal.isNew) {
      actions.createTemplate(payload)
      toast.success('模板已保存')
    } else {
      actions.updateTemplate(templateModal.id, payload)
      toast.success('模板已更新')
    }
    setTemplateModal(null)
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>本项目推荐</h3>
          <Link to="/agents" className={styles.blockLink}>
            管理 Agent →
          </Link>
        </div>

        {projectAgents.length === 0 ? (
          <div className={styles.emptyLine}>
            还没有为本项目关联 Agent。
            <Link to="/agents">去 Agent 管理页挑几个 →</Link>
          </div>
        ) : (
          <div className={styles.agentRow}>
            {projectAgents.map((agent) => {
              const meta = AGENT_TYPE[agent.type] || AGENT_TYPE.web
              const ok = isAgentConfigured(agent)
              return (
                <div key={agent.id} className={styles.agentChip}>
                  <span className={styles.agentIcon} aria-hidden="true">
                    {agent.icon}
                  </span>
                  <span className={styles.agentName}>{agent.name}</span>
                  <Badge tone={meta.tone}>{meta.icon}</Badge>
                  {!ok && <span className={styles.agentWarn}>未配置</span>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>项目上下文 Prompt</h3>
          <div className={styles.blockActions}>
            <Button size="sm" onClick={() => copyText(built.text)}>
              复制
            </Button>
            <Button size="sm" variant="ghost" onClick={openNewTemplate}>
              存为模板
            </Button>
          </div>
        </div>

        <p className={styles.hint}>
          缺的字段会写成「（待补充）」，不会替你编内容。补齐之后生成的 Prompt 会更有用。
        </p>

        <pre className={styles.prompt}>{built.text}</pre>

        {projectAgents.length > 0 && (
          <div className={styles.launchRow}>
            <span className={styles.launchLabel}>一键打开：</span>
            {projectAgents.map((agent) => (
              <Button
                key={agent.id}
                size="sm"
                onClick={() => launchAndCopy(agent, built.text)}
              >
                {agent.icon} 打开 {agent.name} 并复制
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>我的 Prompt 模板</h3>
          <Button size="sm" variant="ghost" icon="+" onClick={openNewTemplate}>
            新建
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className={styles.emptyLine}>还没有模板。把常用的提问方式存下来，下次直接套。</div>
        ) : (
          <ul className={styles.templateList}>
            {templates.map((t) => {
              const preview = fillTemplate(t.content, built.vars)
              return (
                <li key={t.id}>
                  <div className={styles.templateHead}>
                    <span aria-hidden="true">📄</span>
                    <span className={styles.templateName}>{t.name}</span>
                    <span className={styles.templateScope}>
                      {t.projectId ? project.name : '全局'}
                    </span>
                    <Menu
                      ariaLabel={`${t.name} 的操作`}
                      items={[
                        {
                          label: '编辑',
                          onClick: () =>
                            setTemplateModal({
                              isNew: false,
                              id: t.id,
                              name: t.name,
                              content: t.content,
                              projectId: t.projectId,
                            }),
                        },
                        {
                          label: '复制填好的内容',
                          onClick: () => copyText(preview),
                        },
                        {
                          label: '删除',
                          tone: 'danger',
                          onClick: () => {
                            actions.deleteTemplate(t.id)
                            toast.success('模板已删除')
                          },
                        },
                      ]}
                    />
                  </div>
                  <pre className={styles.templatePreview}>{preview}</pre>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(templateModal)}
        onClose={() => setTemplateModal(null)}
        title={templateModal?.isNew ? '新建 Prompt 模板' : '编辑模板'}
        description="用 {{变量名}} 占位，套用到项目时会自动替换成项目里的内容。"
        width={620}
        footer={
          <>
            <div className={styles.spacer} />
            <Button variant="ghost" onClick={() => setTemplateModal(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={saveTemplate}>
              保存
            </Button>
          </>
        }
      >
        {templateModal && (
          <div className={styles.form}>
            <Field label="模板名称">
              <Input
                value={templateModal.name}
                autoFocus
                onChange={(e) =>
                  setTemplateModal((t) => ({ ...t, name: e.target.value }))
                }
                placeholder="例如：代码调试求助"
              />
            </Field>

            <Field label="模板内容">
              <Textarea
                rows={12}
                className={styles.templateEditor}
                value={templateModal.content}
                onChange={(e) =>
                  setTemplateModal((t) => ({ ...t, content: e.target.value }))
                }
              />
            </Field>

            <Field label="作用范围">
              <Select
                value={templateModal.projectId || ''}
                onChange={(e) =>
                  setTemplateModal((t) => ({ ...t, projectId: e.target.value || null }))
                }
              >
                <option value="">全局（所有项目都能用）</option>
                <option value={project.id}>仅本项目</option>
              </Select>
            </Field>

            <p className={styles.varHint}>
              识别到变量：
              {extractVariables(templateModal.content).length > 0
                ? extractVariables(templateModal.content)
                    .map((v) => `{{${v}}}`)
                    .join(' ')
                : '无'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
