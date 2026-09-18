import { Link } from 'react-router-dom'
import { PRIORITY, PROJECT_STATUS } from '../data/options.js'
import { isBlockingRelation } from '../domain/knowledge.js'
import { progressDetail } from '../domain/progress.js'
import { useApp } from '../store/AppContext.jsx'
import { DeadlineChip } from './DeadlineChip.jsx'
import { Badge } from './ui/Badge.jsx'
import { Menu } from './ui/Menu.jsx'
import { ProgressBar } from './ui/ProgressBar.jsx'
import styles from './ProjectCard.module.css'

function useCardData(project) {
  const { state } = useApp()
  const detail = progressDetail(project, state.tasks)
  const blockingCount = state.projectKnowledge.filter(
    (k) => k.projectId === project.id && isBlockingRelation(k),
  ).length
  const status = PROJECT_STATUS[project.status] || PROJECT_STATUS.idea
  const priority = PRIORITY[project.priority] || PRIORITY.medium
  return { detail, blockingCount, status, priority }
}

function buildMenuItems(project, handlers) {
  const items = []
  if (!handlers) return items
  if (handlers.onEdit) items.push({ label: '编辑', onClick: () => handlers.onEdit(project) })
  if (handlers.onDuplicate)
    items.push({ label: '复制一份', onClick: () => handlers.onDuplicate(project) })
  if (handlers.onArchive)
    items.push({
      label: project.archived ? '取消归档' : '归档',
      onClick: () => handlers.onArchive(project),
    })
  if (handlers.onDelete)
    items.push({ label: '删除', tone: 'danger', onClick: () => handlers.onDelete(project) })
  return items
}

export function ProjectCard({ project, handlers, showNextAction = false }) {
  const { detail, blockingCount, status, priority } = useCardData(project)
  const items = buildMenuItems(project, handlers)

  return (
    <article className={styles.card} data-archived={project.archived}>
      <Link
        to={`/projects/${project.id}`}
        className={styles.overlay}
        aria-label={`打开项目 ${project.name}`}
      />
      <span
        className={styles.bar}
        style={{ background: project.coverColor }}
        aria-hidden="true"
      />

      <div className={styles.head}>
        <h3 className={styles.name}>{project.name}</h3>
        {blockingCount > 0 && (
          <span
            className={styles.blockDot}
            title={`有 ${blockingCount} 个阻塞知识点未掌握`}
            aria-label={`有 ${blockingCount} 个阻塞知识点未掌握`}
          />
        )}
        {items.length > 0 && <Menu ariaLabel={`${project.name} 的操作`} items={items} />}
      </div>

      <div className={styles.meta}>
        <span className={styles.category}>{project.category}</span>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <Badge tone={priority.tone}>
          {priority.symbol} {priority.label}
        </Badge>
        {project.archived && <Badge tone="gray">已归档</Badge>}
      </div>

      <ProgressBar
        value={detail.value}
        tone={project.status === 'done' ? 'green' : 'blue'}
      />

      <div className={styles.foot}>
        <span className={`${styles.pct} num`}>
          {detail.value}%
          {detail.hasTasks && detail.mode === 'auto' && (
            <span className={styles.taskCount}>
              （{detail.done}/{detail.total} 任务）
            </span>
          )}
        </span>
        <DeadlineChip dueDate={project.dueDate} done={project.status === 'done'} />
      </div>

      {showNextAction && (
        <p className={styles.next}>
          {project.nextAction ? (
            <>
              <span className={styles.nextLabel}>下一步</span>
              {project.nextAction}
            </>
          ) : (
            <span className={styles.nextEmpty}>还没写下一步行动</span>
          )}
        </p>
      )}
    </article>
  )
}

// 项目多的时候列表比卡片好扫
export function ProjectRow({ project, handlers }) {
  const { detail, blockingCount, status, priority } = useCardData(project)
  const items = buildMenuItems(project, handlers)

  return (
    <tr className={styles.row} data-archived={project.archived}>
      <td>
        <Link to={`/projects/${project.id}`} className={styles.rowName}>
          <span
            className={styles.rowBar}
            style={{ background: project.coverColor }}
            aria-hidden="true"
          />
          {project.name}
          {blockingCount > 0 && (
            <span className={styles.blockDot} title={`${blockingCount} 个阻塞知识点`} />
          )}
        </Link>
      </td>
      <td className={styles.rowMuted}>{project.category}</td>
      <td>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </td>
      <td>
        <Badge tone={priority.tone}>
          {priority.symbol} {priority.label}
        </Badge>
      </td>
      <td>
        <div className={styles.rowProgress}>
          <ProgressBar value={detail.value} size="sm" />
          <span className="num">{detail.value}%</span>
        </div>
      </td>
      <td>
        <DeadlineChip dueDate={project.dueDate} done={project.status === 'done'} emptyLabel="—" />
      </td>
      <td className={styles.rowActions}>
        <Menu ariaLabel={`${project.name} 的操作`} items={items} />
      </td>
    </tr>
  )
}
