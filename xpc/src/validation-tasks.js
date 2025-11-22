export class ValidationTaskManager {
  constructor() {
    this.tasks = new Map(); // leaderId -> [ {task, complete} ]
  }

  createTasks(rawTxId, leaderIds) {
    return leaderIds.map(leaderId => ({
      task: `${rawTxId}:${leaderId}:validate`,
      complete: false,
      leaderId
    }));
  }

  assignTasks(rawTxId, tasks) {
    tasks.forEach(task => {
      if (!this.tasks.has(task.leaderId)) {
        this.tasks.set(task.leaderId, []);
      }
      this.tasks.get(task.leaderId).push(task);
    });
  }

  completeTask(leaderId, taskId) {
    const leaderTasks = this.tasks.get(leaderId);
    if (leaderTasks) {
      const task = leaderTasks.find(t => t.task === taskId);
      if (task) {
        task.complete = true;
      }
    }
  }

  getTasksForLeader(leaderId) {
    return this.tasks.get(leaderId) || [];
  }

  getTask(leaderId, taskId) {
    const tasks = this.getTasksForLeader(leaderId);
    return tasks.find(t => t.task === taskId);
  }
}

