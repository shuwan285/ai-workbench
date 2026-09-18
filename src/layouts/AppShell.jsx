import { useEffect, useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { RecoveryDialog } from '../components/RecoveryDialog.jsx'
import { ConfirmDialog } from '../components/ui/Modal.jsx'
import { useApp } from '../store/AppContext.jsx'
import { Sidebar } from './Sidebar.jsx'
import styles from './AppShell.module.css'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { sync, ai } = useApp()

  // 换页就收起抽屉
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.burger}
          onClick={() => setMenuOpen(true)}
          aria-label="打开菜单"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
        <span className={styles.brand}>AI 创作项目工作台</span>
      </header>

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && (
        <div className={styles.scrim} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <main className={styles.main}>
        <SyncBanner sync={sync} />
        <AiSetupBanner ai={ai} />
        <Outlet />
      </main>

      <RecoveryDialog />
      <ReloadConfirm sync={sync} />
    </div>
  )
}

// 「从磁盘重新加载」会丢掉本地未写入的改动，所以统一在这里确认一次，
// 设置页的按钮和冲突提示里的入口都走这条路。
function ReloadConfirm({ sync }) {
  const { reloadRequested, cancelReload, confirmReload, status } = sync
  const risky = ['pending', 'conflict', 'error'].includes(status)

  return (
    <ConfirmDialog
      open={reloadRequested}
      onClose={cancelReload}
      onConfirm={confirmReload}
      title="从磁盘重新加载"
      message={
        risky
          ? '本地还有没写进磁盘的改动，重新加载会把它们丢掉。'
          : '会用磁盘上的版本替换当前显示的数据。'
      }
      confirmLabel="重新加载"
      tone={risky ? 'danger' : 'primary'}
      cancelLabel="取消"
    >
      <p className={styles.confirmNote}>
        {risky
          ? '如果那些改动还想留着，先取消，到设置页点「立即保存」试试。存不进去再回来重新加载。'
          : '磁盘上的内容和这里应该一致，重新加载只是重新读一遍。'}
      </p>
    </ConfirmDialog>
  )
}

// 数据没写进磁盘的时候必须让人看见，不能悄悄降级成只存浏览器
function SyncBanner({ sync }) {
  const { status, error, disk } = sync

  if (status === 'loading') return null

  if (status === 'offline' || disk.available === false) {
    return (
      <div className={styles.banner} data-tone="amber" role="status">
        <span aria-hidden="true">⚠︎</span>
        <span>
          本地服务没启动，改动目前只存在这个浏览器里。
          重新跑起 <code>npm run dev</code> 后会自动补写到磁盘文件，不用刷新页面。
        </span>
        <Link to="/settings">数据设置 →</Link>
      </div>
    )
  }

  if (status === 'conflict') {
    return (
      <div className={styles.banner} data-tone="red" role="status">
        <span aria-hidden="true">⚠︎</span>
        <span>磁盘上的数据比这里的更新，写入已停止。{error}</span>
        <Link to="/settings">去处理 →</Link>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={styles.banner} data-tone="amber" role="status">
        <span aria-hidden="true">⚠︎</span>
        <span>写入磁盘失败：{error}。改动还在浏览器里存着，不会丢。</span>
        <Link to="/settings">数据设置 →</Link>
      </div>
    )
  }

  return null
}

// 还没接 AI 时的一条引导。不接也完全能用（四条 AI 路径都回退到本地模拟数据），
// 所以语气是邀请不是报错，而且允许关掉 —— 对只想用模拟数据的人，常驻横幅是纯噪音。
function AiSetupBanner({ ai }) {
  const status = ai.status

  // 状态未知时不渲染：服务没起来时这一条会和上面那条撞在一起，
  // 已配好的人也会看到一瞬间的「还没接入」。
  if (!status?.ok || status.configured || ai.bannerDismissed) return null

  return (
    <div className={styles.banner} data-tone="blue" role="status">
      <span aria-hidden="true">✦</span>
      <span>
        还没接入 AI，拆解项目和生成知识点现在走的是本地模拟数据。
        填一个 API key 就会换成真实模型 —— 不填也能继续用。
      </span>
      <Link to="/settings">接入 AI →</Link>
      <button
        type="button"
        className={styles.bannerClose}
        onClick={ai.dismissBanner}
        aria-label="不再提示"
        title="不再提示"
      >
        ✕
      </button>
    </div>
  )
}
