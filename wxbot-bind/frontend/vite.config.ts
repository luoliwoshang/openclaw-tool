import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/wxbot-api": {
        target: process.env.WXBOT_BIND_PROXY_TARGET || "https://ilinkai.weixin.qq.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wxbot-api/, ""),
      },
    },
  },
});
