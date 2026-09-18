function clamp(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export function tasksOfProject(tasks, projectId) {
  return tasks.filter((t) => t.projectId === projectId)
}

// 进度是派生值：手动模式读 manualProgress，自动模式按任务完成数算。
export function computeProgress(project, tasks) {
  if (!project) return 0
  if (project.progressMode === 'manual') return clamp(project.manualProgress)

  const list = tasksOfProject(tasks, project.id)
  if (list.length === 0) return 0
  const done = list.filter((t) => t.status === 'done').length
  return clamp((done / list.length) * 100)
}

export function progressDetail(project, tasks) {
  const list = tasksOfProject(tasks, project.id)
  const done = list.filter((t) => t.status === 'done').length
  return {
    value: computeProgress(project, tasks),
    mode: project?.progressMode === 'manual' ? 'manual' : 'auto',
    total: list.length,
    done,
    hasTasks: list.length > 0,
  }
}

// 任务或项目变化后调用，把派生值写回 project.progress，导出时数据才自洽
export function syncProjectProgress(project, tasks) {
  const value = computeProgress(project, tasks)
  return project.progress === value ? project : { ...project, progress: value }
}

export function allTasksDone(project, tasks) {
  const list = tasksOfProject(tasks, project.id)
  return list.length > 0 && list.every((t) => t.status === 'done')
}
