// 界面渲染冒烟测试：把每个页面真的渲染一遍，看有没有崩、内容对不对。
// 跑法：npm run test:ui
//
// 注意：import 在 ESM 里会被提升，所以这里用动态 import，
// 保证 localStorage 的桩在被测模块加载之前就位。

// react-router 在服务端渲染时必然报 useLayoutEffect 警告，与本次测试无关，滤掉
const realError = console.error
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) {
    return
  }
  realError(...args)
}

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const session = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
}

const { renderToString } = await import('react-dom/server')
const { MemoryRouter } = await import('react-router-dom')
const { AppRoutes } = await import('../src/App.jsx')
const { ToastProvider } = await import('../src/components/Toast.jsx')
const { AppProvider } = await import('../src/store/AppContext.jsx')
const { buildSeedData } = await import('../src/data/seed.js')
const { SCHEMA_VERSION } = await import('../src/store/persistence.js')

let pass = 0
let fail = 0
const lines = []

function render(path) {
  const html = renderToString(
    <ToastProvider>
      <AppProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AppProvider>
    </ToastProvider>,
  )
  // React 会在相邻文本节点之间插注释，去掉之后才能按可见文案断言
  return html.replace(/<!--\s*-->/g, '')
}

function page(name, path, { expect = [], reject = [] } = {}) {
  let html = ''
  try {
    html = render(path)
  } catch (err) {
    fail += 1
    lines.push(`  ✗ ${name}\n      渲染抛错：${err.message}`)
    return ''
  }

  const missing = expect.filter((s) => !html.includes(s))
  const leaked = reject.filter((s) => html.includes(s))

  if (missing.length === 0 && leaked.length === 0) {
    pass += 1
    lines.push(`  ✓ ${name}`)
  } else {
    fail += 1
    if (missing.length) lines.push(`  ✗ ${name}\n      缺少：${missing.join(' / ')}`)
    if (leaked.length) lines.push(`  ✗ ${name}\n      不该出现：${leaked.join(' / ')}`)
  }
  return html
}

/* ---------- 空数据：首次打开 ---------- */
lines.push('\n空状态（首次打开）')
store.clear()
page('工作台给出创建引导', '/', {
  expect: ['创建你的第一个项目', '或导入示例项目体验一下'],
  reject: ['快速打开 Agent', '最近项目'],
})
page('项目中心给出创建引导', '/projects', { expect: ['还没有项目', '示例'] })
page('知识库给出空状态', '/knowledge', { expect: ['知识库还是空的', '直接新建一个知识点'] })
page('Agent 页预置 ChatGPT 与 Claude', '/agents', {
  expect: ['还没有配置 Agent', 'ChatGPT', 'Claude', '自定义 Agent'],
})
page('设置页渲染全部分区', '/settings', {
  expect: ['外观', '项目类别', '高级：自定义可信命令', '数据', '关于'],
})

/* ---------- 有数据 ---------- */
lines.push('\n有数据时')
const seed = buildSeedData()
store.set(
  'aiwb:data:v1',
  JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    ...seed,
    settings: {
      theme: 'light',
      categories: ['课程作业', '编程开发', '论文与研究'],
      manualProgressDefault: false,
    },
  }),
)

page('工作台渲染四个统计卡', '/', {
  expect: ['进行中', '即将截止', '本周完成', '待学习', '个项目', '个任务', '个知识点'],
  reject: ['创建你的第一个项目'],
})
page('工作台渲染 Agent 快捷入口', '/', {
  expect: ['快速打开 Agent', 'ChatGPT', 'Claude', '打开'],
})
page('工作台渲染阻塞提醒', '/', {
  expect: ['个知识点阻塞着项目', '街拍摄影作业', '曝光三要素'],
})
page('工作台渲染最近项目与下一步', '/', {
  expect: ['最近项目', '把备选的照片排一遍，找出还缺哪几个场景', '今日待办'],
})
page('工作台不暴露 Prompt 占位符', '/', { reject: ['（待补充）', '（暂无任务）'] })

page('项目中心渲染三个项目', '/projects', {
  expect: ['街拍摄影作业', '菜谱小程序', '旧物交换调研', '课程作业', '论文与研究'],
})
page('项目中心按状态筛选', '/projects?status=active', {
  expect: ['街拍摄影作业'],
  reject: ['菜谱小程序'],
})
page('项目中心列表视图', '/projects?view=list', {
  expect: ['优先级', '截止'],
})
page('项目中心筛空时给引导', '/projects?q=%E4%B8%8D%E5%AD%98%E5%9C%A8', {
  expect: ['没有符合条件的项目', '清除全部筛选'],
})

lines.push('\n项目详情 · 六个 Tab')
// 打开项目默认落在执行路线，见 ProjectDetail.jsx 的 DEFAULT_TAB
page('默认打开执行路线', '/projects/p_photo', {
  expect: ['执行路线', '熟悉相机的基本操作', '你在这', '先补这个'],
})
page('执行路线按任务顺序列出每一步', '/projects/p_photo', {
  expect: ['先拍够一批素材', '挑出三十张并试着排序', '补拍缺的场景', '写说明并交作业'],
})
page('执行路线显示每一步需要的知识点', '/projects/p_photo', {
  expect: ['曝光三要素：光圈、快门、ISO', '用一组照片讲一个主题', '调色的分寸'],
})
page('执行路线标出对不上的步骤', '/projects/p_photo', {
  expect: ['知识点没跟上'],
})
page('执行路线标出还没安排知识点的步骤', '/projects/p_photo', {
  expect: ['这一步还没安排知识点', '知识点还没安排到哪一步'],
})
// 路线要能照着做：每步说清「要做什么」和「算完成」，知识点说清「为什么要学」
page('执行路线写明每步要做什么', '/projects/p_photo', {
  expect: ['把光圈、快门、ISO 各拨一遍'],
})
page('执行路线写明每步算什么完成', '/projects/p_photo', {
  expect: ['算完成', '不看说明书也能调出想要的亮度和虚实'],
})
page('执行路线写明知识点的为什么', '/projects/p_photo', {
  expect: ['补拍那几个场景要用到'],
})
page('执行路线有「检查能不能做完」入口', '/projects/p_photo', {
  expect: ['检查能不能做完'],
})
page('任务页有「让 AI 拆解项目」入口', '/projects/p_photo?tab=tasks', {
  expect: ['让 AI 拆解项目'],
})
page('知识点清单能选「服务哪一步」', '/projects/p_photo?tab=knowledge', {
  expect: ['服务哪一步', '未安排'],
})
page('知识点清单有「让 AI 排到各步」入口', '/projects/p_photo?tab=knowledge', {
  expect: ['让 AI 排到各步'],
})
page('概览 Tab', '/projects/p_photo?tab=overview', {
  expect: ['街拍摄影作业', '项目简介', '下一步行动', '自动计算', '手动调整'],
})
page('概览 Tab 渲染工具与限制', '/projects/p_photo?tab=overview', {
  expect: ['工具与限制', '只有手机和一台借来的微单，没有别的镜头'],
})
page('详情页顶部显示阻塞横幅', '/projects/p_photo', {
  expect: ['有 2 个阻塞知识点未掌握'],
})
page('任务 Tab 渲染四列看板', '/projects/p_photo?tab=tasks', {
  expect: ['待开始', '进行中', '待复查', '已完成', '挑出三十张并试着排序', '补拍缺的场景'],
})
page('任务 Tab 显示自动进度', '/projects/p_photo?tab=tasks', {
  expect: ['2/6 任务完成', '33%'],
})
page('知识点 Tab 渲染清单', '/projects/p_photo?tab=knowledge', {
  expect: [
    '曝光三要素：光圈、快门、ISO',
    '阻塞项目',
    '为什么需要',
    'AI 生成建议',
    '从模板库选择',
  ],
})
page('知识点 Tab 显示项目专属理由', '/projects/p_photo?tab=knowledge', {
  expect: ['补拍那几个场景要用到'],
})
page('知识点 Tab 显示通用资源', '/projects/p_photo?tab=knowledge', {
  expect: ['光圈 - 维基百科'],
})
page('Agent 工作区生成 Prompt', '/projects/p_photo?tab=agent', {
  expect: [
    '项目上下文 Prompt',
    '你现在是我的 AI 项目协作助手',
    '项目名称：街拍摄影作业',
    '项目进度：33%',
    '把备选的照片排一遍，找出还缺哪几个场景',
  ],
})
page('Prompt 含项目专属约束', '/projects/p_photo?tab=agent', {
  expect: ['只有手机和一台借来的微单，没有别的镜头'],
})
page('Prompt 缺失字段写待补充', '/projects/p_recipes?tab=agent', {
  expect: ['（待补充）', '菜谱小程序'],
})
page('Prompt 不含虚构的个人信息', '/projects/p_recipes?tab=agent', {
  reject: ['大学', '学院', '专业：', '年级'],
})
page('项目资料 Tab 四组手风琴', '/projects/p_photo?tab=resources', {
  expect: ['项目文档', '素材文件', '参考资料', '复盘记录'],
})
page('项目资料渲染复盘内容', '/projects/p_photo?tab=resources', {
  expect: ['第一次出去拍的教训', '手抖'],
})
// p_photo 有 1 条文档、1 条参考、1 条复盘，只有素材组是空的
page('只有空的分组显示引导文案', '/projects/p_photo?tab=resources', {
  expect: ['还没有素材'],
  reject: ['还没有项目文档', '还没有参考资料', '还没有复盘'],
})
page('有内容的分组列出条目', '/projects/p_photo?tab=resources', {
  expect: ['课程群里的作业要求', '几本街头摄影集'],
})

page('知识库按领域分组', '/knowledge', {
  expect: ['编程', '研究', '写作', 'AI工具', '共'],
})
page('知识库显示跨项目复用', '/knowledge', { expect: ['先看别人是怎么做的', '被 2 个项目使用'] })
page('知识库显示阻塞计数', '/knowledge', { expect: ['处阻塞'] })

page('Agent 管理列出三个 Agent', '/agents', {
  expect: ['ChatGPT', 'Claude', '本地 Python', '测试打开'],
})
page('Agent 管理区分类型', '/agents', { expect: ['网页', '命令行'] })
page('Agent 显示网址', '/agents', { expect: ['https://chatgpt.com', 'https://claude.ai'] })
page('Agent 显示命令与参数', '/agents', { expect: ['python -i'] })
page('Agent 关联项目', '/agents', { expect: ['关联项目：菜谱小程序'] })

page('设置页有 AI 生成分区', '/settings', {
  expect: ['AI 生成', '本地模拟数据', 'API key', '端点地址', '测试连接'],
})
page('设置页说明端点不跟随环境变量', '/settings', {
  expect: ['端点地址不跟随环境变量'],
})
// 三步和「高级」里的字段都必须始终在 HTML 里 —— 折叠靠原生 details，
// 不能改成 state 控制显隐，否则 SSR 下这几段会整个消失。
page('设置页把接入讲成分步流程', '/settings', {
  expect: ['供应商', '2. API key', '拿 key', '高级：端点地址、模型、兼容模式'],
})

// 横幅在「还不知道配没配」时必须不渲染：SSR 下是这样，浏览器里首帧也是这样。
// 已经配好的人不该看到一瞬间的「还没接入」。
page('首屏引导横幅不在状态未知时抢跑', '/', {
  reject: ['还没接入 AI'],
})
page('设置页列出类别与用量', '/settings', {
  expect: ['课程作业', '编程开发', '论文与研究', '1 个项目在用'],
})
page('设置页数据分区', '/settings', {
  expect: ['导出 JSON', '选择文件', '导入示例', '清空'],
})
page('设置页关于文案与磁盘持久化一致', '/settings', {
  expect: ['改动会自动保存到本机的数据文件', '浏览器里同时留一份镜像'],
  reject: ['localStorage', '卸载浏览器'],
})

// 实现细节不该漏到界面上。存储方式是改过的，文案很容易跟着漂，
// 所以这里对全部页面做一次兜底扫描。
lines.push('\n界面不泄漏实现细节')
const ALL_PATHS = [
  ['/', '工作台'],
  ['/projects', '项目中心'],
  ['/projects/p_photo', '项目详情·执行路线'],
  ['/projects/p_photo?tab=overview', '项目详情·概览'],
  ['/projects/p_photo?tab=tasks', '项目详情·任务'],
  ['/projects/p_photo?tab=knowledge', '项目详情·知识点'],
  ['/projects/p_photo?tab=agent', '项目详情·Agent'],
  ['/projects/p_photo?tab=resources', '项目详情·资料'],
  ['/knowledge', '知识库'],
  ['/agents', 'Agent 管理'],
  ['/settings', '设置'],
]

const LEAKS = ['localStorage', 'sessionStorage', 'undefined', '[object Object]', 'NaN']
for (const [path, name] of ALL_PATHS) {
  const html = render(path)
  const found = LEAKS.filter((s) => html.includes(s))
  if (found.length === 0) {
    pass += 1
    lines.push(`  ✓ ${name}`)
  } else {
    fail += 1
    lines.push(`  ✗ ${name} 出现不该露出的内容：${found.join(' / ')}`)
  }
}

console.log(lines.join('\n'))
console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail > 0 ? 1 : 0)
