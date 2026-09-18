import { Router } from 'express'
import { assignSteps, planSteps, reviewSteps, suggestKnowledge } from '../lib/ai/index.js'

const router = Router()

const MAX_TASKS = 50
const MAX_KNOWLEDGE = 60

// 任务用来给模型看「按什么顺序做、每步具体做什么」。
// id 会被原样回填，所以这里要挡住畸形输入 —— 服务端还会再拿真实任务 id 校验一遍。
// description / doneWhen 一定要带上：知识点要贴着每步的具体动作，
// 光给标题的话模型只能想出「数据可视化」这种话题式的大词。
function sanitizeTasks(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_TASKS)
    .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
    .map((t) => ({
      id: t.id.slice(0, 64),
      title: t.title.slice(0, 200),
      description: String(t.description || '').slice(0, 600),
      doneWhen: String(t.doneWhen || '').slice(0, 400),
    }))
}

function sanitizeKnowledge(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_KNOWLEDGE)
    .filter((k) => k && typeof k.conceptId === 'string' && typeof k.name === 'string')
    .map((k) => ({
      conceptId: k.conceptId.slice(0, 64),
      name: k.name.slice(0, 200),
      reasonNeeded: String(k.reasonNeeded || '').slice(0, 500),
    }))
}

router.post('/suggest-knowledge', async (req, res) => {
  const { projectName = '', category = '', description = '', tasks } = req.body ?? {}

  if (typeof projectName !== 'string' || typeof description !== 'string') {
    return res
      .status(400)
      .json({ ok: false, code: 'BAD_REQUEST', message: 'projectName 和 description 必须是字符串' })
  }

  const payload = {
    projectName: projectName.slice(0, 200),
    category: String(category).slice(0, 50),
    description: description.slice(0, 4000),
    tasks: sanitizeTasks(tasks),
  }

  const result = await suggestKnowledge(payload)
  res.json(result)
})

// 把项目拆成能照着做的几步。每步带「要做什么」和「算完成」。
router.post('/plan-project', async (req, res) => {
  const { projectName = '', category = '', description = '', constraints, dueDate, existing } =
    req.body ?? {}

  const result = await planSteps({
    projectName: String(projectName).slice(0, 200),
    category: String(category).slice(0, 50),
    description: String(description).slice(0, 4000),
    constraints: Array.isArray(constraints)
      ? constraints.slice(0, 20).map((c) => String(c).slice(0, 300))
      : [],
    dueDate: dueDate ? String(dueDate).slice(0, 20) : null,
    // 已经有的步骤传进去，让模型别重复拆
    existing: Array.isArray(existing)
      ? existing.slice(0, MAX_TASKS).map((t) => ({
          title: String(t?.title || '').slice(0, 200),
          description: String(t?.description || '').slice(0, 500),
        }))
      : [],
  })
  res.json(result)
})

// 照这份计划做完能不能交付
router.post('/review-plan', async (req, res) => {
  const { projectName = '', description = '', dueDate, tasks, knowledge } = req.body ?? {}

  const result = await reviewSteps({
    projectName: String(projectName).slice(0, 200),
    description: String(description).slice(0, 4000),
    dueDate: dueDate ? String(dueDate).slice(0, 20) : null,
    tasks: Array.isArray(tasks)
      ? tasks.slice(0, MAX_TASKS).map((t) => ({
          title: String(t?.title || '').slice(0, 200),
          description: String(t?.description || '').slice(0, 600),
          doneWhen: String(t?.doneWhen || '').slice(0, 400),
        }))
      : [],
    knowledge: Array.isArray(knowledge)
      ? knowledge.slice(0, MAX_KNOWLEDGE).map((k) => ({
          name: String(k?.name || '').slice(0, 200),
          stepTitle: String(k?.stepTitle || '').slice(0, 200),
        }))
      : [],
  })
  res.json(result)
})

// 对已有的知识点做归属 —— 「每条该在哪一步之前补」
router.post('/assign-knowledge-steps', async (req, res) => {
  const { projectName = '', description = '', tasks, knowledge } = req.body ?? {}

  const cleanTasks = sanitizeTasks(tasks)
  const cleanKnowledge = sanitizeKnowledge(knowledge)

  if (cleanKnowledge.length === 0) {
    return res
      .status(400)
      .json({ ok: false, code: 'BAD_REQUEST', message: 'knowledge 不能为空' })
  }

  const result = await assignSteps({
    projectName: String(projectName).slice(0, 200),
    description: String(description).slice(0, 4000),
    tasks: cleanTasks,
    knowledge: cleanKnowledge,
  })
  res.json(result)
})

export default router
