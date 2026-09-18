import { useCallback } from 'react'
import { post } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// 每种失败都给出能直接照做的下一步，不做静默失败
function describeError(res, agent, goConfig) {
  const name = agent?.name || 'Agent'
  switch (res.code) {
    case 'EMPTY_PATH':
      return {
        message: `还没配置「${name}」的程序路径。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'EMPTY_COMMAND':
      return {
        message: `还没配置「${name}」的启动命令。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'NOT_FOUND':
      return {
        message: `找不到程序：${res.target || '路径为空'}。检查一下路径是否正确。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'IS_DIRECTORY':
      return { message: `选中的是文件夹，需要指向具体的应用程序。` }
    case 'BATCH_NOT_SUPPORTED':
      return {
        message: `批处理文件（.bat/.cmd）请改用「命令行」类型配置，避免命令注入。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'COMMAND_NOT_ALLOWED':
      return {
        message: `命令「${res.target}」不在允许列表里。可以在设置页把它加进可信命令。`,
        action: goConfig && { label: '去允许列表', onClick: goConfig },
      }
    case 'COMMAND_NOT_FOUND':
      return {
        message: `系统里找不到「${res.target}」这个命令。确认它装好了，并且能直接在终端里跑起来。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'PATH_UNSAFE':
      return {
        message: `命令所在的路径里有终端认得的特殊字符，打不开。把命令装到别的目录，或者改用「桌面应用」类型直接填完整路径。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    case 'ARG_UNSAFE': {
      const bad = String(res.target || '')
      const shown = bad.length > 16 ? `${bad.slice(0, 16)}…` : bad
      return {
        message: `参数里的「${shown}」会被终端当成语法，含义就变了。去掉它，或者改用「桌面应用」类型。`,
        action: goConfig && { label: '去配置', onClick: goConfig },
      }
    }
    case 'PERMISSION_DENIED':
      return { message: `没有执行权限：${res.target}` }
    case 'NETWORK':
    case 'SERVICE_OFFLINE':
      return {
        message: `${res.message}。确认 npm run dev 的两个进程都在运行。`,
      }
    default:
      return { message: res.message || `启动「${name}」失败，原因未知。` }
  }
}

export function useAgentLaunch({ onNeedConfig } = {}) {
  const toast = useToast()

  const copyText = useCallback(
    async (text, { silent = false } = {}) => {
      if (!text) {
        toast.warn('没有可复制的内容')
        return false
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else if (!legacyCopy(text)) {
          throw new Error('浏览器不支持剪贴板接口')
        }
        if (!silent) toast.success('已复制到剪贴板')
        return true
      } catch {
        if (legacyCopy(text)) {
          if (!silent) toast.success('已复制到剪贴板')
          return true
        }
        toast.error('复制失败，请手动选中文本复制。')
        return false
      }
    },
    [toast],
  )

  const launch = useCallback(
    async (agent) => {
      if (!agent) return false

      // 网页类型不走后端，直接开新标签。放在点击处理里同步调用，否则会被拦。
      if (agent.type === 'web') {
        if (!agent.url) {
          toast.error(`「${agent.name}」还没配置网址。`, {
            action: onNeedConfig && { label: '去配置', onClick: onNeedConfig },
          })
          return false
        }
        const win = window.open(agent.url, '_blank')
        if (!win) {
          toast.error('浏览器拦截了新标签页，允许本站弹窗后再试。', {
            action: { label: '再试一次', onClick: () => window.open(agent.url, '_blank') },
          })
          return false
        }
        win.opener = null
        return true
      }

      const res = await post('/api/agent/launch', {
        type: agent.type,
        localPath: agent.localPath,
        command: agent.command,
        args: agent.args,
      })

      if (res.ok) {
        toast.success(`已启动「${agent.name}」`)
        return true
      }

      const { message, action } = describeError(res, agent, onNeedConfig)
      toast.error(message, action ? { action } : undefined)
      return false
    },
    [toast, onNeedConfig],
  )

  // 先复制再启动。程序打不开也不丢 Prompt，这是核心价值的兜底。
  const launchAndCopy = useCallback(
    async (agent, text) => {
      const copied = await copyText(text, { silent: true })
      const launched = await launch(agent)
      if (copied && launched) {
        toast.success(`Prompt 已复制，「${agent.name}」已打开，直接粘贴即可`)
      } else if (copied && !launched) {
        toast.info('程序没能打开，但 Prompt 已经在剪贴板里，可以手动粘贴。')
      }
      return { copied, launched }
    },
    [copyText, launch, toast],
  )

  return { launch, launchAndCopy, copyText }
}
