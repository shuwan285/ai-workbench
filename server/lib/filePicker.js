import { spawn } from 'node:child_process'

// 唤起系统原生文件选择器，只回传用户主动选中的路径。
// 这里没有任何「传路径 → 列内容」的能力，前端没法拿它探测磁盘。

const PICK_TIMEOUT_MS = 120000

function run(file, args) {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let child

    try {
      child = spawn(file, args, { shell: false, windowsHide: true })
    } catch (e) {
      return resolve({ failed: true, code: 'PICKER_UNAVAILABLE', message: e.message })
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 忽略 */
      }
      resolve({ failed: true, code: 'PICKER_TIMEOUT', message: '等待选择超时' })
    }, PICK_TIMEOUT_MS)

    const done = (r) => {
      clearTimeout(timer)
      resolve(r)
    }

    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.once('error', (e) =>
      done({
        failed: true,
        code: e.code === 'ENOENT' ? 'PICKER_UNAVAILABLE' : 'PICKER_FAILED',
        message: e.message,
      }),
    )
    child.once('close', (code) =>
      done({ exitCode: code, out: out.trim(), err: err.trim() }),
    )
  })
}

// 用隐形置顶窗体做 owner，否则对话框容易被浏览器窗口盖住
const WIN_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$f = New-Object System.Windows.Forms.Form',
  '$f.TopMost = $true',
  '$f.ShowInTaskbar = $false',
  '$f.Opacity = 0',
  '$f.Show()',
  '$d = New-Object System.Windows.Forms.OpenFileDialog',
  "$d.Title = '选择应用程序'",
  "$d.Filter = '应用程序 (*.exe;*.lnk)|*.exe;*.lnk|所有文件 (*.*)|*.*'",
  '$d.CheckFileExists = $true',
  '$r = $d.ShowDialog($f)',
  '$f.Close()',
  'if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }',
].join('; ')

export async function pickApplicationPath() {
  if (process.platform === 'win32') {
    const r = await run('powershell.exe', ['-NoProfile', '-STA', '-Command', WIN_SCRIPT])
    if (r.failed) return r
    if (!r.out) return { ok: false, code: 'CANCELLED' }
    return { ok: true, path: r.out }
  }

  if (process.platform === 'darwin') {
    const r = await run('osascript', [
      '-e',
      'POSIX path of (choose file with prompt "选择应用程序")',
    ])
    if (r.failed) return r
    if (r.exitCode !== 0 || !r.out) return { ok: false, code: 'CANCELLED' }
    return { ok: true, path: r.out }
  }

  const r = await run('zenity', ['--file-selection', '--title=选择应用程序'])
  if (r.failed) return r
  if (r.exitCode !== 0 || !r.out) return { ok: false, code: 'CANCELLED' }
  return { ok: true, path: r.out }
}
