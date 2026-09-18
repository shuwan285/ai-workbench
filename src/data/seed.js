import { addDays, nowISO, todayString } from '../domain/dates.js'

// 示例数据只在用户点「导入示例项目」时生成，不自动注入。
// 日期按导入当天算，隔多久导进来都是"正在进行中"的样子。
export function buildSeedData() {
  const today = todayString()
  const d = (n) => addDays(today, n)
  const ts = nowISO()
  const at = (n) => new Date(`${d(n)}T12:00:00`).toISOString()

  const knowledgeConcepts = [
    {
      id: 'kc_exposure',
      name: '曝光三要素：光圈、快门、ISO',
      category: '设计',
      description: '三者互相牵制，决定了照片亮不亮、糊不糊。自动档救不了所有场景。',
      defaultResources: [
        { label: '光圈 - 维基百科', url: 'https://zh.wikipedia.org/wiki/光圈' },
        { label: '快门 - 维基百科', url: 'https://zh.wikipedia.org/wiki/快门' },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_comp',
      name: '构图：三分法与引导线',
      category: '设计',
      description: '同一批照片好不好看，八成在这一步就定下来了。',
      defaultResources: [
        { label: '构图 - 维基百科', url: 'https://zh.wikipedia.org/wiki/构图' },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_light',
      name: '一天里什么时候的光最好',
      category: '设计',
      description: '同一个地方，早上和傍晚拍出来完全是两张照片。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_color',
      name: '调色的分寸',
      category: '设计',
      description: '把一组照片的色调统一到一个风格上，又不至于假。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_story',
      name: '用一组照片讲一个主题',
      category: '写作',
      description: '单张好看不算数，十二张摆在一起要能说出一件事。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_research',
      name: '先看别人是怎么做的',
      category: '研究',
      description: '动手之前先摸一遍同类的东西，能省掉很多想当然。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_brief',
      name: '把需求写清楚',
      category: '写作',
      description: '写下来才算想明白。说不清的地方，做的时候一定会返工。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_git',
      name: 'Git 分支与合并',
      category: '编程',
      description: '改坏了能退回去，是敢动手改代码的前提。',
      defaultResources: [{ label: 'Pro Git 中文版', url: 'https://git-scm.com/book/zh/v2' }],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_ui',
      name: '界面拆成组件',
      category: '编程',
      description: '界面一复杂就容易写乱，先想清楚哪块该独立出来。',
      defaultResources: [
        {
          label: 'MDN Web 开发学习区',
          url: 'https://developer.mozilla.org/zh-CN/docs/Learn',
        },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_ref',
      name: '参考文献管理工具',
      category: 'AI工具',
      description: '自动生成和统一引用格式，手动整理既慢又容易错。',
      defaultResources: [
        {
          label: 'Zotero 快速上手指南',
          url: 'https://www.zotero.org/support/quick_start_guide',
        },
      ],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'kc_cite',
      name: '引用规范与学术诚信',
      category: '写作',
      description: '哪些要标来源、怎么标，查重时最容易出问题的地方。',
      defaultResources: [],
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  // 注意 kc_research 和 kc_brief 被两个项目共用 —— 这正是概念层要解决的场景
  const projectKnowledge = [
    // stepTaskId 指向路线上的哪一步。pk_3 故意留空，演示「还没安排」的样子。
    rel('pk_1', 'kc_exposure', 'p_photo', {
      reasonNeeded: '补拍那几个场景要用到，曝光拿不准的话，回来发现一批全废。',
      status: 'notStarted',
      estimatedMinutes: 120,
      blocksProject: true,
      stepTaskId: 't_4',
    }),
    rel('pk_2', 'kc_comp', 'p_photo', {
      reasonNeeded: '同一批照片好不好看，八成在按快门之前就定下来了。',
      status: 'learning',
      estimatedMinutes: 150,
      blocksProject: false,
      stepTaskId: 't_1',
    }),
    rel('pk_3', 'kc_light', 'p_photo', {
      reasonNeeded: '什么时候出去拍，直接决定成片是什么调子。',
      status: 'learning',
      estimatedMinutes: 45,
      blocksProject: false,
    }),
    rel('pk_4', 'kc_color', 'p_photo', {
      reasonNeeded: '十二张要像一个系列，色调得统一。',
      status: 'mastered',
      estimatedMinutes: 60,
      blocksProject: false,
      stepTaskId: 't_2',
    }),
    rel('pk_5', 'kc_story', 'p_photo', {
      reasonNeeded: '挑片和排序全靠它，没主题就只能凭感觉凑够十二张。',
      status: 'notStarted',
      estimatedMinutes: 75,
      blocksProject: true,
      stepTaskId: 't_3',
    }),

    rel('pk_6', 'kc_research', 'p_recipes', {
      reasonNeeded: '功能定不下来，多半是没看过别人怎么做的。',
      status: 'notStarted',
      estimatedMinutes: 90,
      blocksProject: true,
      stepTaskId: 't_7',
    }),
    rel('pk_7', 'kc_git', 'p_recipes', {
      reasonNeeded: '改坏了能退回去，才敢大改。',
      status: 'learning',
      estimatedMinutes: 90,
      blocksProject: false,
      stepTaskId: 't_9',
    }),
    rel('pk_8', 'kc_ui', 'p_recipes', {
      reasonNeeded: '界面一复杂就容易写乱，先把组件怎么拆想清楚。',
      status: 'notStarted',
      estimatedMinutes: 120,
      blocksProject: false,
    }),
    rel('pk_9', 'kc_brief', 'p_recipes', {
      reasonNeeded: '需求写不清楚，做着做着就会开始往里加东西。',
      status: 'notStarted',
      estimatedMinutes: 80,
      blocksProject: false,
      stepTaskId: 't_9',
    }),

    rel('pk_10', 'kc_research', 'p_survey', {
      reasonNeeded: '这篇报告写的时候已经练过一轮了。',
      status: 'mastered',
      estimatedMinutes: 90,
      blocksProject: false,
      stepTaskId: 't_11',
    }),
    rel('pk_11', 'kc_brief', 'p_survey', {
      reasonNeeded: '正文的结构就是按这个来的。',
      status: 'mastered',
      estimatedMinutes: 80,
      blocksProject: false,
      stepTaskId: 't_12',
    }),
    rel('pk_12', 'kc_ref', 'p_survey', {
      reasonNeeded: '参考文献格式全交给它生成，省了大半天。',
      status: 'mastered',
      estimatedMinutes: 50,
      blocksProject: false,
      stepTaskId: 't_11',
    }),
    rel('pk_13', 'kc_cite', 'p_survey', {
      reasonNeeded: '交稿前才想起来有几处直接引用的地方没标来源。',
      status: 'learning',
      estimatedMinutes: 35,
      blocksProject: false,
      stepTaskId: 't_13',
    }),
  ]

  const projects = [
    {
      id: 'p_photo',
      name: '街拍摄影作业',
      description: '摄影课的期末作业。交一组十二张照片，主题自定，再配一段说明讲清想表达什么。',
      category: '课程作业',
      status: 'active',
      priority: 'high',
      progress: 33,
      progressMode: 'auto',
      manualProgress: 33,
      coverColor: '#4A6FA5',
      startDate: d(-14),
      dueDate: d(5),
      nextAction: '把备选的照片排一遍，找出还缺哪几个场景',
      constraints: [
        '只有手机和一台借来的微单，没有别的镜头',
        '不会用专业修图软件，只能做基础调整',
        '只有周末能出去拍，平时没时间',
      ],
      tags: ['摄影', '作业'],
      relatedLinks: [],
      notes: '老师提过一句：一组照片要能看出是同一个人拍的，风格别跳。',
      archived: false,
      createdAt: at(-14),
      updatedAt: at(-1),
    },
    {
      id: 'p_recipes',
      name: '菜谱小程序',
      description:
        '想做个给家里人用的小工具：按手头有的食材找菜，做完顺手记一笔这次改了哪里。先做网页版。',
      category: '编程开发',
      status: 'planning',
      priority: 'medium',
      progress: 0,
      progressMode: 'auto',
      manualProgress: 0,
      coverColor: '#7E6BAA',
      startDate: d(-3),
      dueDate: d(45),
      nextAction: '先把要做哪几个功能定下来',
      constraints: ['只有晚上和周末有空', '没独立做过完整的前端项目'],
      tags: ['前端', '个人项目'],
      relatedLinks: [],
      notes: '',
      archived: false,
      createdAt: at(-3),
      updatedAt: at(-1),
    },
    {
      id: 'p_survey',
      name: '旧物交换调研',
      description: '社会调查课的期末报告。蹲了两个小区的旧物交换角，写成四千字的观察报告。',
      category: '论文与研究',
      status: 'done',
      priority: 'low',
      progress: 100,
      progressMode: 'auto',
      manualProgress: 100,
      coverColor: '#5A9367',
      startDate: d(-30),
      dueDate: d(-3),
      nextAction: '',
      constraints: ['只能引用近五年的资料'],
      tags: ['调研'],
      relatedLinks: [],
      notes: '交完了。下次早点开始，最后两天太赶。',
      archived: false,
      createdAt: at(-30),
      updatedAt: at(-3),
    },
  ]

  const tasks = [
    // 每条都写清「要做什么」和「算完成」—— 执行路线要照着这两条才能动手
    t('t_1', 'p_photo', '熟悉相机的基本操作', 'done', 'high', null, 2, at(-6), 1000, {
      description: '把光圈、快门、ISO 各拨一遍，看它们分别怎么影响画面。',
      doneWhen: '不看说明书也能调出想要的亮度和虚实',
    }),
    t('t_2', 'p_photo', '先拍够一批素材', 'done', 'high', null, 3, at(-3), 2000, {
      description: '挑两个下午上街，只管拍，先凑够两百张，边拍边挑会什么都拍不出来。',
      doneWhen: '素材够挑出三十张备选',
    }),
    t('t_3', 'p_photo', '挑出三十张并试着排序', 'doing', 'high', d(1), 4, null, 3000, {
      description: '从素材里挑出三十张，按场景分组，看能不能串成一条线。',
      doneWhen: '能说出这组照片想讲什么，且每张都对得上',
    }),
    t('t_4', 'p_photo', '补拍缺的场景', 'todo', 'high', d(2), 2, null, 4000, {
      description: '排完之后发现缺的那几类场景，专门再出去拍一次。',
      doneWhen: '缺的场景都拍到了，不用拿别的凑数',
    }),
    t('t_5', 'p_photo', '统一色调', 'todo', 'medium', d(3), 3, null, 5000, {
      description: '把最后这十二张的亮度和色调调到一个风格上，别一张一个样。',
      doneWhen: '并排看没有明显跳脱的一张',
    }),
    t('t_6', 'p_photo', '写说明并交作业', 'todo', 'medium', d(5), 2, null, 6000, {
      description: '写三百字说明，讲清主题和挑片的理由。',
      doneWhen: '说明和照片能对上，不空洞',
    }),

    t('t_7', 'p_recipes', '定下要做哪几个功能', 'doing', 'high', d(7), 6, null, 1000),
    t('t_8', 'p_recipes', '试几个现成的菜谱 App', 'todo', 'high', d(3), 1, null, 2000),
    t('t_9', 'p_recipes', '把需求和界面草图写下来', 'todo', 'medium', d(20), 8, null, 3000),

    t('t_10', 'p_survey', '定选题和提纲', 'done', 'high', null, 2, at(-26), 1000),
    t('t_11', 'p_survey', '找资料并读完', 'done', 'high', null, 5, at(-18), 2000),
    t('t_12', 'p_survey', '写正文', 'done', 'medium', null, 8, at(-8), 3000),
    t('t_13', 'p_survey', '改格式和查重', 'done', 'medium', null, 2, at(-3), 4000),
  ]

  const agents = [
    {
      id: 'a_chatgpt',
      name: 'ChatGPT',
      icon: '🤖',
      category: '对话',
      type: 'web',
      description: '通用问答、头脑风暴、改代码',
      isPinned: true,
      projectIds: [],
      url: 'https://chatgpt.com',
      localPath: '',
      command: '',
      args: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'a_claude',
      name: 'Claude',
      icon: '✳️',
      category: '对话',
      type: 'web',
      description: '长文本写作、改稿、复杂推理',
      isPinned: true,
      projectIds: ['p_recipes'],
      url: 'https://claude.ai',
      localPath: '',
      command: '',
      args: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'a_python',
      name: '本地 Python',
      icon: '⌨️',
      category: '编程',
      type: 'command',
      description: '快速试算法和小片段，不用开 IDE',
      isPinned: false,
      projectIds: [],
      url: '',
      localPath: '',
      command: 'python',
      args: ['-i'],
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  const promptTemplates = [
    {
      id: 'pt_debug',
      name: '代码调试求助',
      projectId: null,
      content: `我在写代码时遇到了问题，请帮我定位。

我想实现的效果：
{{期望行为}}

实际发生的情况：
{{实际行为}}

报错信息：
{{报错信息}}

相关代码：
{{代码片段}}

请先复述一遍你对我意图的理解，确认没理解偏之后，再给出排查步骤。不确定的地方直接说不确定，不要猜。`,
      variables: ['期望行为', '实际行为', '报错信息', '代码片段'],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'pt_lit',
      name: '资料速读',
      projectId: 'p_survey',
      content: `帮我快速读懂这份资料。

标题：{{标题}}
我关心的方向：{{研究方向}}

请按这个顺序输出：
1. 这份资料想解决什么问题
2. 用了什么方法
3. 结论是什么，证据够不够
4. 和我关心的方向有什么关系
5. 我该不该细读全文，理由是什么

如果摘要里的信息不足以判断，直接告诉我信息不足，不要编。`,
      variables: ['标题', '研究方向'],
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  const resources = [
    {
      id: 'r_1',
      projectId: 'p_photo',
      title: '课程群里的作业要求',
      type: 'doc',
      description: '主题自定，但十二张要能看出是同一个人拍的',
      urlOrPath: '',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'r_2',
      projectId: 'p_photo',
      title: '几本街头摄影集',
      type: 'reference',
      description: '看别人怎么把不相干的场景串成一组，比看教程有用',
      urlOrPath: 'https://www.bilibili.com/',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'r_3',
      projectId: 'p_photo',
      title: '第一次出去拍的教训',
      type: 'retro',
      description:
        '光顾着拍，回来发现一半是虚的——光线不够的时候快门太慢，手抖。下次出门先把快门定在 1/125 以上，宁可开高一点的 ISO。',
      urlOrPath: '',
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  return {
    projects,
    tasks,
    knowledgeConcepts,
    projectKnowledge,
    agents,
    promptTemplates,
    resources,
  }
}

function rel(id, conceptId, projectId, extra) {
  return {
    id,
    conceptId,
    projectId,
    reasonNeeded: '',
    status: 'notStarted',
    estimatedMinutes: null,
    resourceLinks: [],
    blocksProject: false,
    notes: '',
    // 服务于路线上的哪一步，null 表示还没安排
    stepTaskId: null,
    ...extra,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}

function t(
  id,
  projectId,
  title,
  status,
  priority,
  dueDate,
  estimatedHours,
  completedAt,
  order,
  extra = {},
) {
  return {
    id,
    projectId,
    title,
    // 「要做什么」和「算完成」—— 执行路线照着这两条才能动手
    description: '',
    doneWhen: '',
    status,
    priority,
    dueDate,
    estimatedHours,
    completedAt,
    order,
    ...extra,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }
}
