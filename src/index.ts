import { serve } from '@hono/node-server'
import { Hono, type Context, type Next } from 'hono'
import { sign, verify } from 'hono/jwt'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'

// ==================== 配置 ====================
const JWT_SECRET = process.env.JWT_SECRET || 'it-is-very-secret'
const COOKIE_NAME = 'token'
const TOKEN_EXPIRES = 60 * 60 * 24 * 365 // 365天（秒）

const app = new Hono()

// ==================== 类型扩展 ====================
declare module 'hono' {
  interface ContextVariableMap {
    jwtPayload: { name: string; exp: number }
  }
}

// ==================== JWT 中间件 ====================
// 注意：hono 的 jwt() 不支持 getToken 选项，我们用自定义中间件实现
const customJwtAuth = async (c: Context, next: Next) => {
  try {
    const token = getCookie(c, COOKIE_NAME)
    if (!token) {
      return c.json({ error: '未登录，请先登录' }, 401)
    }
    const payload = await verify(token, JWT_SECRET, 'HS256')
    c.set('jwtPayload', payload as { name: string; exp: number })
    await next()
  } catch (e) {
    return c.json({ error: '登录已过期或 Token 无效' }, 401)
  }
}

app.use('/auth/*', customJwtAuth)

// ==================== 登录页 ====================
app.get('/login', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>系统登录</title>
<style>
  * { box-sizing: border-box; }
  body {
    display: flex; justify-content: center; align-items: center;
    height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .login-box {
    width: 360px; padding: 40px; background: #fff;
    border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  h3 { margin: 0 0 24px; text-align: center; color: #333; font-size: 24px; }
  .field { margin-bottom: 16px; }
  label { display: block; margin-bottom: 6px; color: #555; font-size: 14px; }
  input {
    width: 100%; padding: 10px 12px; border: 1px solid #ddd;
    border-radius: 6px; font-size: 14px; transition: border-color 0.2s;
  }
  input:focus { outline: none; border-color: #667eea; }
  button {
    width: 100%; padding: 12px; margin-top: 8px;
    background: #667eea; color: #fff; border: none;
    border-radius: 6px; font-size: 16px; cursor: pointer;
    transition: background 0.2s;
  }
  button:hover { background: #5a67d8; }
  .error { color: #e53e3e; font-size: 13px; margin-top: 8px; text-align: center; }
</style>
</head>
<body>
  <div class="login-box">
    <h3>系统登录</h3>
    <form action="/login" method="POST">
      <div class="field">
        <label>用户名</label>
        <input name="username" placeholder="admin" required autofocus>
      </div>
      <div class="field">
        <label>密码</label>
        <input name="password" type="password" placeholder="••••••" required>
      </div>
      <button type="submit">登 录</button>
    </form>
  </div>
</body>
</html>
`)
})

// ==================== 登录接口 ====================
app.post('/login', async (c) => {
  try {
    const body = await c.req.parseBody()
    const username = (body.username as string)?.trim()
    const password = body.password as string

    if (!username || !password) {
      return c.html('<p>用户名和密码不能为空 <a href="/">返回</a></p>', 400)
    }

    if (username === 'admin' && password === '123456') {
      const now = Math.floor(Date.now() / 1000)
      const token = await sign(
        {
          name: username,
          sub: username,
          iat: now,
          exp: now + TOKEN_EXPIRES,
        },
        JWT_SECRET,
        'HS256'
      )

      setCookie(c, COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        maxAge: TOKEN_EXPIRES,
      })

      return c.redirect('/auth/page')
    }

    return c.html('<p>账号或密码错误 <a href="/">返回</a></p>', 401)
  } catch (err) {
    console.error('登录异常:', err)
    return c.html('<p>服务器内部错误 <a href="/">返回</a></p>', 500)
  }
})

// ==================== 登出接口 ====================
app.get('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.redirect('/login')
})

// ==================== 受保护页面 ====================
app.get('/auth/page', (c) => {
  const payload = c.get('jwtPayload')
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>控制台</title>
<style>
  body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
  .card { background: #f7fafc; padding: 24px; border-radius: 8px; }
  h2 { margin-top: 0; color: #2d3748; }
  .info { color: #4a5568; line-height: 1.8; }
  a { color: #667eea; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <h2>🎉 登录成功</h2>
    <div class="info">
      <p><strong>用户名：</strong>${payload.name}</p>
      <p><strong>Token 过期时间：</strong>${new Date(payload.exp * 1000).toLocaleString()}</p>
      <p><a href="/logout">退出登录</a></p>
    </div>
  </div>
</body>
</html>
`)
})

// ==================== 受保护 API（JSON） ====================
app.get('/auth/api/user', (c) => {
  const payload = c.get('jwtPayload')
  return c.json({
    msg: '已认证',
    username: payload.name,
    exp: payload.exp,
  })
})

// ==================== 全局错误处理 ====================
app.onError((err, c) => {
  console.error('全局错误:', err)
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  return c.json({ error: 'Internal Server Error' }, 500)
})

// ==================== 启动 ====================
const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 运行地址：http://localhost:${port}`)
})
