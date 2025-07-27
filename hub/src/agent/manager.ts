import { Socket } from 'socket.io';
import { Agent, BrowserType, SearchTask } from '../types';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('agent-manager');

export class AgentManager {
  private static agents: Map<string, Agent> = new Map();
  private static taskQueue: SearchTask[] = [];
  private static activeTasks: Map<string, SearchTask> = new Map();

  /**
   * Register new agent
   */
  static registerAgent(socket: Socket, agentInfo: {
    vmId: string;
    browser: BrowserType;
    browserVersion: string;
  }): Agent {
    const agent: Agent = {
      id: socket.id,
      vmId: agentInfo.vmId,
      browser: agentInfo.browser,
      browserVersion: agentInfo.browserVersion,
      status: 'idle',
      lastActivity: new Date(),
      connectedAt: new Date(),
      tasksCompleted: 0,
      tasksInProgress: 0,
    };

    this.agents.set(socket.id, agent);
    logger.info('Agent registered', { agentId: socket.id, ...agentInfo });

    return agent;
  }

  /**
   * Remove agent
   */
  static removeAgent(socketId: string): void {
    const agent = this.agents.get(socketId);
    if (agent) {
      // Move agent's active tasks back to queue
      this.activeTasks.forEach((task, taskId) => {
        if (task.agentId === socketId) {
          task.status = 'pending';
          task.agentId = undefined;
          this.taskQueue.push(task);
          this.activeTasks.delete(taskId);
        }
      });

      this.agents.delete(socketId);
      logger.info('Agent removed', { agentId: socketId });
    }
  }

  /**
   * Get available agents for a browser type
   */
  static getAvailableAgents(browser?: BrowserType): Agent[] {
    const availableAgents = Array.from(this.agents.values()).filter(
      agent => agent.status === 'idle'
    );

    if (browser && browser !== 'chrome' && browser !== 'firefox' && browser !== 'edge') {
      return availableAgents.filter(agent => agent.browser === browser);
    }

    return availableAgents;
  }

  /**
   * Select best agent for task
   */
  static selectAgent(preferredBrowser?: BrowserType): Agent | null {
    let availableAgents = this.getAvailableAgents();

    if (availableAgents.length === 0) {
      return null;
    }

    // If specific browser requested
    if (preferredBrowser && preferredBrowser !== 'chrome' && preferredBrowser !== 'firefox' && preferredBrowser !== 'edge') {
      availableAgents = availableAgents.filter(
        agent => agent.browser === preferredBrowser
      );
    }

    if (availableAgents.length === 0) {
      return null;
    }

    // Select agent with least completed tasks (load balancing)
    return availableAgents.reduce((prev, curr) =>
      prev.tasksCompleted < curr.tasksCompleted ? prev : curr
    );
  }

  /**
   * Create and queue a search task
   */
  static createTask(params: {
    apiKey: string;
    keyword: string;
    productCode: string;
    pages: number;
    browser: BrowserType | 'auto';
  }): SearchTask {
    const task: SearchTask = {
      id: uuidv4(),
      apiKey: params.apiKey,
      keyword: params.keyword,
      productCode: params.productCode,
      pages: params.pages,
      browser: params.browser === 'auto' ? 'chrome' : params.browser,
      status: 'pending',
      createdAt: new Date(),
    };

    this.taskQueue.push(task);
    logger.info('Task created', { taskId: task.id, ...params });

    return task;
  }

  /**
   * Assign task to agent
   */
  static assignTask(task: SearchTask, agent: Agent): void {
    task.status = 'in_progress';
    task.agentId = agent.id;
    task.startedAt = new Date();

    agent.status = 'busy';
    agent.tasksInProgress++;
    agent.lastActivity = new Date();

    this.activeTasks.set(task.id, task);

    logger.info('Task assigned', {
      taskId: task.id,
      agentId: agent.id,
      browser: agent.browser,
    });
  }

  /**
   * Complete task
   */
  static completeTask(taskId: string, result: any, success: boolean): SearchTask | null {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return null;
    }

    const agent = this.agents.get(task.agentId!);
    if (agent) {
      agent.status = 'idle';
      agent.tasksInProgress--;
      agent.tasksCompleted++;
      agent.lastActivity = new Date();
    }

    task.status = success ? 'completed' : 'failed';
    task.completedAt = new Date();
    task.result = result;

    this.activeTasks.delete(taskId);

    logger.info('Task completed', {
      taskId,
      success,
      duration: task.completedAt.getTime() - task.startedAt!.getTime(),
    });

    return task;
  }

  /**
   * Get agent statistics
   */
  static getStats() {
    const browserStats: Record<BrowserType, number> = {
      chrome: 0,
      firefox: 0,
      edge: 0,
    };

    const statusStats = {
      idle: 0,
      busy: 0,
      error: 0,
      disconnected: 0,
    };

    this.agents.forEach(agent => {
      browserStats[agent.browser]++;
      statusStats[agent.status]++;
    });

    return {
      totalAgents: this.agents.size,
      browserStats,
      statusStats,
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
    };
  }

  /**
   * Get next task from queue
   */
  static getNextTask(browser?: BrowserType): SearchTask | null {
    if (this.taskQueue.length === 0) {
      return null;
    }

    // Find task matching browser preference
    const taskIndex = this.taskQueue.findIndex(
      task => !browser || task.browser === browser
    );

    if (taskIndex === -1) {
      return null;
    }

    return this.taskQueue.splice(taskIndex, 1)[0];
  }
}