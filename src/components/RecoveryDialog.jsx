import { summarize } from '../store/persistence.js'
import { useApp } from '../store/AppContext.jsx'
import { Button } from './ui/Button.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './RecoveryDialog.module.css'

// 浏览器里有改动没写进磁盘时才会出现。
// 在用户选完之前写入是挂起的，所以不能让它随便关掉 —— Esc 等于「用磁盘版本」。
export function RecoveryDialog() {
  const { sync } = useApp()
  const { recovery, resolveRecovery } = sync

  if (!recovery) return null

  const diskCounts = summarize(recovery.diskState)
  const localCounts = summarize(recovery.local)

  return (
    <Modal
      open
      // 必须二选一。这里的「关闭」如果等价于「丢弃本地改动」，
      // 右上角那个 ✕ 就会被当成无害的取消，所以干脆不给关。
      dismissible={false}
      title="发现浏览器里有未写入磁盘的改动"
      description="上次可能没来得及保存就关掉了页面。选定之前不会写入磁盘。"
      width={560}
      footer={
        <>
          <div className={styles.spacer} />
          <Button onClick={() => resolveRecovery(false)}>用磁盘上的版本</Button>
          <Button variant="primary" onClick={() => resolveRecovery(true)}>
            恢复浏览器的改动
          </Button>
        </>
      }
    >
      <div className={styles.compare}>
        <div className={styles.col} data-kind="disk">
          <div className={styles.colHead}>
            <strong>磁盘上的版本</strong>
            <span className="num">第 {recovery.diskRevision} 版</span>
          </div>
          <Counts counts={diskCounts} />
        </div>

        <div className={styles.col} data-kind="local">
          <div className={styles.colHead}>
            <strong>浏览器里的版本</strong>
            <span className="num">第 {recovery.localRevision} 版</span>
          </div>
          <Counts counts={localCounts} />
        </div>
      </div>

      <p className={styles.note}>
        选「恢复浏览器的改动」会用浏览器里的那份覆盖磁盘。
        「用磁盘上的版本」会丢掉浏览器里这些没保存的改动，但磁盘上的内容不受影响。
        磁盘版本更新时，说明另一个标签页可能写过，两者的差异需要你自己判断。
      </p>
      <p className={styles.required}>
        两个按钮选一个才能继续 —— 这个弹窗按 Esc 或点外面都不会关。
      </p>
    </Modal>
  )
}

function Counts({ counts }) {
  return (
    <ul className={styles.counts}>
      <li>
        <span>项目</span>
        <strong className="num">{counts.projects}</strong>
      </li>
      <li>
        <span>任务</span>
        <strong className="num">{counts.tasks}</strong>
      </li>
      <li>
        <span>知识点</span>
        <strong className="num">{counts.concepts}</strong>
      </li>
      <li>
        <span>知识点关联</span>
        <strong className="num">{counts.relations}</strong>
      </li>
    </ul>
  )
}
