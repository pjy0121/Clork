import { describe, it, expect } from 'vitest';
import { isHumanInputNeeded, looksLikePermissionPrompt, TaskExecutor } from '../services/claude/taskExecutor';

describe('isHumanInputNeeded', () => {
  it('should return true for permission_request event', () => {
    expect(isHumanInputNeeded({ type: 'permission_request' })).toBe(true);
  });

  it('should return true for input_request event', () => {
    expect(isHumanInputNeeded({ type: 'input_request' })).toBe(true);
  });

  it('should return true for system permission subtype', () => {
    expect(isHumanInputNeeded({ type: 'system', subtype: 'permission' })).toBe(true);
  });

  it('should return false for regular assistant event', () => {
    expect(isHumanInputNeeded({ type: 'assistant', message: 'hello' })).toBe(false);
  });

  it('should return false for system init event', () => {
    expect(isHumanInputNeeded({ type: 'system', subtype: 'init' })).toBe(false);
  });

  it('should return false for result event', () => {
    expect(isHumanInputNeeded({ type: 'result' })).toBe(false);
  });
});

describe('looksLikePermissionPrompt', () => {
  it('should match "do you want to" pattern', () => {
    expect(looksLikePermissionPrompt('Do you want to allow this?')).toBe(true);
  });

  it('should match "allow tool" pattern', () => {
    expect(looksLikePermissionPrompt('Allow this tool to run?')).toBe(true);
  });

  it('should match "(y/n)" pattern', () => {
    expect(looksLikePermissionPrompt('Continue? (y/n)')).toBe(true);
  });

  it('should match "[y/N]" pattern', () => {
    expect(looksLikePermissionPrompt('Proceed [y/N]')).toBe(true);
  });

  it('should match "approve" pattern', () => {
    expect(looksLikePermissionPrompt('Please approve this action')).toBe(true);
  });

  it('should match "permission" pattern', () => {
    expect(looksLikePermissionPrompt('Requires permission to continue')).toBe(true);
  });

  it('should not match normal text', () => {
    expect(looksLikePermissionPrompt('Hello world')).toBe(false);
  });

  it('should not match empty string', () => {
    expect(looksLikePermissionPrompt('')).toBe(false);
  });
});

describe('TaskExecutor', () => {
  describe('hasRunningTasks / getRunningTaskIds', () => {
    it('should report no running tasks initially', () => {
      const executor = new TaskExecutor();
      expect(executor.hasRunningTasks()).toBe(false);
      expect(executor.getRunningTaskIds()).toEqual([]);
    });
  });

  describe('abort', () => {
    it('should return false when task does not exist', () => {
      const executor = new TaskExecutor();
      expect(executor.abort('nonexistent')).toBe(false);
    });
  });

  describe('sendInput', () => {
    it('should return false (not supported with file redirect)', () => {
      const executor = new TaskExecutor();
      expect(executor.sendInput('task-1', 'yes')).toBe(false);
    });
  });
});
