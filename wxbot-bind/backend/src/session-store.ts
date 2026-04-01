import type { BindSession } from "./types.js";

const ACTIVE_SESSIONS = new Map<string, BindSession>();
const STALE_SESSION_MS = 30 * 60_000;

function isExpired(session: BindSession, now: number): boolean {
  return now - session.updatedAt > STALE_SESSION_MS;
}

export function pruneSessions(): void {
  const now = Date.now();
  for (const [sessionKey, session] of ACTIVE_SESSIONS.entries()) {
    if (isExpired(session, now)) {
      ACTIVE_SESSIONS.delete(sessionKey);
    }
  }
}

export function saveSession(session: BindSession): BindSession {
  pruneSessions();
  ACTIVE_SESSIONS.set(session.sessionKey, session);
  return session;
}

export function getSession(sessionKey: string): BindSession | undefined {
  pruneSessions();
  return ACTIVE_SESSIONS.get(sessionKey);
}

