import { describe, test, expect, beforeEach } from '@jest/globals';
import { ValidationTaskManager } from '../src/validation-tasks.js';

describe('Validation Task Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new ValidationTaskManager();
  });

  test('should create validation tasks', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    expect(tasks.length).toBe(2);
    expect(tasks[0]).toHaveProperty('task');
    expect(tasks[0]).toHaveProperty('complete');
    expect(tasks[0]).toHaveProperty('leaderId');
    expect(tasks[0].complete).toBe(false);
    expect(tasks[0].leaderId).toBe('leader1');
    expect(tasks[1].leaderId).toBe('leader2');
  });

  test('should create unique task IDs', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    expect(tasks[0].task).toBe('rawTxId:leader1:validate');
    expect(tasks[1].task).toBe('rawTxId:leader2:validate');
  });

  test('should assign tasks to leaders', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    manager.assignTasks('rawTxId', tasks);
    const assigned = manager.getTasksForLeader('leader1');
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned[0].task).toBe('rawTxId:leader1:validate');
  });

  test('should mark task as complete', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1']);
    manager.assignTasks('rawTxId', tasks);
    manager.completeTask('leader1', tasks[0].task);
    const task = manager.getTask('leader1', tasks[0].task);
    expect(task.complete).toBe(true);
  });

  test('should handle multiple tasks for same leader', () => {
    const tasks1 = manager.createTasks('rawTxId1', ['leader1']);
    const tasks2 = manager.createTasks('rawTxId2', ['leader1']);
    manager.assignTasks('rawTxId1', tasks1);
    manager.assignTasks('rawTxId2', tasks2);
    
    const allTasks = manager.getTasksForLeader('leader1');
    expect(allTasks.length).toBe(2);
  });

  test('should return empty array for leader with no tasks', () => {
    const tasks = manager.getTasksForLeader('nonexistent');
    expect(tasks).toEqual([]);
  });

  test('should return null for nonexistent task', () => {
    const task = manager.getTask('leader1', 'nonexistent:task');
    expect(task).toBeUndefined();
  });

  test('should handle completing non-existent task gracefully', () => {
    expect(() => {
      manager.completeTask('leader1', 'nonexistent:task');
    }).not.toThrow();
  });

  test('should track task completion status correctly', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    manager.assignTasks('rawTxId', tasks);
    
    // Complete one task
    manager.completeTask('leader1', tasks[0].task);
    
    const task1 = manager.getTask('leader1', tasks[0].task);
    const task2 = manager.getTask('leader2', tasks[1].task);
    
    expect(task1.complete).toBe(true);
    expect(task2.complete).toBe(false);
  });

  test('should handle tasks for multiple transactions', () => {
    const tasks1 = manager.createTasks('tx1', ['leader1', 'leader2']);
    const tasks2 = manager.createTasks('tx2', ['leader2', 'leader3']);
    
    manager.assignTasks('tx1', tasks1);
    manager.assignTasks('tx2', tasks2);
    
    expect(manager.getTasksForLeader('leader1').length).toBe(1);
    expect(manager.getTasksForLeader('leader2').length).toBe(2);
    expect(manager.getTasksForLeader('leader3').length).toBe(1);
  });

  test('should not allow duplicate task completion', () => {
    const tasks = manager.createTasks('rawTxId', ['leader1']);
    manager.assignTasks('rawTxId', tasks);
    
    manager.completeTask('leader1', tasks[0].task);
    manager.completeTask('leader1', tasks[0].task); // Complete again
    
    const task = manager.getTask('leader1', tasks[0].task);
    expect(task.complete).toBe(true);
  });

  test('should create tasks with correct format', () => {
    const rawTxId = 'abc123def456';
    const leaderIds = ['leader1', 'leader2', 'leader3'];
    const tasks = manager.createTasks(rawTxId, leaderIds);
    
    tasks.forEach((task, index) => {
      expect(task.task).toBe(`${rawTxId}:${leaderIds[index]}:validate`);
      expect(task.leaderId).toBe(leaderIds[index]);
      expect(task.complete).toBe(false);
    });
  });
});
