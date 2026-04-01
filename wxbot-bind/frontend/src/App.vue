<script setup lang="ts">
import { computed, ref } from "vue";
import QRCode from "qrcode";

type StartBindResponse = {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  status: "wait";
  message: string;
};

type BindResult = {
  accountId: string;
  normalizedId: string;
  fileName: string;
  token: string;
  savedAt: string;
  baseUrl: string;
  userId?: string;
};

type BindStatusResponse =
  | ({
      connected: false;
      sessionKey: string;
      status: "wait" | "scaned" | "expired";
      qrcodeUrl: string;
      message: string;
      refreshed?: boolean;
    })
  | ({
      connected: true;
      sessionKey: string;
      status: "confirmed";
      message: string;
    } & BindResult);

const status = ref<"idle" | "starting" | "waiting" | "scaned" | "confirmed" | "error">("idle");
const sessionKey = ref("");
const qrcodeUrl = ref("");
const qrcodeDataUrl = ref("");
const statusMessage = ref("点击按钮后，会向微信后端申请二维码并等待扫码确认。");
const bindResult = ref<BindResult | null>(null);
const errorMessage = ref("");
const eventLines = ref<string[]>([]);
const pollNonce = ref(0);

function pushEvent(text: string): void {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  eventLines.value = [`${stamp} ${text}`, ...eventLines.value].slice(0, 8);
}

async function renderQr(url: string): Promise<void> {
  qrcodeDataUrl.value = await QRCode.toDataURL(url, {
    width: 320,
    margin: 1,
    color: {
      dark: "#092414",
      light: "#fffef9",
    },
  });
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function startBinding(): Promise<void> {
  pollNonce.value += 1;
  const currentNonce = pollNonce.value;

  status.value = "starting";
  errorMessage.value = "";
  bindResult.value = null;
  qrcodeDataUrl.value = "";
  qrcodeUrl.value = "";
  sessionKey.value = "";
  eventLines.value = [];
  statusMessage.value = "正在申请二维码...";
  pushEvent("开始请求二维码。");

  try {
    const response = await requestJson<StartBindResponse>("/api/bind/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (pollNonce.value !== currentNonce) {
      return;
    }

    sessionKey.value = response.sessionKey;
    qrcodeUrl.value = response.qrcodeUrl;
    statusMessage.value = response.message;
    await renderQr(response.qrcodeUrl);
    status.value = "waiting";
    pushEvent("二维码已生成，等待扫码。");
    void pollBindStatus(currentNonce);
  } catch (error) {
    status.value = "error";
    errorMessage.value = error instanceof Error ? error.message : String(error);
    statusMessage.value = "绑定初始化失败。";
  }
}

async function pollBindStatus(currentNonce: number): Promise<void> {
  while (pollNonce.value === currentNonce && sessionKey.value) {
    try {
      const response = await requestJson<BindStatusResponse>(
        `/api/bind/status?sessionKey=${encodeURIComponent(sessionKey.value)}`,
      );

      if (pollNonce.value !== currentNonce) {
        return;
      }

      statusMessage.value = response.message;

      if (response.connected) {
        bindResult.value = {
          accountId: response.accountId,
          normalizedId: response.normalizedId,
          fileName: response.fileName,
          token: response.token,
          savedAt: response.savedAt,
          baseUrl: response.baseUrl,
          ...(response.userId ? { userId: response.userId } : {}),
        };
        status.value = "confirmed";
        pushEvent("微信确认完成，已拿到绑定结果。");
        return;
      }

      if (response.qrcodeUrl && response.qrcodeUrl !== qrcodeUrl.value) {
        qrcodeUrl.value = response.qrcodeUrl;
        await renderQr(response.qrcodeUrl);
        pushEvent(response.refreshed ? "二维码已刷新，请重新扫码。" : "二维码地址已更新。");
      }

      status.value = response.status === "scaned" ? "scaned" : "waiting";
      pushEvent(
        response.status === "scaned" ? "已扫码，等待微信里确认。" : response.message,
      );
    } catch (error) {
      status.value = "error";
      errorMessage.value = error instanceof Error ? error.message : String(error);
      statusMessage.value = "长轮询状态查询失败。";
      return;
    }
  }
}

async function copyPayload(): Promise<void> {
  if (!bindResult.value) {
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(bindResult.value, null, 2));
  pushEvent("绑定结果 JSON 已复制到剪贴板。");
}

const stateLabel = computed(() => {
  switch (status.value) {
    case "starting":
      return "正在申请二维码";
    case "waiting":
      return "等待扫码";
    case "scaned":
      return "等待确认";
    case "confirmed":
      return "绑定成功";
    case "error":
      return "请求失败";
    default:
      return "准备开始";
  }
});
</script>

<template>
  <main class="page-shell">
    <section class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">wxbot-bind</p>
        <h1>微信二维码绑定控制台</h1>
        <p class="summary">
          点击按钮后，后端会调用和 OpenClaw 微信插件一致的二维码接口与长轮询状态接口。
          扫码确认成功后，页面会直接展示你需要落盘的账号 JSON。
        </p>
      </div>
      <button class="primary-button" :disabled="status === 'starting'" @click="startBinding">
        {{ status === 'starting' ? '正在生成二维码...' : '我要绑定微信' }}
      </button>
    </section>

    <section class="grid-layout">
      <article class="panel qr-panel">
        <header class="panel-head">
          <span class="panel-tag">二维码</span>
          <strong>{{ stateLabel }}</strong>
        </header>
        <div class="qr-frame">
          <img v-if="qrcodeDataUrl" :src="qrcodeDataUrl" alt="微信绑定二维码" />
          <div v-else class="qr-placeholder">点击按钮后在这里生成二维码</div>
        </div>
        <p class="status-line">{{ statusMessage }}</p>
        <a v-if="qrcodeUrl" class="scan-link" :href="qrcodeUrl" target="_blank" rel="noreferrer">
          浏览器打开扫码链接
        </a>
        <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
      </article>

      <article class="panel">
        <header class="panel-head">
          <span class="panel-tag">结果</span>
          <strong>绑定账号 JSON</strong>
        </header>
        <div v-if="bindResult" class="result-card">
          <div class="field-row">
            <span>normalizedId</span>
            <code>{{ bindResult.normalizedId }}</code>
          </div>
          <div class="field-row">
            <span>fileName</span>
            <code>{{ bindResult.fileName }}</code>
          </div>
          <div class="field-row">
            <span>savedAt</span>
            <code>{{ bindResult.savedAt }}</code>
          </div>
          <div class="field-row">
            <span>baseUrl</span>
            <code>{{ bindResult.baseUrl }}</code>
          </div>
          <div class="field-row">
            <span>userId</span>
            <code>{{ bindResult.userId || "(empty)" }}</code>
          </div>
          <div class="field-row token-row">
            <span>token</span>
            <code>{{ bindResult.token }}</code>
          </div>

          <div class="actions">
            <button class="secondary-button" @click="copyPayload">复制 JSON</button>
          </div>

          <pre class="payload-box">{{ JSON.stringify(bindResult, null, 2) }}</pre>
        </div>
        <div v-else class="empty-state">
          绑定成功后，这里会显示 `token`、`savedAt`、`baseUrl`、`userId` 和规范化后的账号 id。
        </div>
      </article>
    </section>

    <section class="panel event-panel">
      <header class="panel-head">
        <span class="panel-tag">事件</span>
        <strong>最近状态</strong>
      </header>
      <ul class="event-list">
        <li v-for="line in eventLines" :key="line">{{ line }}</li>
        <li v-if="eventLines.length === 0" class="event-placeholder">还没有事件。</li>
      </ul>
    </section>
  </main>
</template>
