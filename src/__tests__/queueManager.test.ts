import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processNextInQueue, isBusy } from '../services/queueManager.js';
import * as dataStore from '../services/dataStore.js';
import * as executionService from '../services/executionService.js';
import { getActiveExecution } from '../services/claudeService.js';

vi.mock('../services/dataStore.js');
vi.mock('../services/executionService.js');
vi.mock('../services/claudeService.js');

describe('queueManager', () => {
  const threadId = 'thread-1';
  const parentId = 'channel-1';
  const mockChannel = {
    send: vi.fn().mockResolvedValue({})
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isBusy', () => {
    it('should return true if active execution is not completed', () => {
      vi.mocked(getActiveExecution).mockReturnValue({
        completed: false,
        accumulatedText: '',
      } as any);
      expect(isBusy(threadId)).toBe(true);
    });

    it('should return false if active execution is completed', () => {
      vi.mocked(getActiveExecution).mockReturnValue({
        completed: true,
        accumulatedText: 'done',
      } as any);
      expect(isBusy(threadId)).toBe(false);
    });

    it('should return false if no active execution', () => {
      vi.mocked(getActiveExecution).mockReturnValue(undefined);
      expect(isBusy(threadId)).toBe(false);
    });
  });

  describe('processNextInQueue', () => {
    it('should do nothing if queue is paused', async () => {
      vi.mocked(dataStore.getQueueSettings).mockReturnValue({
        paused: true,
        continueOnFailure: false,
        freshContext: true
      });

      await processNextInQueue(mockChannel as any, threadId, parentId);

      expect(dataStore.popFromQueue).not.toHaveBeenCalled();
    });

    it('should pop and run next prompt if not paused', async () => {
      vi.mocked(dataStore.getQueueSettings).mockReturnValue({
        paused: false,
        continueOnFailure: false,
        freshContext: true
      });
      vi.mocked(dataStore.popFromQueue).mockReturnValue({
        prompt: 'test prompt',
        userId: 'user-1',
        timestamp: Date.now()
      });

      await processNextInQueue(mockChannel as any, threadId, parentId);

      expect(dataStore.popFromQueue).toHaveBeenCalledWith(threadId);
      expect(executionService.runPrompt).toHaveBeenCalledWith(
        mockChannel,
        threadId,
        'test prompt',
        parentId
      );
    });

    it('should do nothing if queue is empty', async () => {
      vi.mocked(dataStore.getQueueSettings).mockReturnValue({
        paused: false,
        continueOnFailure: false,
        freshContext: true
      });
      vi.mocked(dataStore.popFromQueue).mockReturnValue(undefined);

      await processNextInQueue(mockChannel as any, threadId, parentId);

      expect(executionService.runPrompt).not.toHaveBeenCalled();
    });
  });
});
