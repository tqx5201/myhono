import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { sign, verify } from "hono/jwt";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { mergeLiveSourceList } from "./api/function";
// ==================== 配置 ====================
const JWT_SECRET = process.env.JWT_SECRET || "it-is-very-secret";
const COOKIE_NAME = "token";
const TOKEN_EXPIRES = 60 * 60 * 24 * 365; // 365天（秒）

const app = new Hono();
const kv = await Deno.openKv();
//const kv = {}

// ==================== 类型扩展 ====================
declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: { name: string; exp: number };
  }
}

// ==================== JWT 中间件 ====================
const customJwtAuth = async (c: Context, next: Next) => {
  try {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.html(`
<script>
alert('未登录，请先登录');
setTimeout(() => location.href = '/login.html', 100);
</script>`);
    }
    const payload = await verify(token, JWT_SECRET, "HS256");
    c.set("jwtPayload", payload as { name: string; exp: number });
    await next();
  } catch (e) {
    return c.json({ error: "登录已过期或 Token 无效" }, 401);
  }
};

// ========== 关键修正1：白名单同时放行 登录页面 + 登录接口 ==========
const whiteListPaths = ["/login.html", "/login"];
app.use("/*", async (c, next) => {
  const path = c.req.path;
  // 白名单直接放行
  if (whiteListPaths.includes(path)) {
    return next();
  }
  // 其余所有路由执行鉴权
  return customJwtAuth(c, next);
});

// ========== 关键修正2：静态资源中间件必须放在鉴权中间件之后 ==========
app.get("/", (c) => c.redirect("/index.html"));
app.use("/*", serveStatic({ root: "./public" }));

// ==================== 登录页路由（兼容直接访问 /login） ====================
app.get("/login", (c) => {
  return c.redirect("/login.html");
});

// ==================== 登录接口 ====================
app.post("/login", async (c) => {
  try {
    const body = await c.req.parseBody();
    const username = (body.username as string)?.trim();
    const password = body.password as string;

    if (!username || !password) {
      return c.html(
        '<p>用户名和密码不能为空 <a href="/login.html">返回</a></p>',
        400,
      );
    }

    if (username === "admin" && password === "123456") {
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          name: username,
          sub: username,
          iat: now,
          exp: now + TOKEN_EXPIRES,
        },
        JWT_SECRET,
        "HS256",
      );

      setCookie(c, COOKIE_NAME, token, {
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        maxAge: TOKEN_EXPIRES,
      });

      // 登录成功跳转控制台
      return c.redirect("/index.html");
    }

    return c.html('<p>账号或密码错误 <a href="/login.html">返回</a></p>', 401);
  } catch (err) {
    console.error("登录异常:", err);
    return c.html('<p>服务器内部错误 <a href="/login.html">返回</a></p>', 500);
  }
});

// ==================== 登出接口 ====================
app.get("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.redirect("/login.html");
});

app.get("/list_:type.txt", async (c) => {
  const type = c.req.param("type");
  const entry = await kv.get([type, "txt"]);
  return c.text(entry);
});

app.post("/api", async (c) => {
  try {
    const action = c.req.query("action");
    const body = await c.req.parseBody();
    const yys = body.yys;

    if (!action || !yys) return c.json({ code: 400, msg: "参数缺失" }, 400);
    const prefix = [yys];

    switch (action) {
      case "save": {
        const oldName = body.old_name;
        const newName = body.new_name;
        const data = body.data;
        if (!newName)
          return c.json({ code: 400, msg: "new_name 不能为空" }, 400);

        let msg = "添加数据成功";
        if (oldName !== "null" && oldName && oldName !== newName) {
          await kv.delete([...prefix, oldName]);
          msg = "修改数据成功";
        }
        await kv.set([...prefix, newName], data);
        return c.json({ code: 200, msg });
      }
      case "categorys": {
        const list = [];
        for await (const entry of kv.list({ prefix }))
          list.push({ name: entry.key[1] });
        return c.json({ code: 200, msg: "获取成功", data: list });
      }
      case "merge_list": {
        const list = [];
        for await (const entry of kv.list({ prefix }))
          list.push(mergeLiveSourceList(entry.value[1]));
        await kv.set([...prefix, "txt"], list.join('\n'));

        return c.json({ code: 200, msg: "获取成功", data: list.join('\n') });
      }
      case "read": {
        const entry = await kv.get([...prefix, body.file]);
        return c.json({ code: 200, msg: "读取成功", data: entry.value });
      }
      case "del": {
        await kv.delete([...prefix, body.file]);
        return c.json({ code: 200, msg: "删除成功" });
      }
      default:
        return c.json({ code: 400, msg: `未知操作: ${action}` }, 400);
    }
  } catch (err) {
    console.error(err);
    return c.json({ code: 500, msg: "操作失败" }, 500);
  }
});

// ==================== 受保护页面 ====================
app.get("/auth/page", (c) => {
  const payload = c.get("jwtPayload");
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
`);
});

// ==================== 受保护 API（JSON） ====================
app.get("/auth/api/user", (c) => {
  const payload = c.get("jwtPayload");
  return c.json({
    msg: "已认证",
    username: payload.name,
    exp: payload.exp,
  });
});

// ==================== 全局错误处理 ====================
app.onError((err, c) => {
  console.error("全局错误:", err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: "Internal Server Error" }, 500);
});

// ==================== 启动 ====================
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 运行地址：http://localhost:${port}`);
});
