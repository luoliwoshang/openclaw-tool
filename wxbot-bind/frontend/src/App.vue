<script setup lang="ts">
import { computed, ref } from "vue";
import QRCode from "qrcode";

type QrCodeResponse = {
  qrcode: string;
  qrcode_img_content: string;
  ret?: number;
  errmsg?: string;
};

type StatusResponse = {
  status: "wait" | "scaned" | "confirmed" | "expired";
  ret?: number;
  errcode?: number;
  errmsg?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
};

type BindResult = {
  normalizedId: string;
  token: string;
  savedAt: string;
  baseUrl: string;
  userId?: string;
};

const API_PREFIX = import.meta.env.VITE_WXBOT_BIND_API_PREFIX || "/wxbot-api";
const UPSTREAM_BASE_URL =
  import.meta.env.VITE_WXBOT_BIND_BASE_URL || "https://ilinkai.weixin.qq.com";
const DEFAULT_BOT_TYPE = import.meta.env.VITE_WXBOT_BIND_BOT_TYPE || "3";
const ROUTE_TAG = (import.meta.env.VITE_WXBOT_BIND_ROUTE_TAG || "").trim();
const QR_LONG_POLL_TIMEOUT_MS = 35_000;
const MAX_QR_REFRESH_COUNT = 3;

const status = ref<"idle" | "starting" | "waiting" | "scaned" | "confirmed" | "error">("idle");
const qrcode = ref("");
const qrcodeUrl = ref("");
const qrcodeDataUrl = ref("");
const bindResult = ref<BindResult | null>(null);
const revealPayload = ref(false);
const refreshCount = ref(0);
const statusMessage = ref("点击按钮后，会通过代理路径请求微信二维码并等待扫码确认。");
const errorMessage = ref("");
const eventLines = ref<string[]>([]);
const pollNonce = ref(0);

function pushEvent(text: string): void {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  eventLines.value = [`${stamp} ${text}`, ...eventLines.value].slice(0, 8);
}

function normalizeAccountId(accountId: string | null | undefined): string {
  const trimmed = accountId?.trim();
  if (!trimmed) {
    return "default";
  }
  return trimmed.replace(/[^a-z0-9._-]+/gi, "_");
}

function buildHeaders(includeClientVersion = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeClientVersion) {
    headers["iLink-App-ClientVersion"] = "1";
  }
  if (ROUTE_TAG) {
    headers.SKRouteTag = ROUTE_TAG;
  }
  return headers;
}

function buildApiUrl(path: string): string {
  return `${API_PREFIX}${path}`;
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

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${rawText}`);
  }
  return JSON.parse(rawText) as T;
}

async function fetchQRCode(): Promise<QrCodeResponse> {
  const response = await fetch(
    buildApiUrl(`/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_BOT_TYPE)}`),
    {
      headers: buildHeaders(false),
    },
  );
  return await parseJsonResponse<QrCodeResponse>(response);
}

async function pollQRStatus(): Promise<StatusResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(
      buildApiUrl(`/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode.value)}`),
      {
        headers: buildHeaders(true),
        signal: controller.signal,
      },
    );
    return await parseJsonResponse<StatusResponse>(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "wait" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildResult(statusResponse: StatusResponse): BindResult {
  const rawAccountId = statusResponse.ilink_bot_id?.trim();
  const token = statusResponse.bot_token?.trim();
  if (!rawAccountId || !token) {
    throw new Error("二维码已确认，但后端没有返回完整的 bot 身份信息。");
  }

  return {
    normalizedId: normalizeAccountId(rawAccountId),
    token,
    savedAt: new Date().toISOString(),
    baseUrl: statusResponse.baseurl?.trim() || UPSTREAM_BASE_URL,
    ...(statusResponse.ilink_user_id?.trim()
      ? { userId: statusResponse.ilink_user_id.trim() }
      : {}),
  };
}

async function startBinding(): Promise<void> {
  pollNonce.value += 1;
  const currentNonce = pollNonce.value;

  status.value = "starting";
  bindResult.value = null;
  revealPayload.value = false;
  refreshCount.value = 0;
  qrcode.value = "";
  qrcodeUrl.value = "";
  qrcodeDataUrl.value = "";
  errorMessage.value = "";
  eventLines.value = [];
  statusMessage.value = "正在申请二维码...";
  pushEvent("开始请求二维码。");

  try {
    const qrResponse = await fetchQRCode();
    if (pollNonce.value !== currentNonce) {
      return;
    }

    qrcode.value = qrResponse.qrcode;
    qrcodeUrl.value = qrResponse.qrcode_img_content;
    await renderQr(qrResponse.qrcode_img_content);
    status.value = "waiting";
    statusMessage.value = "二维码已生成，请使用微信扫码。";
    pushEvent("二维码已生成，等待扫码。");
    void pollBindStatus(currentNonce);
  } catch (error) {
    status.value = "error";
    errorMessage.value = error instanceof Error ? error.message : String(error);
    statusMessage.value = "二维码请求失败。";
  }
}

async function pollBindStatus(currentNonce: number): Promise<void> {
  while (pollNonce.value === currentNonce && qrcode.value) {
    try {
      const response = await pollQRStatus();
      if (pollNonce.value !== currentNonce) {
        return;
      }

      switch (response.status) {
        case "wait":
          status.value = "waiting";
          statusMessage.value = "等待扫码或确认...";
          pushEvent("等待扫码或确认...");
          break;
        case "scaned":
          status.value = "scaned";
          statusMessage.value = "已扫码，请在微信里确认绑定。";
          pushEvent("已扫码，等待微信里确认。");
          break;
        case "expired":
          if (refreshCount.value + 1 > MAX_QR_REFRESH_COUNT) {
            status.value = "error";
            statusMessage.value = "二维码多次过期，请重新开始绑定。";
            errorMessage.value = "二维码已过期且超过自动刷新次数。";
            return;
          }
          refreshCount.value += 1;
          pushEvent("二维码已过期，正在自动刷新。");
          {
            const qrResponse = await fetchQRCode();
            if (pollNonce.value !== currentNonce) {
              return;
            }
            qrcode.value = qrResponse.qrcode;
            qrcodeUrl.value = qrResponse.qrcode_img_content;
            await renderQr(qrResponse.qrcode_img_content);
            status.value = "waiting";
            statusMessage.value = "二维码已刷新，请重新扫码。";
          }
          break;
        case "confirmed":
          bindResult.value = buildResult(response);
          status.value = "confirmed";
          statusMessage.value = "微信确认完成，已拿到绑定串。";
          pushEvent("微信确认完成，已拿到绑定串。");
          return;
      }
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
  await navigator.clipboard.writeText(payloadLine.value);
  pushEvent("绑定串已复制到剪贴板。");
}

function maskMiddle(value: string, visibleLeft = 8, visibleRight = 8): string {
  if (!value) {
    return "";
  }
  if (value.length <= visibleLeft + visibleRight + 3) {
    return value;
  }
  return `${value.slice(0, visibleLeft)}***${value.slice(-visibleRight)}`;
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

const payloadLine = computed(() => {
  if (!bindResult.value) {
    return "";
  }
  return [
    bindResult.value.normalizedId,
    bindResult.value.token,
    bindResult.value.savedAt,
    bindResult.value.baseUrl,
    bindResult.value.userId || "",
  ].join("|");
});

const displayPayloadLine = computed(() => {
  if (!bindResult.value) {
    return "";
  }
  if (revealPayload.value) {
    return payloadLine.value;
  }
  return [
    bindResult.value.normalizedId,
    maskMiddle(bindResult.value.token, 14, 12),
    bindResult.value.savedAt,
    bindResult.value.baseUrl,
    maskMiddle(bindResult.value.userId || "", 8, 12),
  ].join("|");
});
</script>

<template>
  <main class="page-shell">
    <section class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">wxbot-bind</p>
        <h1>微信二维码绑定控制台</h1>
        <p class="summary">
          前端直接请求固定代理前缀 <code>/wxbot-api</code>。开发阶段由 Vite 反代到微信接口，
          生产部署时让后端同学在网关或 Nginx 上配置相同的反代路径即可。
        </p>
      </div>
      <button class="primary-button" :disabled="status === 'starting'" @click="startBinding">
        {{ status === "starting" ? "正在生成二维码..." : "我要绑定微信" }}
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
          <strong>绑定串</strong>
        </header>
        <div v-if="bindResult" class="result-card">
          <p class="payload-hint">
            格式：<code>botid|token|savedAt|baseUrl|userId</code>
          </p>
          <div class="payload-line-box">
            <code>{{ displayPayloadLine }}</code>
          </div>

          <div class="actions">
            <button class="secondary-button" @click="revealPayload = !revealPayload">
              {{ revealPayload ? "隐藏" : "显示完整串" }}
            </button>
            <button class="secondary-button" @click="copyPayload">复制</button>
          </div>
        </div>
        <div v-else class="empty-state">
          绑定成功后，这里会显示单行绑定串，直接可复制用于后续写入账号文件。
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
