# Clork - Claude + Work

Web-based Claude Code task management tool. Express + SQLite backend, React + Zustand frontend.

## Quick Reference

- **Docs**: `docs/` — ARCHITECTURE.md, API.md, DATABASE.md, CONVENTIONS.md
- **Backend**: `backend/src/` — Express routes + SQLite + Claude CLI integration
- **Frontend**: `frontend/src/` — React components + Zustand store
- **Dev**: `npm run dev` (both servers), Backend :3001, Frontend :5173
- **Test**: `npm run test` (root), or `npm run test` in backend/frontend separately

## Core Rules

1. **절대로 서버를 재시작하지 마라**: `npm run dev` 등 서버 시작/재시작 명령을 실행하지 마라. 이미 실행 중인 서버가 있으며, 재시작하면 진행 중인 다른 세션들이 모두 중단된다.
2. **TDD 적용 기준**:
   - **TDD 필수**: DB 스키마, API route handler, service 메서드, store action (데이터 변환/API 호출), 유틸 함수
   - **TDD 불필요 (바로 구현)**: 컴포넌트 렌더링/스타일, 문서, 설정 파일, 타입 정의만 변경, 기존 로직 파일 이동(리팩토링), custom hook (UI 로직만)
   - **판단 기준**: "이 변경이 잘못되면 기존 테스트가 잡아주는가?" → Yes면 TDD 불필요, No면 TDD 필요
3. **Post-change**: 핵심 로직 변경 후에만 테스트 실행. 문서 변경이 필요할 때만 doc-sync.
4. **Korean UI**: All user-facing text in Korean (한국어)
5. **No manual session start**: Sessions auto-start when tasks are added to todo
6. **Model override**: Sessions can override project default model
7. **Multiple concurrent sessions**: Sessions can run in parallel

## Key Architecture

- **Data flow**: HTTP API → Express routes → SQLite → TaskRunner → ClaudeService → `claude` CLI (child_process)
- **Real-time**: Socket.IO for task progress streaming
- **State**: Zustand single store with localStorage persistence for activeProjectId/activeSessionId
- **Task lifecycle**: `backlog → todo → running → done`
- **Session lifecycle**: `idle → running → completed` (auto-transitions)
