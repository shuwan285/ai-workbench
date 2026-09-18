import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { fetchData, getAiConfig, pushData, revealDataDir } from '../api/index.js'
import { useToast } from '../components/Toast.jsx'
import { createActions } from './actions.js'
import {
  EMPTY_STATE,
  readAiBannerDismissed,
  readMeta,
  readMirror,
  writeAiBannerDismissed,
  writeMeta,
  writeMirror,
} from './persistence.js'
import { BOOT_REASONS, decideBoot } from './recovery.js'
import { reducer } from './reducer.js'

const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

const SAVE_DEBOUNCE_MS = 600
// 掉线后多久探一次服务。横幅上写了「会自动补写」，所以不能只靠用户刷新页面。
const RECONNECT_PROBE_MS = 5000

export function AppProvider({ children }) {
  // 先用浏览器镜像同步初始化，首屏不会闪空。跟磁盘的核对是异步的，随后进行。
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => readMirror() ?? { ...EMPTY_STATE },
  )
  const toast = useToast()

  // 启动核对没结束、或者恢复对话框还开着时，挂起写入，别把磁盘覆盖了
  const [holdWrites, setHoldWrites] = useState(true)
  const [recovery, setRecovery] = useState(null)
  const [disk, setDisk] = useState({
    available: null,
    exists: false,
    dataDir: '',
    dataFile: '',
    revision: 0,
    savedAt: null,
    bytes: 0,
    corrupt: null,
    preservedAt: null,
  })
  const [syncStatus, setSyncStatus] = useState('loading')
  const [syncError, setSyncError] = useState(null)
  const [lastSaveAt, setLastSaveAt] = useState(null)
  const [bootReason, setBootReason] = useState(null)

  // null 表示「还不知道」，不是「没配」。用户没确认之前不渲染引导横幅 ——
  // 否则已经配好的人每次启动都会看到一瞬间的「还没接入」。
  const [ai, setAi] = useState(null)
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const diskRef = useRef(disk)
  diskRef.current = disk
  const holdRef = useRef(holdWrites)
  holdRef.current = holdWrites
  const metaRef = useRef(readMeta())
  // 用来判断「正在进入某个状态」还是「已经在这个状态里」——
  // 后者不该重复提示，横幅已经是常驻线索了
  const syncStatusRef = useRef(syncStatus)
  syncStatusRef.current = syncStatus
  // 从磁盘重新加载会丢掉本地未写入的改动，所以不能直接执行，先让 UI 确认
  const [reloadRequested, setReloadRequested] = useState(false)
  const requestReloadRef = useRef(null)
  // 用户明确选了「用本地覆盖磁盘」时，下一次写入要跳过基线校验
  const forceNextRef = useRef(false)

  const actionsRef = useRef(null)
  if (!actionsRef.current) {
    actionsRef.current = createActions(dispatch, () => stateRef.current)
  }

  /* ---------- 保存：先写浏览器镜像，再推给磁盘 ---------- */

  const persist = useCallback(
    async (current, { force = false } = {}) => {
      const rev = Number(current.revision) || 0

      // 镜像先落。哪怕后面推磁盘失败，改动也不会丢。
      try {
        writeMirror(current)
      } catch (err) {
        setSyncStatus('error')
        setSyncError(err.message)
        toast.error(`浏览器里的镜像写不进去了：${err.message}。建议马上到设置页导出备份。`)
        return
      }

      if (!diskRef.current.available) {
        setSyncStatus('offline')
        return
      }

      const forced = force || forceNextRef.current
      forceNextRef.current = false

      // 和上次落盘的版本一致，说明没有新改动
      if (!forced && rev === metaRef.current.syncedRevision) {
        setSyncStatus('synced')
        return
      }

      // 带上基线版本，服务端才能发现「两个标签页从同一版各改一次」
      const res = await pushData(current, rev, metaRef.current.syncedRevision, forced)

      if (res.ok) {
        metaRef.current = writeMeta({
          syncedRevision: rev,
          lastSaveAt: res.savedAt,
          lastSaveError: null,
        })
        setDisk((d) => ({
          ...d,
          exists: true,
          revision: rev,
          savedAt: res.savedAt,
          bytes: res.bytes,
        }))
        setSyncStatus('synced')
        setSyncError(null)
        setLastSaveAt(res.savedAt)
        return
      }

      if (res.code === 'CONFLICT') {
        // 只在「刚进入冲突」时提示一次。冲突期间每改一次都再报一遍纯属噪音，
        // 顶部红色横幅本来就是常驻线索。
        const alreadyInConflict = syncStatusRef.current === 'conflict'
        syncStatusRef.current = 'conflict'
        setSyncStatus('conflict')
        setSyncError(res.message)
        if (!alreadyInConflict) {
          toast.error('磁盘上的数据比这里的更新，可能另一个标签页改过。写入已暂停。', {
            action: { label: '处理冲突', onClick: () => requestReloadRef.current?.() },
          })
        }
        return
      }

      // 服务不可达是正常的降级状态，顶部横幅已经在提示了。
      // 这里不再弹 Toast —— 否则服务一停，之后每次改动都报一次，纯噪音。
      // 同时把 available 置回 false，让后续保存直接短路，不再反复发请求。
      if (res.code === 'SERVICE_OFFLINE' || res.code === 'NETWORK') {
        diskRef.current = { ...diskRef.current, available: false }
        setDisk((d) => ({ ...d, available: false }))
        syncStatusRef.current = 'offline'
        setSyncStatus('offline')
        setSyncError(null)
        return
      }

      metaRef.current = writeMeta({ lastSaveError: res.message })
      setSyncStatus('error')
      setSyncError(res.message)
      toast.warn(`写入磁盘失败：${res.message}。改动还在浏览器里存着，不会丢。`)
    },
    [toast],
  )

  /* ---------- AI 接入状态 ---------- */

  // 拉一次给整个界面用（首屏引导横幅、设置页）。设置页保存成功后调 refreshAi，
  // 让横幅立刻消失 —— 否则用户填完 key 回到首页，横幅还挂着。
  const refreshAi = useCallback(async () => {
    const res = await getAiConfig()
    // 拿不到就退回「不知道」，宁可少提示也不要误报「还没接 AI」
    setAi(res?.ok ? res : null)
    return res
  }, [])

  const dismissAiBanner = useCallback(() => {
    setAiBannerDismissed(true)
    writeAiBannerDismissed(true)
  }, [])

  useEffect(() => {
    refreshAi()
    // localStorage 只能在浏览器里读，所以放在 effect 里而不是 render 里（SSR 下没有）
    setAiBannerDismissed(readAiBannerDismissed())
  }, [refreshAi])

  /* ---------- 启动核对 ---------- */

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const res = await fetchData()
      if (cancelled) return

      const decision = decideBoot({
        disk: res,
        mirror: readMirror(),
        meta: readMeta(),
      })

      setBootReason(decision.reason)
      setDisk({
        available: decision.diskAvailable,
        exists: Boolean(res?.exists),
        dataDir: res?.dataDir || '',
        dataFile: res?.dataFile || '',
        revision: Number(res?.revision) || 0,
        savedAt: res?.savedAt || null,
        bytes: Number(res?.bytes) || 0,
        corrupt: res?.corrupt || null,
        preservedAt: res?.preservedAt || null,
      })

      if (decision.state) {
        dispatch({ type: 'DATA_REPLACE', state: decision.state })
      }

      // 采纳了磁盘版本，就把磁盘版本记成新的基线 ——
      // 否则浏览器缓存被清过之后，下一次写入会拿一个过期的基线去比对，误报冲突。
      // LOCAL_AHEAD 例外：那一支还等着用户选，基线由 resolveRecovery 决定。
      if (
        decision.reason !== BOOT_REASONS.LOCAL_AHEAD &&
        decision.diskAvailable &&
        res?.exists
      ) {
        metaRef.current = writeMeta({ syncedRevision: Number(res.revision) || 0 })
      }

      // 本地有没落盘的改动，先让用户决定，写入继续挂着
      if (decision.reason === BOOT_REASONS.LOCAL_AHEAD) {
        setRecovery({
          local: decision.local,
          diskState: decision.diskState,
          localRevision: decision.mirrorRevision,
          diskRevision: decision.diskRevision,
        })
        setSyncStatus('pending')
        return
      }

      if (decision.reason === BOOT_REASONS.DISK_CORRUPT) {
        toast.error(
          '磁盘上的数据文件解析不了。原始文件已经另存，没有被覆盖。现在用的是浏览器里的镜像。',
        )
      }

      // 第一次把浏览器里的数据搬到磁盘。
      // 这次推送结束前不能放开写入锁 —— 否则用户的改动会用同样的版本号
      // 和它并发写，谁后到谁生效，迁移那次可能把新改动盖掉。
      if (decision.reason === BOOT_REASONS.MIGRATED && decision.state) {
        setSyncStatus('pending')
        const rev = Number(decision.state.revision) || 0
        // 磁盘上还没有文件，基线传 0 即可
        const push = await pushData(decision.state, rev, 0)
        if (cancelled) return
        if (push.ok) {
          metaRef.current = writeMeta({
            syncedRevision: rev,
            lastSaveAt: push.savedAt,
            lastSaveError: null,
          })
          setDisk((d) => ({
            ...d,
            exists: true,
            revision: rev,
            savedAt: push.savedAt,
            bytes: push.bytes,
          }))
          setSyncStatus('synced')
          setLastSaveAt(push.savedAt)
          toast.success('已把浏览器里的数据写入磁盘')
        } else {
          setSyncStatus('error')
          setSyncError(push.message)
        }
        setHoldWrites(false)
        return
      }

      setHoldWrites(false)
      setSyncStatus(decision.diskAvailable ? 'synced' : 'offline')
      if (decision.diskAvailable && res?.savedAt) setLastSaveAt(res.savedAt)
    })()

    return () => {
      cancelled = true
    }
  }, [toast])

  /* ---------- 防抖自动保存 ---------- */

  useEffect(() => {
    if (holdWrites) return undefined

    const rev = Number(state.revision) || 0
    // 已经落过盘了就别再写一遍
    if (diskRef.current.available && rev === metaRef.current.syncedRevision) {
      return undefined
    }

    const timer = setTimeout(() => {
      persist(stateRef.current)
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [state, holdWrites, persist])

  /* ---------- 掉线后自动重连 ---------- */

  // 横幅上承诺了「会自动补写到磁盘文件」，那就不能指望用户刷新页面。
  // 掉线期间每隔几秒轻量探一次，服务回来了就补写一次。
  useEffect(() => {
    if (syncStatus !== 'offline') return undefined

    const timer = setInterval(async () => {
      const res = await fetchData()
      if (!res?.ok) return

      diskRef.current = {
        ...diskRef.current,
        available: true,
        exists: Boolean(res.exists),
        dataDir: res.dataDir || '',
        dataFile: res.dataFile || '',
        revision: Number(res.revision) || 0,
        savedAt: res.savedAt || null,
        bytes: Number(res.bytes) || 0,
      }
      setDisk(diskRef.current)
      toast.success('本地服务已恢复，正在把改动补写到磁盘')

      // 不强制写：掉线期间磁盘可能被别的标签页推进过，该冲突就让它冲突
      await persist(stateRef.current)
    }, RECONNECT_PROBE_MS)

    return () => clearInterval(timer)
  }, [syncStatus, persist, toast])

  /* ---------- 页面要关了，至少把镜像落下来 ---------- */

  useEffect(() => {
    const flush = () => {
      if (holdRef.current) return
      try {
        writeMirror(stateRef.current)
      } catch {
        /* 关页面时来不及报错，下次启动的恢复检查会兜住 */
      }
    }
    const onVisibility = () => {
      if (document.hidden) flush()
    }

    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /* ---------- 手动操作 ---------- */

  const resolveRecovery = useCallback(
    (useLocal) => {
      if (!recovery) return
      if (useLocal) {
        // 用户明确要用本地那份覆盖磁盘，跳过基线校验
        forceNextRef.current = true
        dispatch({ type: 'DATA_REPLACE', state: recovery.local })
        toast.success('已恢复浏览器里更新的那部分改动')
      } else {
        metaRef.current = writeMeta({ syncedRevision: recovery.diskRevision })
        toast.info('已采用磁盘上的版本')
      }
      setRecovery(null)
      setHoldWrites(false)
      setSyncStatus('pending')
    },
    [recovery, toast],
  )

  const reloadFromDisk = useCallback(async () => {
    const res = await fetchData()
    if (!res?.ok) {
      toast.error('本地服务没响应，读不到磁盘上的数据。')
      return
    }
    if (!res.exists) {
      toast.warn('磁盘上还没有数据文件。')
      return
    }

    dispatch({ type: 'DATA_REPLACE', state: res.state })
    try {
      writeMirror(res.state)
    } catch {
      /* 镜像写不了不影响从磁盘恢复 */
    }
    metaRef.current = writeMeta({
      syncedRevision: Number(res.revision) || 0,
      lastSaveAt: res.savedAt,
      lastSaveError: null,
    })
    setDisk((d) => ({
      ...d,
      available: true,
      exists: true,
      revision: Number(res.revision) || 0,
      savedAt: res.savedAt,
      bytes: res.bytes,
    }))
    setSyncStatus('synced')
    setSyncError(null)
    setLastSaveAt(res.savedAt)
    toast.success('已从磁盘重新加载')
  }, [toast])

  const requestReload = useCallback(() => setReloadRequested(true), [])
  const cancelReload = useCallback(() => setReloadRequested(false), [])
  const confirmReload = useCallback(async () => {
    setReloadRequested(false)
    await reloadFromDisk()
  }, [reloadFromDisk])

  requestReloadRef.current = requestReload

  const saveNow = useCallback(() => persist(stateRef.current, { force: true }), [persist])

  const openDataDir = useCallback(async () => {
    const res = await revealDataDir()
    if (!res?.ok) toast.error(res?.message || '打不开数据目录')
  }, [toast])

  const value = useMemo(
    () => ({
      state,
      actions: actionsRef.current,
      ai: {
        status: ai,
        bannerDismissed: aiBannerDismissed,
        refresh: refreshAi,
        dismissBanner: dismissAiBanner,
      },
      sync: {
        status: syncStatus,
        error: syncError,
        reason: bootReason,
        lastSaveAt,
        disk,
        recovery,
        resolveRecovery,
        reloadRequested,
        requestReload,
        cancelReload,
        confirmReload,
        reloadFromDisk,
        saveNow,
        openDataDir,
      },
    }),
    [
      state,
      ai,
      aiBannerDismissed,
      refreshAi,
      dismissAiBanner,
      syncStatus,
      syncError,
      bootReason,
      lastSaveAt,
      disk,
      recovery,
      resolveRecovery,
      reloadRequested,
      requestReload,
      cancelReload,
      confirmReload,
      reloadFromDisk,
      saveNow,
      openDataDir,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
