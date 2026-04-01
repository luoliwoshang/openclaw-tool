import { randomUUID } from "node:crypto";

import { normalizeAccountId } from "openclaw/plugin-sdk/routing";

import { getSession, saveSession } from "./session-store.js";
import type {
  BindSession,
  BindStatusResponse,
  CompletedBindResponse,
  PendingBindResponse,
  QrCodeResponse,
  StartBindResponse,
  StatusResponse,
} from "./types.js";

const QR_LONG_POLL_TIMEOUT_MS = 35_000;
const MAX_QR_REFRESH_COUNT = 3;

function resolveBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
}

function buildHeaders(routeTag?: string, includeClientVersion = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeClientVersion) {
    headers["iLink-App-ClientVersion"] = "1";
  }
  if (routeTag?.trim()) {
    headers.SKRouteTag = routeTag.trim();
  }
  return headers;
}

async function fetchQRCode(
  apiBaseUrl: string,
  botType: string,
  routeTag?: string,
): Promise<QrCodeResponse> {
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
    resolveBaseUrl(apiBaseUrl),
  );
  const response = await fetch(url.toString(), {
    headers: buildHeaders(routeTag, false),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`get_bot_qrcode failed: ${response.status} ${response.statusText} ${body}`);
  }
  return (await response.json()) as QrCodeResponse;
}

async function pollQRStatus(
  apiBaseUrl: string,
  qrcode: string,
  routeTag?: string,
): Promise<StatusResponse> {
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    resolveBaseUrl(apiBaseUrl),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: buildHeaders(routeTag, true),
      signal: controller.signal,
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`get_qrcode_status failed: ${response.status} ${response.statusText} ${rawText}`);
    }
    return JSON.parse(rawText) as StatusResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "wait" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildPendingResponse(
  session: BindSession,
  message: string,
  refreshed = false,
): PendingBindResponse {
  return {
    connected: false,
    sessionKey: session.sessionKey,
    status: session.status,
    qrcodeUrl: session.qrcodeUrl,
    message,
    ...(refreshed ? { refreshed: true } : {}),
  };
}

function buildCompletedResponse(
  session: BindSession,
  message = "微信绑定成功。",
): CompletedBindResponse {
  if (!session.result) {
    throw new Error("Missing bind result for confirmed session.");
  }
  return {
    connected: true,
    sessionKey: session.sessionKey,
    status: "confirmed",
    message,
    ...session.result,
  };
}

export async function startBindSession(params: {
  baseUrl: string;
  botType: string;
  routeTag?: string;
}): Promise<StartBindResponse> {
  const qrResponse = await fetchQRCode(params.baseUrl, params.botType, params.routeTag);
  const sessionKey = randomUUID();
  const session: BindSession = {
    sessionKey,
    qrcode: qrResponse.qrcode,
    qrcodeUrl: qrResponse.qrcode_img_content,
    baseUrl: params.baseUrl,
    botType: params.botType,
    routeTag: params.routeTag?.trim() || undefined,
    status: "wait",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    refreshCount: 0,
    lastMessage: "二维码已生成，请使用微信扫码。",
  };
  saveSession(session);
  return {
    sessionKey,
    qrcode: session.qrcode,
    qrcodeUrl: session.qrcodeUrl,
    status: "wait",
    message: session.lastMessage ?? "二维码已生成，请使用微信扫码。",
  };
}

export async function getBindStatus(sessionKey: string): Promise<BindStatusResponse> {
  const session = getSession(sessionKey);
  if (!session) {
    throw new Error("Bind session not found or expired.");
  }

  if (session.result) {
    return buildCompletedResponse(session);
  }

  const statusResponse = await pollQRStatus(session.baseUrl, session.qrcode, session.routeTag);
  session.updatedAt = Date.now();
  session.status = statusResponse.status;

  switch (statusResponse.status) {
    case "wait":
      session.lastMessage = "等待扫码或确认...";
      saveSession(session);
      return buildPendingResponse(session, session.lastMessage);
    case "scaned":
      session.lastMessage = "已扫码，请在微信里确认绑定。";
      saveSession(session);
      return buildPendingResponse(session, session.lastMessage);
    case "expired": {
      if (session.refreshCount + 1 > MAX_QR_REFRESH_COUNT) {
        session.lastMessage = "二维码多次过期，请重新开始绑定。";
        saveSession(session);
        return buildPendingResponse(session, session.lastMessage);
      }

      const qrResponse = await fetchQRCode(session.baseUrl, session.botType, session.routeTag);
      session.qrcode = qrResponse.qrcode;
      session.qrcodeUrl = qrResponse.qrcode_img_content;
      session.refreshCount += 1;
      session.status = "wait";
      session.lastMessage = "二维码已刷新，请重新扫码。";
      saveSession(session);
      return buildPendingResponse(session, session.lastMessage, true);
    }
    case "confirmed": {
      const rawAccountId = statusResponse.ilink_bot_id?.trim();
      const token = statusResponse.bot_token?.trim();
      if (!rawAccountId || !token) {
        throw new Error("二维码已确认，但后端没有返回完整的 bot 身份信息。");
      }

      const normalizedId = normalizeAccountId(rawAccountId);
      const savedAt = new Date().toISOString();
      session.result = {
        accountId: rawAccountId,
        normalizedId,
        fileName: `${normalizedId}.json`,
        token,
        savedAt,
        baseUrl: statusResponse.baseurl?.trim() || session.baseUrl,
        userId: statusResponse.ilink_user_id?.trim() || undefined,
      };
      session.lastMessage = "微信绑定成功。";
      saveSession(session);
      return buildCompletedResponse(session, session.lastMessage);
    }
  }
}
