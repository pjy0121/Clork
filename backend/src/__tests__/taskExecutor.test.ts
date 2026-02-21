import { describe, it, expect } from 'vitest';
import { isHumanInputNeeded, looksLikePermissionPrompt, detectQuestionInResult, TaskExecutor } from '../services/claude/taskExecutor';

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

describe('detectQuestionInResult', () => {
  // Korean question patterns
  it('should detect Korean question ending with 할까요?', () => {
    expect(detectQuestionInResult('이 방식으로 진행할까요?')).toBe(true);
  });

  it('should detect Korean question ending with 하시겠습니까?', () => {
    expect(detectQuestionInResult('이 변경사항을 적용하시겠습니까?')).toBe(true);
  });

  it('should detect Korean question with 선택해주세요', () => {
    expect(detectQuestionInResult('다음 중 하나를 선택해주세요:\n1. 옵션 A\n2. 옵션 B')).toBe(true);
  });

  it('should detect Korean question with 알려주세요', () => {
    expect(detectQuestionInResult('어떤 방식을 원하시는지 알려주세요')).toBe(true);
  });

  it('should detect Korean question ending with 원하시나요?', () => {
    expect(detectQuestionInResult('어떤 방식을 원하시나요?')).toBe(true);
  });

  it('should detect Korean question ending with 괜찮을까요?', () => {
    expect(detectQuestionInResult('이렇게 변경해도 괜찮을까요?')).toBe(true);
  });

  it('should detect Korean question ending with 될까요?', () => {
    expect(detectQuestionInResult('이 방식이면 될까요?')).toBe(true);
  });

  it('should detect Korean question ending with 드릴까요?', () => {
    expect(detectQuestionInResult('어떤 것부터 작업해 드릴까요?')).toBe(true);
  });

  // English question patterns
  it('should detect English question with "Should I"', () => {
    expect(detectQuestionInResult('Should I proceed with this approach?')).toBe(true);
  });

  it('should detect English question with "Would you like"', () => {
    expect(detectQuestionInResult('Would you like me to implement option A or B?')).toBe(true);
  });

  it('should detect English question with "Which approach"', () => {
    expect(detectQuestionInResult('Which approach would you prefer?')).toBe(true);
  });

  it('should detect English question with "Do you want"', () => {
    expect(detectQuestionInResult('Do you want me to continue?')).toBe(true);
  });

  it('should detect English question with "Please choose"', () => {
    expect(detectQuestionInResult('Please choose one of the following options:')).toBe(true);
  });

  it('should detect English question with "Let me know"', () => {
    expect(detectQuestionInResult('Let me know which option you prefer.')).toBe(true);
  });

  // Code block exclusion
  it('should ignore question marks inside code blocks', () => {
    const text = 'Here is the implementation:\n```\nif (x > 0) {\n  return true; // why?\n}\n```\nThe code is complete.';
    expect(detectQuestionInResult(text)).toBe(false);
  });

  it('should ignore questions inside triple-backtick code blocks', () => {
    const text = '완료했습니다.\n```typescript\n// Should I use this pattern?\nconst x = 1;\n```\n작업이 끝났습니다.';
    expect(detectQuestionInResult(text)).toBe(false);
  });

  it('should detect questions outside code blocks even if code blocks exist', () => {
    const text = '```\nconst x = 1;\n```\n이 방식으로 진행할까요?';
    expect(detectQuestionInResult(text)).toBe(true);
  });

  // False positive exclusions (polite closings)
  it('should not flag polite closing "궁금한 점이 있으시면"', () => {
    expect(detectQuestionInResult('작업이 완료되었습니다. 궁금한 점이 있으시면 말씀해주세요.')).toBe(false);
  });

  it('should not flag polite closing "도움이 필요하시면"', () => {
    expect(detectQuestionInResult('모든 변경사항을 적용했습니다. 도움이 필요하시면 알려주세요.')).toBe(false);
  });

  it('should not flag polite closing "다른 질문이 있으면"', () => {
    expect(detectQuestionInResult('완료했습니다. 다른 질문이 있으면 말씀해주세요.')).toBe(false);
  });

  it('should not flag polite closing "추가 질문이 있으시면"', () => {
    expect(detectQuestionInResult('작업 완료. 추가 질문이 있으시면 언제든 물어보세요.')).toBe(false);
  });

  it('should not flag "If you have any questions"', () => {
    expect(detectQuestionInResult('Done. If you have any questions, let me know.')).toBe(false);
  });

  it('should not flag "feel free to ask"', () => {
    expect(detectQuestionInResult('Implementation complete. Feel free to ask if you need more help.')).toBe(false);
  });

  // Non-question text
  it('should return false for plain completion text', () => {
    expect(detectQuestionInResult('모든 작업이 완료되었습니다.')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(detectQuestionInResult('')).toBe(false);
  });

  it('should return false for code-only output', () => {
    expect(detectQuestionInResult('파일을 수정했습니다.\n\n변경사항:\n- index.ts 업데이트\n- 테스트 추가')).toBe(false);
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
