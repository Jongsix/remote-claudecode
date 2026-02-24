export interface ProjectConfig {
  alias: string;
  path: string;
  autoWorktree?: boolean;
}

export interface ChannelBinding {
  channelId: string;
  projectAlias: string;
  model?: string;
}

export interface DataStore {
  projects: ProjectConfig[];
  bindings: ChannelBinding[];
  threadSessions?: ThreadSession[];
  worktreeMappings?: WorktreeMapping[];
  passthroughThreads?: PassthroughThread[];
  queues?: Record<string, QueuedMessage[]>;
  queueSettings?: Record<string, QueueSettings>;
}

export interface QueuedMessage {
  prompt: string;
  userId: string;
  timestamp: number;
}

export interface QueueSettings {
  paused: boolean;
  continueOnFailure: boolean;
  freshContext: boolean;
}

export interface ThreadSession {
  threadId: string;
  sessionId: string;
  projectPath: string;
  port: number; // Legacy field, kept for data compatibility
  createdAt: number;
  lastUsedAt: number;
}

export interface WorktreeMapping {
  threadId: string;
  branchName: string;
  worktreePath: string;
  projectPath: string;
  description: string;
  createdAt: number;
}

export interface PassthroughThread {
  threadId: string;
  enabled: boolean;
  enabledBy: string;  // userId
  enabledAt: number;
}
