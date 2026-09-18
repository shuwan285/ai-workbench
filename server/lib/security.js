// 只绑 127.0.0.1 挡不住浏览器里的其他网页 —— 它们同样能请求 localhost。
// 这一层是防止恶意页面调用启动接口的关键。

export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export function guard(req, res, next) {
  const origin = req.get('Origin')

  // 跨站请求一定会带 Origin，带了对不上就直接拒。
  // 同源 GET 不带 Origin，放行。
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      ok: false,
      code: 'FORBIDDEN_ORIGIN',
      message: `来源 ${origin} 不被允许`,
    })
  }

  // 写操作额外要求自定义头。跨站表单发不出这个头，
  // 而带自定义头的请求会触发预检，预检又被上面的 CORS 策略挡掉。
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.get('X-AIWB') !== '1') {
      return res.status(403).json({
        ok: false,
        code: 'MISSING_HEADER',
        message: '缺少 X-AIWB 请求头',
      })
    }
  }

  next()
}
