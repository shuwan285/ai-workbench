// 模拟的知识点生成接口。
// 接真实模型时只需要换掉这一个文件 —— 保持 suggestKnowledge 的入参和返回结构不变即可。
// 返回结构：{ name, category, reasonNeeded, estimatedMinutes, defaultResources[] }

const COMMON = [
  {
    name: '命令行基础操作',
    category: '编程',
    reasonNeeded: '装环境、跑脚本、看报错都绕不开命令行，卡在这里会拖慢整个项目。',
    estimatedMinutes: 60,
    keywords: ['命令行', '终端', 'shell', '环境', '安装', '部署', '脚本'],
    defaultResources: [],
  },
  {
    name: '用 AI 提问的有效方式',
    category: 'AI工具',
    reasonNeeded: '把问题描述清楚能显著减少来回试错，尤其是调试和查概念的时候。',
    estimatedMinutes: 30,
    keywords: ['ai', 'agent', 'prompt', '提问', 'claude', 'chatgpt'],
    defaultResources: [],
  },
  {
    name: '文件与目录组织习惯',
    category: '其他',
    reasonNeeded: '项目文件一多就容易找不到，前期定好结构能省下大量翻找时间。',
    estimatedMinutes: 25,
    keywords: ['文件', '目录', '整理', '素材', '资料'],
    defaultResources: [],
  },
]

const POOLS = {
  课程作业: [
    {
      name: '曝光三要素：光圈、快门、ISO',
      category: '设计',
      reasonNeeded: '三者互相牵制，决定了照片亮不亮、糊不糊，自动档救不了所有场景。',
      estimatedMinutes: 120,
      keywords: ['曝光', '光圈', '快门', 'iso', '虚化', '亮度'],
      defaultResources: [
        { label: '光圈 - 维基百科', url: 'https://zh.wikipedia.org/wiki/光圈' },
        { label: '快门 - 维基百科', url: 'https://zh.wikipedia.org/wiki/快门' },
      ],
    },
    {
      name: '构图：三分法与引导线',
      category: '设计',
      reasonNeeded: '同一批照片好不好看，八成在按快门之前就定下来了。',
      estimatedMinutes: 90,
      keywords: ['构图', '三分', '引导线', '取景', '画面'],
      defaultResources: [
        { label: '构图 - 维基百科', url: 'https://zh.wikipedia.org/wiki/构图' },
      ],
    },
    {
      name: '光线与拍摄时机',
      category: '设计',
      reasonNeeded: '同一个地方，早上和傍晚拍出来完全是两张照片。',
      estimatedMinutes: 45,
      keywords: ['光线', '逆光', '顺光', '时段', '阴天'],
      defaultResources: [],
    },
    {
      name: '调色的分寸',
      category: '设计',
      reasonNeeded: '一组照片要像一个系列，色调得统一，又别调过头显得假。',
      estimatedMinutes: 60,
      keywords: ['调色', '色调', '白平衡', '后期', '修图'],
      defaultResources: [],
    },
    {
      name: '用一组照片讲一个主题',
      category: '写作',
      reasonNeeded: '单张好看不算数，一组摆在一起要能说出一件事。',
      estimatedMinutes: 75,
      keywords: ['主题', '组照', '叙事', '排序', '选片'],
      defaultResources: [],
    },
    {
      name: '相机的手动模式与对焦',
      category: '其他',
      reasonNeeded: '自动模式在光线复杂的时候会判断错，想拍出想要的效果得自己控制。',
      estimatedMinutes: 50,
      keywords: ['相机', '手机', '手动', '对焦', '参数'],
      defaultResources: [],
    },
    {
      name: '作业说明的写法',
      category: '写作',
      reasonNeeded: '说明要和照片对得上，写空话会让整组作品显得没有想法。',
      estimatedMinutes: 40,
      keywords: ['说明', '作业', '格式', '提交', '创作说明'],
      defaultResources: [],
    },
  ],

  编程开发: [
    {
      name: 'Git 分支与合并',
      category: '编程',
      reasonNeeded: '改动一多就需要分支隔离，不然回退和协作都会很痛苦。',
      estimatedMinutes: 90,
      keywords: ['git', '版本', '分支', '协作', '提交'],
      defaultResources: [
        { label: 'Pro Git 中文版', url: 'https://git-scm.com/book/zh/v2' },
      ],
    },
    {
      name: 'HTTP 与 REST 基础',
      category: '编程',
      reasonNeeded: '前后端联调、看懂接口文档、排查网络问题都要用到。',
      estimatedMinutes: 60,
      keywords: ['http', 'api', 'rest', '接口', '请求', '后端'],
      defaultResources: [
        { label: 'MDN Web 开发学习区', url: 'https://developer.mozilla.org/zh-CN/docs/Learn' },
      ],
    },
    {
      name: '调试与断点技巧',
      category: '编程',
      reasonNeeded: '靠打印日志猜问题效率很低，会用断点能省大量时间。',
      estimatedMinutes: 45,
      keywords: ['调试', 'debug', '断点', '报错', 'bug'],
      defaultResources: [
        { label: 'VS Code 文档', url: 'https://code.visualstudio.com/docs' },
      ],
    },
    {
      name: '组件与状态管理',
      category: '编程',
      reasonNeeded: '界面拆成组件后，状态放哪决定了代码会不会越写越乱。',
      estimatedMinutes: 120,
      keywords: ['react', 'vue', '组件', '前端', '状态', '界面'],
      defaultResources: [{ label: 'React 官方教程', url: 'https://react.dev/learn' }],
    },
    {
      name: '依赖管理与版本锁定',
      category: '编程',
      reasonNeeded: '避免「我这能跑你那不能跑」，也是复现环境的前提。',
      estimatedMinutes: 40,
      keywords: ['依赖', 'npm', '包管理', '版本', '环境'],
      defaultResources: [],
    },
    {
      name: '写可读的代码',
      category: '编程',
      reasonNeeded: '隔两周回头看自己的代码，命名和结构决定了还认不认得。',
      estimatedMinutes: 50,
      keywords: ['重构', '命名', '规范', '可读', '维护'],
      defaultResources: [],
    },
  ],

  论文与研究: [
    {
      name: '文献检索与筛选策略',
      category: '研究',
      reasonNeeded: '决定内容质量的上限 —— 找不到对的文献，后面写什么都站不住。',
      estimatedMinutes: 90,
      keywords: ['文献', '检索', '综述', '论文', '研究'],
      defaultResources: [],
    },
    {
      name: '参考文献管理工具',
      category: 'AI工具',
      reasonNeeded: '手动整理引用格式既慢又容易错，交给工具做。',
      estimatedMinutes: 50,
      keywords: ['引用', '参考文献', 'zotero', '格式', '文献'],
      defaultResources: [
        { label: 'Zotero 快速上手指南', url: 'https://www.zotero.org/support/quick_start_guide' },
      ],
    },
    {
      name: '学术写作的论证结构',
      category: '写作',
      reasonNeeded: '观点需要证据支撑，「提出 - 论证 - 小结」的结构能显著提升可读性。',
      estimatedMinutes: 80,
      keywords: ['写作', '论证', '结构', '引言', '论文'],
      defaultResources: [],
    },
    {
      name: '图表规范与数据可视化',
      category: '设计',
      reasonNeeded: '图比文字更快传达结论，但坐标轴、单位、图注不规范会显得不专业。',
      estimatedMinutes: 60,
      keywords: ['图表', '可视化', '数据', '图'],
      defaultResources: [],
    },
    {
      name: '统计显著性与 p 值',
      category: '研究',
      reasonNeeded: '涉及实验数据时，判断差异是真实还是偶然全靠这个。',
      estimatedMinutes: 100,
      keywords: ['统计', '显著性', 'p值', '实验', '数据'],
      defaultResources: [{ label: 'P值 - 维基百科', url: 'https://zh.wikipedia.org/wiki/P值' }],
    },
    {
      name: '引用规范与学术诚信',
      category: '写作',
      reasonNeeded: '引用格式不统一或漏标来源，是查重和答辩时最容易出问题的地方。',
      estimatedMinutes: 35,
      keywords: ['引用', '查重', '诚信', '规范', '抄袭'],
      defaultResources: [],
    },
  ],
}

function poolFor(category) {
  return POOLS[category] || []
}

function matchesKeywords(item, haystack) {
  if (!item.keywords || item.keywords.length === 0) return false
  return item.keywords.some((k) => haystack.includes(k.toLowerCase()))
}

/* ---------- 排到哪一步 ---------- */

// 中文没有词边界，只能按二字组看重叠。粗糙，但演示够用 ——
// 「相机的手动模式与对焦」和「熟悉相机的基本操作」会因为「相机」撞上。
function bigrams(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  const out = new Set()
  for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2))
  return out
}

// 返回最靠前那个沾边的步骤 —— 要的是「最晚在哪一步动手之前补掉」，
// 所以取第一个需要它的步骤，不是匹配得分最高的那个。
//
// 只拿知识点**名称**去比，不带上 reasonNeeded。理由是为了解释「为什么这个项目需要它」
// 写的，里面的「照片」「报告」这类词在好几个步骤的标题里都会出现，带上之后
// 知识点会被拽到那些步骤上。模拟数据给错答案比不给更糟，
// 匹配不上就老实返回 null（未安排）。
function pickStep({ name }, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null

  const grams = bigrams(name)

  for (const task of tasks) {
    if (!task || !task.title) continue
    let overlap = 0
    for (const g of bigrams(task.title)) if (grams.has(g)) overlap += 1
    if (overlap > 0) return task.id
  }
  return null
}

export function suggestKnowledge({ projectName = '', category = '', description = '', tasks = [] }) {
  const haystack = `${projectName} ${description}`.toLowerCase()

  const candidates = [...poolFor(category), ...Object.values(POOLS).flat(), ...COMMON]

  const seen = new Set()
  const hit = []
  const rest = []

  for (const item of candidates) {
    const key = item.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (matchesKeywords(item, haystack)) hit.push(item)
    else rest.push(item)
  }

  // 命中关键词的排前面，剩下的按类别补足，凑到 5-8 条
  const picked = [...hit, ...rest].slice(0, hit.length >= 5 ? hit.length : 8)

  return picked.map((item) => ({
    name: item.name,
    category: item.category,
    reasonNeeded: item.reasonNeeded,
    estimatedMinutes: item.estimatedMinutes,
    defaultResources: item.defaultResources || [],
    stepId: pickStep(item, tasks),
    // 「和项目无关」是模型自己报的判断，关键词匹配做不到。
    // 这里留 false，而不是假装能判断。
    unrelated: false,
  }))
}

/* ---------- 复核完整度 ---------- */

// 模拟数据**查不出**「项目还缺哪一步」—— 那要理解项目本身。
// 它能做的是结构检查：哪一步没写清楚。verdict 里必须把这一点说明白，
// 否则用户会把「没报问题」当成「计划是完整的」。
export function reviewPlan({ tasks = [] }) {
  const gaps = []

  for (const t of tasks) {
    const title = String(t.title || '').trim()
    if (!title) continue
    if (!String(t.description || '').trim()) {
      gaps.push({
        kind: 'weak_step',
        about: title,
        detail: '这一步没写「要做什么」，到时候会不知道从哪下手。',
        knowledgeName: '',
      })
    } else if (!String(t.doneWhen || '').trim()) {
      gaps.push({
        kind: 'weak_step',
        about: title,
        detail: '这一步没写「算完成」，做完了也判断不了能不能放下。',
        knowledgeName: '',
      })
    }
  }

  const suffix =
    '注意：本地模拟数据只能查「有没有写全」，查不出「项目还缺哪一步」—— 那个得靠真实模型。'

  return {
    verdict:
      gaps.length === 0
        ? `结构上没看出问题（${tasks.length} 步都写全了）。${suffix}`
        : `结构上有 ${gaps.length} 处没写全。${suffix}`,
    gaps,
  }
}

/* ---------- 把项目拆成几步 ---------- */

// 模拟数据没法真的理解项目，就按类别给一套通用的拆法。
// 每条都带上「要做什么」和「算完成」，形状和真实模型返回的一致。
const PLAN_POOLS = {
  课程作业: [
    ['选定题目与交付要求', '把作业要求逐条读一遍，确认要交什么、什么格式、什么时候交。', '能一句话说清这次要交什么'],
    ['搭好环境，跑通一个最小例子', '装好需要的软件，把官方或教材上的最小例子跑起来。', '最小例子在自己机器上能出结果'],
    ['实现核心部分', '照着题目要求把主要功能写出来，先不追求优化。', '核心流程能跑通，结果说得过去'],
    ['跑出结果并出图', '把结果整理成图表，确认形状符合预期。', '图表能解释得通，不是一片乱码'],
    ['整理成报告并核对格式', '按模板组织内容，核对页数、图表编号和引用格式。', '对着模板清单逐条打过勾'],
  ],
  编程开发: [
    ['想清楚要解决什么问题', '写一段话说明这个东西给谁用、解决什么、不做什么。', '能说清「不做什么」'],
    ['搭项目骨架', '把目录、依赖、跑起来的入口先立起来，可以先返回假数据。', '一条命令能把项目跑起来'],
    ['实现核心功能', '把最主要的那条流程打通，边界情况先放一放。', '主流程能从头走到尾'],
    ['自己用一遍，修问题', '当成真实用户走一遍，把卡住的地方记下来逐个修。', '完整走一遍不再卡壳'],
    ['整理说明', '写清怎么跑起来、怎么用、已知的问题。', '别人照着说明能跑起来'],
  ],
  论文与研究: [
    ['定选题方向', '把想研究的问题收窄到能做完的范围，和导师确认。', '导师点头，题目能一句话说清'],
    ['检索并筛选文献', '按关键词检索，读摘要筛掉不相关的，留下值得精读的。', '手里有一份待精读清单'],
    ['精读核心文献并整理', '读完核心的几篇，做笔记或对比表，理出别人做到哪了。', '能说出这个方向的空白在哪'],
    ['写初稿', '按论证结构把观点、证据、小结写出来，先不管措辞。', '每一节都有明确的论点'],
    ['改格式和查重', '统一引用格式，补漏标的来源，跑一遍查重。', '查重结果在要求以内'],
  ],
}

const GENERIC_PLAN = [
  ['搞清楚这件事要做到什么样', '把最终要交出什么、做到什么程度写下来。', '能用一句话说清完成的样子'],
  ['分解成能动手的小块', '把大目标拆成几件今天就能开始做的事。', '每一块都能独立开工'],
  ['逐个做掉', '按顺序推进，卡住的地方记下来。', '每一块都到了能交的程度'],
  ['收尾检查', '整体过一遍，看有没有漏的、对不上的。', '对着最初的目的一条条核对过'],
]

export function planProject({ category = '', existing = [] } = {}) {
  const pool = PLAN_POOLS[category] || GENERIC_PLAN
  const taken = new Set(existing.map((t) => String(t.title || '').trim().toLowerCase()))

  // 项目里已经有的步骤不再重复给
  return pool
    .filter(([title]) => !taken.has(title.toLowerCase()))
    .map(([title, description, doneWhen]) => ({ title, description, doneWhen }))
}

// 对已有的知识点做归属：不生成新东西，只回答「每条该在哪一步之前补」。
export function assignKnowledgeSteps({ tasks = [], knowledge = [] }) {
  return knowledge.map((k) => {
    const stepId = pickStep({ name: k.name, reasonNeeded: k.reasonNeeded }, tasks)
    return {
      conceptId: k.conceptId,
      stepId,
      unrelated: false,
      reason: stepId ? '按关键词匹配上的，模拟数据不一定准' : '没找到对得上的步骤',
    }
  })
}
