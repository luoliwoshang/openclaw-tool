# wxbot-bind

一个独立的微信绑定工具：

- `frontend/`：Vue 页面，负责发起绑定、展示二维码、轮询状态、展示结果 JSON
- `backend/`：Node 服务，负责调用微信二维码接口、长轮询登录状态、输出标准化账号结果

## 开发

```bash
npm install
npm run dev
```

默认端口：

- 前端：`5173`
- 后端：`8787`

## 结果字段

绑定成功后，后端会返回这些字段：

- `accountId`
- `normalizedId`
- `fileName`
- `token`
- `savedAt`
- `baseUrl`
- `userId`

## 环境变量

- `PORT`：后端监听端口，默认 `8787`
- `FRONTEND_ORIGIN`：允许跨域的前端地址，默认开发阶段全开放
- `WXBOT_BIND_DEFAULT_BASE_URL`：默认微信后端地址，默认 `https://ilinkai.weixin.qq.com`
- `WXBOT_BIND_DEFAULT_BOT_TYPE`：默认 `bot_type`，默认 `3`
- `WXBOT_BIND_ROUTE_TAG`：可选，透传为 `SKRouteTag`

