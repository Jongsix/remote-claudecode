import type { SSEClient } from './sseClient.js';
import * as dataStore from './dataStore.js';

const threadSseClients = new Map<string, SSEClient>();

export async function createSession(port: number): Promise<string> {
  const url = `http://localhost:${port}/session`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.id) {
    throw new Error('Invalid session response: missing id');
  }

  return data.id;
}

export async function sendPrompt(port: number, sessionId: string, text: string): Promise<void> {
  const url = `http://localhost:${port}/session/${sessionId}/prompt_async`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send prompt: ${response.status} ${response.statusText}`);
  }
}

export async function validateSession(port: number, sessionId: string): Promise<boolean> {
  try {
    const url = `http://localhost:${port}/session/${sessionId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listSessions(port: number): Promise<string[]> {
  try {
    const url = `http://localhost:${port}/session`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    if (Array.isArray(data)) {
      return data.map((s: { id: string }) => s.id);
    }
    return [];
  } catch {
    return [];
  }
}

export async function abortSession(port: number, sessionId: string): Promise<boolean> {
  try {
    const url = `http://localhost:${port}/session/${sessionId}/abort`;
    const response = await fetch(url, {
      method: 'POST',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getSessionForThread(threadId: string): { sessionId: string; projectPath: string; port: number } | undefined {
  const session = dataStore.getThreadSession(threadId);
  if (!session) return undefined;
  return { sessionId: session.sessionId, projectPath: session.projectPath, port: session.port };
}

export function setSessionForThread(threadId: string, sessionId: string, projectPath: string, port: number): void {
  const now = Date.now();
  dataStore.setThreadSession({
    threadId,
    sessionId,
    projectPath,
    port,
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

export function setSseClient(threadId: string, client: SSEClient): void {
  threadSseClients.set(threadId, client);
}

export function getSseClient(threadId: string): SSEClient | undefined {
  return threadSseClients.get(threadId);
}

export function clearSseClient(threadId: string): void {
  threadSseClients.delete(threadId);
}
