// 内置知识包。选一个包，把里面的条目批量加进项目。
// 加入时会先按名称查重，已经存在的概念直接建关联，不会重复创建。

export const KNOWLEDGE_TEMPLATES = [
  {
    id: 'kt_sim',
    name: '做一次仿真实验',
    description: '从跑通代码到写出能解释结果的报告',
    items: [
      {
        name: '实验环境的搭建与验证',
        category: '编程',
        reasonNeeded: '环境不对，后面所有结果都不可信。',
        estimatedMinutes: 60,
        defaultResources: [],
      },
      {
        name: '把结果画成图',
        category: '编程',
        reasonNeeded: '仿真结论要靠图说话，坐标轴和单位不对会被直接质疑。',
        estimatedMinutes: 50,
        defaultResources: [],
      },
      {
        name: '噪声与误差的来源',
        category: '研究',
        reasonNeeded: '解释曲线形状时要能说清误差是哪来的。',
        estimatedMinutes: 75,
        defaultResources: [],
      },
      {
        name: '实验报告的结构与规范',
        category: '写作',
        reasonNeeded: '格式和结构不对会被扣分。',
        estimatedMinutes: 40,
        defaultResources: [],
      },
    ],
  },
  {
    id: 'kt_web',
    name: '学做 Web 应用',
    description: '从零做出一个能跑起来的前端项目',
    items: [
      {
        name: 'HTML 与 CSS 基础',
        category: '编程',
        reasonNeeded: '页面长什么样全靠这两样。',
        estimatedMinutes: 180,
        defaultResources: [
          { label: 'MDN Web 开发学习区', url: 'https://developer.mozilla.org/zh-CN/docs/Learn' },
        ],
      },
      {
        name: '组件与状态管理',
        category: '编程',
        reasonNeeded: '状态放哪决定了代码会不会越写越乱。',
        estimatedMinutes: 120,
        defaultResources: [{ label: 'React 官方教程', url: 'https://react.dev/learn' }],
      },
      {
        name: 'HTTP 与接口调用',
        category: '编程',
        reasonNeeded: '前后端联调和排查网络问题都要用到。',
        estimatedMinutes: 60,
        defaultResources: [],
      },
      {
        name: 'Git 分支与合并',
        category: '编程',
        reasonNeeded: '改坏了能退回去，才敢动手改。',
        estimatedMinutes: 90,
        defaultResources: [{ label: 'Pro Git 中文版', url: 'https://git-scm.com/book/zh/v2' }],
      },
    ],
  },
  {
    id: 'kt_paper',
    name: '写一篇课程论文',
    description: '从选题到定稿的完整链路',
    items: [
      {
        name: '文献检索与筛选策略',
        category: '研究',
        reasonNeeded: '决定内容质量的上限。',
        estimatedMinutes: 90,
        defaultResources: [],
      },
      {
        name: '参考文献管理工具',
        category: 'AI工具',
        reasonNeeded: '手动整理引用格式既慢又容易错。',
        estimatedMinutes: 50,
        defaultResources: [
          { label: 'Zotero 快速上手指南', url: 'https://www.zotero.org/support/quick_start_guide' },
        ],
      },
      {
        name: '学术写作的论证结构',
        category: '写作',
        reasonNeeded: '观点需要证据支撑，结构决定可读性。',
        estimatedMinutes: 80,
        defaultResources: [],
      },
      {
        name: '引用规范与学术诚信',
        category: '写作',
        reasonNeeded: '查重和答辩时最容易出问题的地方。',
        estimatedMinutes: 35,
        defaultResources: [],
      },
    ],
  },
  {
    id: 'kt_ai',
    name: '日常用 AI 提效',
    description: '把 AI 真正用进学习和项目里',
    items: [
      {
        name: '把问题描述清楚的方法',
        category: 'AI工具',
        reasonNeeded: '描述方式直接决定回答质量，能省下大量来回试错。',
        estimatedMinutes: 30,
        defaultResources: [],
      },
      {
        name: '判断 AI 回答是否可信',
        category: 'AI工具',
        reasonNeeded: 'AI 会一本正经地编，尤其是数字、引用和 API 用法。',
        estimatedMinutes: 40,
        defaultResources: [],
      },
      {
        name: '把长任务拆成可验证的小步',
        category: '其他',
        reasonNeeded: '一次让 AI 做太多，出错后很难定位是哪一步坏的。',
        estimatedMinutes: 45,
        defaultResources: [],
      },
    ],
  },
]
