import { Link } from 'react-router-dom'
import { AGENT_TYPE } from '../data/options.js'
import { isAgentConfigured } from '../domain/agents.js'
import { useAgentLaunch } from '../hooks/useAgentLaunch.js'
import { Badge } from './ui/Badge.jsx'
import styles from './AgentLauncher.module.css'

export function AgentCard({ agent, onNeedConfig }) {
  const { launch } = useAgentLaunch({ onNeedConfig })
  const meta = AGENT_TYPE[agent.type] || AGENT_TYPE.web
  const configured = isAgentConfigured(agent)

  return (
    <div className={styles.card} data-unconfigured={!configured}>
      <div className={styles.cardHead}>
        <span className={styles.emoji} aria-hidden="true">
          {agent.icon}
        </span>
        <div className={styles.cardTitle}>
          <strong>{agent.name}</strong>
          <Badge tone={meta.tone}>
            {meta.icon} {meta.label}
          </Badge>
        </div>
      </div>

      <p className={styles.desc}>{agent.description || '还没有写用途说明'}</p>

      {configured ? (
        <button type="button" className={styles.open} onClick={() => launch(agent)}>
          打开
        </button>
      ) : (
        <Link to="/agents" className={styles.unconfigured}>
          未配置 · 去设置
        </Link>
      )}
    </div>
  )
}

export function AgentLauncherRow({ agents, onNeedConfig }) {
  return (
    <section className={styles.section} aria-labelledby="agent-launcher-title">
      <div className={styles.sectionHead}>
        <h2 id="agent-launcher-title" className={styles.sectionTitle}>
          快速打开 Agent
        </h2>
        <Link to="/agents" className={styles.manage}>
          管理 →
        </Link>
      </div>

      <div className={styles.row}>
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onNeedConfig={onNeedConfig} />
        ))}
        <Link to="/agents" className={styles.addCard}>
          <span className={styles.addPlus} aria-hidden="true">
            +
          </span>
          <span>添加 Agent</span>
        </Link>
      </div>
    </section>
  )
}
