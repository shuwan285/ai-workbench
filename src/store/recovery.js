// 启动时决定用哪份数据。纯函数，不碰 IO，方便单测。

export const BOOT_REASONS = {
  FRESH: 'FRESH', // 磁盘和镜像都是空的
  MIGRATED: 'MIGRATED', // 镜像里有数据，磁盘上还没有 —— 该推一次
  IN_SYNC: 'IN_SYNC',
  DISK_NEWER: 'DISK_NEWER', // 多半是另一个标签页写的
  MIRROR_LOST: 'MIRROR_LOST', // 浏览器数据被清了，磁盘还在
  LOCAL_AHEAD: 'LOCAL_AHEAD', // 有改动没写进磁盘 —— 要问用户
  OFFLINE: 'OFFLINE', // 本地服务没起来，只能用镜像
  OFFLINE_EMPTY: 'OFFLINE_EMPTY',
  DISK_CORRUPT: 'DISK_CORRUPT', // 磁盘上的文件解析不了
}

export function decideBoot({ disk, mirror, meta }) {
  const mirrorRev = Number(mirror?.revision) || 0
  const syncedRev = Number(meta?.syncedRevision) || 0

  const diskAvailable = Boolean(disk && disk.ok)
  const diskRev = diskAvailable ? Number(disk.revision) || 0 : 0

  if (!diskAvailable) {
    return {
      reason: mirror ? BOOT_REASONS.OFFLINE : BOOT_REASONS.OFFLINE_EMPTY,
      source: mirror ? 'mirror' : 'empty',
      state: mirror ?? null,
      diskAvailable: false,
      pending: Boolean(mirror) && mirrorRev > syncedRev,
    }
  }

  // 文件读坏了。readData 已经把原文件另存了一份，别直接覆盖。
  if (disk.corrupt) {
    return {
      reason: BOOT_REASONS.DISK_CORRUPT,
      source: mirror ? 'mirror' : 'empty',
      state: mirror ?? null,
      diskAvailable: true,
      pending: Boolean(mirror) && mirrorRev > syncedRev,
      corrupt: disk.corrupt,
      preservedAt: disk.preservedAt || null,
    }
  }

  if (!disk.exists) {
    return mirror
      ? {
          reason: BOOT_REASONS.MIGRATED,
          source: 'mirror',
          state: mirror,
          diskAvailable: true,
          pending: true,
        }
      : {
          reason: BOOT_REASONS.FRESH,
          source: 'empty',
          state: null,
          diskAvailable: true,
          pending: false,
        }
  }

  if (!mirror) {
    return {
      reason: BOOT_REASONS.MIRROR_LOST,
      source: 'disk',
      state: disk.state,
      diskAvailable: true,
      pending: false,
    }
  }

  // 镜像比磁盘新，说明上次有改动没落盘。先显示磁盘那份（确定存过），再问用户。
  if (mirrorRev > diskRev) {
    return {
      reason: BOOT_REASONS.LOCAL_AHEAD,
      source: 'ask',
      state: disk.state,
      // 两份都带出来，恢复对话框直接拿这个显示，不依赖「当前 state 是什么」
      diskState: disk.state,
      local: mirror,
      diskRevision: diskRev,
      mirrorRevision: mirrorRev,
      diskAvailable: true,
      pending: true,
    }
  }

  if (diskRev > mirrorRev) {
    return {
      reason: BOOT_REASONS.DISK_NEWER,
      source: 'disk',
      state: disk.state,
      diskAvailable: true,
      pending: false,
    }
  }

  return {
    reason: BOOT_REASONS.IN_SYNC,
    source: 'disk',
    state: disk.state,
    diskAvailable: true,
    pending: false,
  }
}

export const REASON_TEXT = {
  [BOOT_REASONS.FRESH]: '全新开始',
  [BOOT_REASONS.MIGRATED]: '已把浏览器里的数据写入磁盘',
  [BOOT_REASONS.IN_SYNC]: '已从磁盘加载',
  [BOOT_REASONS.DISK_NEWER]: '磁盘上的版本更新，已采用磁盘版本',
  [BOOT_REASONS.MIRROR_LOST]: '浏览器里的镜像已被清理，已从磁盘恢复',
  [BOOT_REASONS.LOCAL_AHEAD]: '发现浏览器里有未写入磁盘的改动',
  [BOOT_REASONS.OFFLINE]: '本地服务没启动，暂用浏览器里的镜像',
  [BOOT_REASONS.OFFLINE_EMPTY]: '本地服务没启动，也没有浏览器镜像',
  [BOOT_REASONS.DISK_CORRUPT]: '磁盘上的数据文件损坏',
}
