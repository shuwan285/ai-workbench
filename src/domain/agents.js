// 一个 Agent 算不算配置好了，看它当前类型对应哪个字段。
// 只有配置不全时才显示「未配置」，网页类型只要有网址就是可用的。
export function isAgentConfigured(agent) {
  if (!agent) return false
  if (agent.type === 'web') return Boolean(agent.url?.trim())
  if (agent.type === 'desktop') return Boolean(agent.localPath?.trim())
  if (agent.type === 'command') return Boolean(agent.command?.trim())
  return false
}

export function agentTarget(agent) {
  if (!agent) return ''
  if (agent.type === 'web') return agent.url || ''
  if (agent.type === 'desktop') return agent.localPath || ''
  if (agent.type === 'command') {
    return [agent.command, ...(agent.args || [])].filter(Boolean).join(' ')
  }
  return ''
}

export function agentOptionsFrom(state) {
  return [...state.agents].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
}
