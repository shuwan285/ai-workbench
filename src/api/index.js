import { del, get, post, put } from './client.js'

export const fetchData = () => get('/api/data')

// baseRevision 是这次改动基于的版本。服务端拿它跟磁盘比对来做乐观并发控制。
// force 只在用户明确选择「用本地覆盖磁盘」时用。
export const pushData = (state, revision, baseRevision, force = false) =>
  put('/api/data', { state, revision, baseRevision, force })
export const revealDataDir = () => post('/api/data/reveal', {})

export const launchAgent = (payload) => post('/api/agent/launch', payload)
export const pickApplicationPath = () => post('/api/agent/pick-path', {})
export const suggestKnowledge = (payload) => post('/api/ai/suggest-knowledge', payload)
export const assignKnowledgeSteps = (payload) =>
  post('/api/ai/assign-knowledge-steps', payload)
export const planProject = (payload) => post('/api/ai/plan-project', payload)
export const reviewPlan = (payload) => post('/api/ai/review-plan', payload)

export const getAiConfig = () => get('/api/config/ai')
export const saveAiConfig = (patch) => put('/api/config/ai', patch)
export const testAiKey = (payload) => post('/api/config/ai/test', payload)

export const listCommands = () => get('/api/config/commands')
export const addCustomCommand = (command, note) =>
  post('/api/config/commands', { command, note })
export const removeCustomCommand = (command) =>
  del(`/api/config/commands/${encodeURIComponent(command)}`)
