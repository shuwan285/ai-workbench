import { NavLink } from 'react-router-dom'
import { useToast } from '../components/Toast.jsx'
import { useApp } from '../store/AppContext.jsx'
import { THEME_OPTIONS } from '../data/options.js'
import styles from './Sidebar.module.css'

const NAV = [
  { to: '/', label: '工作台', icon: '▣', end: true },
  { to: '/projects', label: '项目', icon: '▤' },
  { to: '/knowledge', label: '知识库', icon: '◈' },
  { to: '/agents', label: 'Agents', icon: '◇' },
  { to: '/settings', label: '设置', icon: '⚙' },
]

export function Sidebar({ open, onClose }) {
  const { state, actions } = useApp()
  const toast = useToast()
  const theme = state.settings.theme || 'system'

  const cycleTheme = () => {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === theme)
    const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length]
    actions.updateSettings({ theme: next.value })
    toast.info(`主题已切换为「${next.label}」`)
  }

  const handleExport = () => {
    const payload = actions.downloadExport()
    const counts = [
      `${payload.projects.length} 个项目`,
      `${payload.tasks.length} 个任务`,
      `${payload.knowledgeConcepts.length} 个知识点`,
    ].join('、')
    toast.success(`已导出 ${counts}`)
  }

  const themeLabel =
    THEME_OPTIONS.find((o) => o.value === theme)?.label || '跟随系统'

  return (
    <aside className={styles.sidebar} data-open={open ? 'true' : 'false'}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          ⌘
        </span>
        <span className={styles.brandText}>
          <strong>AI 创作工作台</strong>
          <small>项目管理 · 知识补足</small>
        </span>
      </div>

      <nav className={styles.nav} aria-label="主导航">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <button type="button" className={styles.footerBtn} onClick={cycleTheme}>
          <span aria-hidden="true">{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️'}</span>
          <span className={styles.footerLabel}>{themeLabel}</span>
        </button>
        <button type="button" className={styles.footerBtn} onClick={handleExport}>
          <span aria-hidden="true">⬇</span>
          <span className={styles.footerLabel}>导出数据</span>
        </button>
      </div>
    </aside>
  )
}
