import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/dataStore.js', () => ({
  getThreadSession: vi.fn(),
  setThreadSession: vi.fn(),
  updateThreadSessionLastUsed: vi.fn(),
  clearThreadSession: vi.fn(),
}));

vi.mock('../services/claudeService.js', () => ({
  interruptExecution: vi.fn(),
}));

import {
  getSessionForThread,
  setSessionForThread,
  clearSessionForThread,
  updateSessionLastUsed,
  abortSession,
} from '../services/sessionManager.js';
import * as dataStore from '../services/dataStore.js';
import { interruptExecution } from '../services/claudeService.js';

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessionForThread', () => {
    it('should return session data when thread session exists', () => {
      vi.mocked(dataStore.getThreadSession).mockReturnValue({
        threadId: 'thread1',
        sessionId: 'ses_123',
        projectPath: '/path/to/project',
        port: 0,
        createdAt: 1000,
        lastUsedAt: 2000,
      });

      const result = getSessionForThread('thread1');

      expect(result).toEqual({ sessionId: 'ses_123', projectPath: '/path/to/project' });
      expect(dataStore.getThreadSession).toHaveBeenCalledWith('thread1');
    });

    it('should return undefined for unknown thread', () => {
      vi.mocked(dataStore.getThreadSession).mockReturnValue(undefined);

      const result = getSessionForThread('unknown_thread');

      expect(result).toBeUndefined();
    });
  });

  describe('setSessionForThread', () => {
    it('should store session via dataStore', () => {
      const now = Date.now();

      setSessionForThread('thread1', 'ses_123', '/path/to/project');

      expect(dataStore.setThreadSession).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread1',
          sessionId: 'ses_123',
          projectPath: '/path/to/project',
          port: 0,
        })
      );
    });

    it('should set createdAt and lastUsedAt timestamps', () => {
      const before = Date.now();
      setSessionForThread('thread1', 'ses_123', '/path/to/project');
      const after = Date.now();

      const call = vi.mocked(dataStore.setThreadSession).mock.calls[0][0];
      expect(call.createdAt).toBeGreaterThanOrEqual(before);
      expect(call.createdAt).toBeLessThanOrEqual(after);
      expect(call.lastUsedAt).toBe(call.createdAt);
    });
  });

  describe('updateSessionLastUsed', () => {
    it('should delegate to dataStore', () => {
      updateSessionLastUsed('thread1');

      expect(dataStore.updateThreadSessionLastUsed).toHaveBeenCalledWith('thread1');
    });
  });

  describe('clearSessionForThread', () => {
    it('should delegate to dataStore', () => {
      clearSessionForThread('thread1');

      expect(dataStore.clearThreadSession).toHaveBeenCalledWith('thread1');
    });
  });

  describe('abortSession', () => {
    it('should delegate to interruptExecution and return true on success', async () => {
      vi.mocked(interruptExecution).mockResolvedValue(true);

      const result = await abortSession('thread1');

      expect(result).toBe(true);
      expect(interruptExecution).toHaveBeenCalledWith('thread1');
    });

    it('should return false when no active execution', async () => {
      vi.mocked(interruptExecution).mockResolvedValue(false);

      const result = await abortSession('thread1');

      expect(result).toBe(false);
    });
  });
});
