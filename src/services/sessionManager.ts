import * as dataStore from './dataStore.js';
import { interruptExecution } from './claudeService.js';

// Session data is stored via dataStore thread sessions.
// The Claude Agent SDK handles session lifecycle internally.
// This module provides convenience wrappers for thread-session operations.

export function getSessionForThread(threadId: string): { sessionId: string; projectPath: string } | undefined {
  const session = dataStore.getThreadSession(threadId);
  if (!session) return undefined;
  return { sessionId: session.sessionId, projectPath: session.projectPath };
}

export function setSessionForThread(threadId: string, sessionId: string, projectPath: string): void {
  const now = Date.now();
  dataStore.setThreadSession({
    threadId,
    sessionId,
    projectPath,
    port: 0, // Legacy field, not used with SDK
    createdAt: now,
    lastUsedAt: now,
  });
}

export function updateSessionLastUsed(threadId: string): void {
  dataStore.updateThreadSessionLastUsed(threadId);
}

export function clearSessionForThread(threadId: string): void {
  dataStore.clearThreadSession(threadId);
}

/**
 * Abort a running Claude execution for the given thread.
 * Uses the SDK interrupt mechanism instead of HTTP abort.
 */
export async function abortSession(threadId: string): Promise<boolean> {
  return await interruptExecution(threadId);
}
