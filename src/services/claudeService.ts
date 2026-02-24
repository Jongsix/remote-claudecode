import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Callbacks for tracking execution lifecycle.
 */
interface ExecutionCallbacks {
  onSessionInit: (sessionId: string) => void;
  onComplete: (result: ExecutionResult) => void;
  onError: (error: Error) => void;
}

export interface ExecutionResult {
  text: string;
  cost?: number;
  duration?: number;
  numTurns?: number;
}

/**
 * Wraps a single Claude Agent SDK query execution.
 * Designed to be fire-and-forget with callback-based lifecycle events.
 * The accumulatedText property can be read at any time for periodic Discord updates.
 */
export class ClaudeExecution {
  public accumulatedText: string = '';
  public sessionId?: string;
  public completed: boolean = false;
  private queryInstance: ReturnType<typeof query> | null = null;

  /**
   * Start executing a prompt. Returns immediately; query runs in background.
   */
  start(
    cwd: string,
    prompt: string,
    options: { sessionId?: string; model?: string },
    callbacks: ExecutionCallbacks,
  ): void {
    const queryOptions: Record<string, unknown> = {
      cwd,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
    };

    if (options.model) {
      queryOptions.model = options.model;
    }

    if (options.sessionId) {
      queryOptions.resume = options.sessionId;
    }

    this.queryInstance = query({
      prompt,
      options: queryOptions as any,
    });

    // Fire-and-forget: run the async generator in the background
    this.consumeQuery(callbacks).catch((error) => {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  private async consumeQuery(callbacks: ExecutionCallbacks): Promise<void> {
    if (!this.queryInstance) return;

    try {
      for await (const message of this.queryInstance) {
        if (message.type === 'system' && (message as any).subtype === 'init') {
          this.sessionId = (message as any).session_id;
          callbacks.onSessionInit(this.sessionId!);
        } else if (message.type === 'stream_event') {
          this.handleStreamEvent((message as any).event);
        } else if (message.type === 'assistant') {
          this.handleAssistantMessage(message as any);
        } else if (message.type === 'result') {
          this.completed = true;
          this.handleResult(message as any, callbacks);
          return;
        }
      }

      // Generator ended without a result message
      if (!this.completed) {
        this.completed = true;
        callbacks.onComplete({
          text: this.accumulatedText || 'No output received.',
        });
      }
    } catch (error) {
      this.completed = true;
      throw error;
    }
  }

  /**
   * Handle real-time streaming events for progressive text display.
   */
  private handleStreamEvent(event: any): void {
    if (!event) return;

    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      this.accumulatedText += event.delta.text;
    }
  }

  /**
   * Handle complete assistant turn. Use as authoritative text source.
   */
  private handleAssistantMessage(message: any): void {
    const content = message?.message?.content;
    if (!Array.isArray(content)) return;

    const textBlocks = content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text);

    if (textBlocks.length > 0) {
      // The assistant message contains the complete text for this turn.
      // Stream deltas should have already accumulated the same text.
      // We use this as a correction point if deltas were missed.
      const turnText = textBlocks.join('\n');
      if (!this.accumulatedText.endsWith(turnText)) {
        // Deltas may have built partial text; ensure we have the full turn
        this.accumulatedText = turnText;
      }
    }
  }

  /**
   * Handle final result message with cost and usage info.
   */
  private handleResult(message: any, callbacks: ExecutionCallbacks): void {
    if (message.subtype === 'success') {
      callbacks.onComplete({
        text: message.result || this.accumulatedText,
        cost: message.total_cost_usd,
        duration: message.duration_ms,
        numTurns: message.num_turns,
      });
    } else {
      callbacks.onError(
        new Error(message.result || `Query failed with subtype: ${message.subtype}`),
      );
    }
  }

  /**
   * Interrupt the running query.
   */
  async interrupt(): Promise<boolean> {
    if (this.queryInstance) {
      try {
        await this.queryInstance.interrupt();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// --- Active execution tracking ---

const activeExecutions = new Map<string, ClaudeExecution>();

export function setActiveExecution(threadId: string, execution: ClaudeExecution): void {
  activeExecutions.set(threadId, execution);
}

export function getActiveExecution(threadId: string): ClaudeExecution | undefined {
  return activeExecutions.get(threadId);
}

export function clearActiveExecution(threadId: string): void {
  activeExecutions.delete(threadId);
}

export async function interruptExecution(threadId: string): Promise<boolean> {
  const execution = activeExecutions.get(threadId);
  if (execution) {
    return await execution.interrupt();
  }
  return false;
}

// --- Model discovery ---

export async function getAvailableModels(): Promise<
  Array<{ value: string; displayName: string; description: string }>
> {
  try {
    const q = query({
      prompt: '',
      options: { maxTurns: 0 } as any,
    });
    return await q.supportedModels();
  } catch (error) {
    console.error('[claude] Failed to get models:', error);
    return [];
  }
}
