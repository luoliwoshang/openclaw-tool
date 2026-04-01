export type QrStatus = "wait" | "scaned" | "confirmed" | "expired";

export type StartBindRequest = {
  baseUrl?: string;
  botType?: string;
  routeTag?: string;
};

export type QrCodeResponse = {
  qrcode: string;
  qrcode_img_content: string;
};

export type StatusResponse = {
  ret?: number;
  status: QrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
};

export type BindResult = {
  accountId: string;
  normalizedId: string;
  fileName: string;
  token: string;
  savedAt: string;
  baseUrl: string;
  userId?: string;
};

export type BindSession = {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  baseUrl: string;
  botType: string;
  routeTag?: string;
  status: QrStatus;
  createdAt: number;
  updatedAt: number;
  refreshCount: number;
  lastMessage?: string;
  result?: BindResult;
};

export type StartBindResponse = {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  status: "wait";
  message: string;
};

export type PendingBindResponse = {
  connected: false;
  sessionKey: string;
  status: QrStatus;
  qrcodeUrl: string;
  message: string;
  refreshed?: boolean;
};

export type CompletedBindResponse = BindResult & {
  connected: true;
  sessionKey: string;
  status: "confirmed";
  message: string;
};

export type BindStatusResponse = PendingBindResponse | CompletedBindResponse;

