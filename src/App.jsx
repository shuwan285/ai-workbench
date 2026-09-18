import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layouts/AppShell.jsx'
import { Dashboard } from './pages/Dashboard/Dashboard.jsx'
import { Projects } from './pages/Projects/Projects.jsx'
import { ProjectDetail } from './pages/ProjectDetail/ProjectDetail.jsx'
import { Knowledge } from './pages/Knowledge/Knowledge.jsx'
import { Agents } from './pages/Agents/Agents.jsx'
import { Settings } from './pages/Settings/Settings.jsx'

// 路由表单独导出，冒烟测试用 MemoryRouter 复用它
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="agents" element={<Agents />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
