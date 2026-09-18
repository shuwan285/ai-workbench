// 扫一遍**将要提交的内容**（git 的暂存区）里有没有密钥形态的串。
//
// 两个地方用它：
//   1. pre-commit 钩子 —— 挡在提交之前，那时候还来得及
//   2. CI —— 有人 --no-verify 绕过钩子的话，至少推上去能看见红色
//
// 只认「长 sk- 串」这一类。宁可漏报也不误报：误报多了钩子就会被 --no-verify 绕过，
// 那等于没有。真正的兜底是「key 只存 ~/.ai-workbench/，不在仓库里」这个架构本身。
//
// 跑法：npm run check:secrets

import { execSync } from 'node:child_process'

const PATTERN = 'sk-[A-Za-z0-9_-]{20,}'

// 测试里用的假 key。它们不是凭据，但形态和真的没法区分，只能按值放行。
// 往这里加之前先确认：那串东西真的只在测试里当占位符用。
const ALLOWED = new Set([
  'sk-ant-api03-THIS-IS-A-FAKE-KEY-for-testing-1234',
  'sk-ant-env-ONLY-FROM-ENVIRONMENT-9999',
])

let found = ''
try {
  // --cached 查的是暂存区，正好等于「这次要提交的东西」；
  // 扫工作区会把被 .gitignore 挡住的文件也算进来，那是误报
  found = execSync(`git grep --cached -nI -E "${PATTERN}"`, { encoding: 'utf8' })
} catch {
  // git grep 一条都没命中时退出码是 1
  console.log('✅ 没有发现密钥形态的串')
  process.exit(0)
}

const hits = []
for (const line of found.split('\n').filter(Boolean)) {
  const match = line.match(/sk-[A-Za-z0-9_-]{20,}/)
  if (!match || ALLOWED.has(match[0])) continue
  hits.push(line)
}

if (hits.length === 0) {
  console.log('✅ 没有发现密钥形态的串（测试用的假 key 已排除）')
  process.exit(0)
}

console.error('❌ 发现疑似密钥，已拦下：\n')
for (const hit of hits) console.error('   ' + hit)
console.error(
  '\n如果确认是测试用的假 key，把它加进 scripts/check-secrets.mjs 的 ALLOWED。' +
    '\n如果是真的 key —— 别提交，先轮换掉它。',
)
process.exit(1)
