# wxbot-bind

一个独立的前端微信绑定工具：

- `frontend/`：Vue 页面，负责发起绑定、展示二维码、长轮询状态、输出最终绑定串
- 前端统一请求相对路径 `/wxbot-api`
- 开发阶段由 Vite 反代到微信接口
- 生产阶段让后端同学在网关或 Nginx 上配置同样的 `/wxbot-api -> https://ilinkai.weixin.qq.com` 反代

## 开发

```bash
npm install
npm run dev
```

默认前端端口：`5173`

开发时的代理目标默认是：

```text
https://ilinkai.weixin.qq.com
```

也可以通过环境变量覆盖：

```bash
WXBOT_BIND_PROXY_TARGET=https://ilinkai.weixin.qq.com npm run dev
```

## 结果格式

绑定成功后，页面展示并可复制：

```text
botid|token|savedAt|baseUrl|userId
```

其中 `botid` 使用规范化后的账号 id，例如：

```text
0fbf13d7a361-im-bot
```

## 环境变量

- `WXBOT_BIND_PROXY_TARGET`：Vite 开发代理目标，默认 `https://ilinkai.weixin.qq.com`
- `VITE_WXBOT_BIND_API_PREFIX`：前端请求前缀，默认 `/wxbot-api`
- `VITE_WXBOT_BIND_BASE_URL`：最终写入绑定串的 `baseUrl`，默认 `https://ilinkai.weixin.qq.com`
- `VITE_WXBOT_BIND_BOT_TYPE`：默认 `bot_type`，默认 `3`
- `VITE_WXBOT_BIND_ROUTE_TAG`：可选，透传为 `SKRouteTag`
