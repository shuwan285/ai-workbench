// 所有后端请求都经过这里。X-AIWB 头是接口边界的一部分：
// 带上它就会触发跨域预检，而预检只有本机的 5173 端口能通过。
const HEADERS = { 'Content-Type': 'application/json', 'X-AIWB': '1' }

export async function post(path, body) {
  let res
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body ?? {}),
    })
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: `连不上本地服务：${err.message}` }
  }
  return readJson(res)
}

export async function put(path, body) {
  let res
  try {
    res = await fetch(path, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify(body ?? {}),
    })
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: `连不上本地服务：${err.message}` }
  }
  return readJson(res)
}

export async function del(path) {
  let res
  try {
    res = await fetch(path, { method: 'DELETE', headers: HEADERS })
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: `连不上本地服务：${err.message}` }
  }
  return readJson(res)
}

export async function get(path) {
  let res
  try {
    res = await fetch(path, { headers: { 'X-AIWB': '1' } })
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: `连不上本地服务：${err.message}` }
  }
  return readJson(res)
}

const GATEWAY_STATUS = [502, 503, 504]

// 「服务不在」和「服务返回了坏数据」是两件事，代码里必须分开。
//
// 接口进程没起来时，Vite 代理会返回 500 + text/plain 的错误页（实测确认），
// 这时候 res.json() 直接抛。如果按解析错误处理，离线这种正常降级状态
// 就会被报成「服务返回了非 JSON」，对用户完全是误导。
//
// 判据：不是 application/json 就当成服务不可达。接口自己的响应一律是 JSON
// （包括 4xx/5xx，express 的错误分支也走 res.json），所以不会误伤。
export function isServiceOffline(status, contentType) {
  if (GATEWAY_STATUS.includes(status)) return true
  return !String(contentType || '').includes('application/json')
}

async function readJson(res) {
  if (isServiceOffline(res.status, res.headers.get('Content-Type'))) {
    return {
      ok: false,
      code: 'SERVICE_OFFLINE',
      message: `本地服务没有响应（HTTP ${res.status}）`,
    }
  }

  let data
  try {
    data = await res.json()
  } catch {
    // 带了 JSON 头却解析不了，那是真的坏了
    return {
      ok: false,
      code: 'BAD_RESPONSE',
      message: `服务返回了无法解析的内容（${res.status}）`,
    }
  }
  if (data && typeof data === 'object' && 'ok' in data) return data
  return { ok: res.ok, ...data }
}
