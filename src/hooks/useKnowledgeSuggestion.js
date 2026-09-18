import { useCallback, useMemo, useState } from 'react'
import { suggestKnowledge } from '../api/index.js'
import { findConceptByName } from '../domain/knowledge.js'
import { useApp } from '../store/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'

// 新建项目时的建议面板和知识点页的「AI 生成建议」共用这一套逻辑
export function useKnowledgeSuggestion() {
  const { state } = useApp()
  const toast = useToast()
  const [suggestions, setSuggestions] = useState([])
  const [suggesting, setSuggesting] = useState(false)
  // 'claude' 还是 'mock'，界面要如实标出来是哪一种
  const [source, setSource] = useState(null)
  // 实际是哪个模型。接第三方端点时可能不是 Claude，标签要如实写
  const [model, setModel] = useState(null)

  // tasks 是项目已拆好的步骤（按 order 排好）。带上它，模型才能一并回答
  // 「这条该在哪一步之前补」—— 不然就得让用户自己去判断，那正是这个工具要替他做的事。
  const suggest = useCallback(
    async ({ projectName = '', category = '', description = '', tasks = [] }) => {
      if (!description.trim()) {
        toast.warn('先写两句项目描述，生成的知识点才会贴题。')
        return false
      }
      setSuggesting(true)
      const res = await suggestKnowledge({ projectName, category, description, tasks })
      setSuggesting(false)

      if (!res.ok) {
        toast.error(res.message || '生成失败，稍后再试。')
        return false
      }
      setSource(res.source || null)
      setModel(res.model || null)
      setSuggestions(res.items.map((item) => ({ ...item, selected: true })))
      if (res.notice) toast.info(res.notice)
      return true
    },
    [toast],
  )

  const reset = useCallback(() => {
    setSuggestions([])
    setSuggesting(false)
    setSource(null)
    setModel(null)
  }, [])

  const selected = useMemo(() => suggestions.filter((s) => s.selected), [suggestions])

  const matches = useMemo(() => {
    const map = {}
    for (const s of suggestions) {
      map[s.name] = findConceptByName(s.name, state.knowledgeConcepts)
    }
    return map
  }, [suggestions, state.knowledgeConcepts])

  return { suggestions, setSuggestions, suggesting, suggest, reset, selected, matches, source, model }
}
