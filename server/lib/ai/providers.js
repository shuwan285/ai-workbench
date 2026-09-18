// 供应商预设。
//
// **预设是填充器，不是真源。** 选中之后只是把值填进设置页的表单，用户看得见、
// 改得动，保存时存进 config.json。请求发去哪始终由那份配置决定，不由这里推导 ——
// 和 anthropic.js 里「不读 ANTHROPIC_BASE_URL」是同一条理由：
// 升级一次应用就把老用户的请求改道到别的地址，而他自己什么都没改，是最难查的那种故障。
//
// baseUrl 有三种取值，含义必须分清：
//   ''   官方端点（存储层就是这个语义）
//   具体 URL  该端点的地址
//   null **不要动用户的输入框** —— 让用户自己填，不要预填任何值

export const DEFAULT_BASE_URL = 'https://api.anthropic.com'

// 想换在设置页改，不要为了省钱在这里降级 —— 那是使用者的决定。
export const DEFAULT_MODEL = 'claude-opus-4-8'

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    baseUrl: '',
    compatMode: false,
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    // 实测于 2026-09-16（docs/进度日志.md）。第三方端点地址是长期维护面，
    // 改之前请先真的调通一次，再更新这个日期。
    baseUrl: 'https://api.deepseek.com/anthropic',
    // 这个端点不认识 output_config，必须开兼容模式，否则会退化成散文
    compatMode: true,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
  },
  {
    id: 'custom',
    label: '其他兼容端点',
    // null 而不是 ''：后者会把端点悄悄改回官方
    baseUrl: null,
    compatMode: true,
    models: [],
    keyUrl: null,
    keyPrefix: '',
  },
]

const trimUrl = (url) => String(url || '').trim().replace(/\/+$/, '')

// 从端点地址反推用户当初选的是哪一条。存的是地址、不是预设 id，所以这里得倒推 ——
// 好处是用户手改过地址之后，界面显示的仍然是地址的实际归属，不会两边对不上。
// 认不出来就算「自定义端点」，不去猜它到底是哪家。
export function matchProvider(baseUrl, providers = PROVIDERS) {
  const url = trimUrl(baseUrl)

  if (!url) return providers.find((p) => p.baseUrl === '') || providers[0]

  return (
    providers.find(
      (p) => typeof p.baseUrl === 'string' && trimUrl(p.baseUrl).toLowerCase() === url.toLowerCase(),
    ) ||
    providers.find((p) => p.id === 'custom') ||
    providers[providers.length - 1]
  )
}

// 「连不上」这句话得说清楚连的是哪儿。写死 api.anthropic.com 的话，
// 用户配的是第三方端点时会完全摸不着头脑。
export function unreachableMessage(baseUrl, err) {
  return `连不上 ${trimUrl(baseUrl) || DEFAULT_BASE_URL}：${err?.message || '未知错误'}`
}
