# Contributing to Clork

Clork에 기여해 주셔서 감사합니다! 아래 가이드를 따라주세요.

## Development Setup

```bash
git clone https://github.com/pjy0121/Clork.git
cd Clork
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
npm run dev
```

## Project Structure

```
Clork/
├── backend/src/       # Express + SQLite + Claude CLI integration
│   ├── routes/        # REST API endpoints
│   ├── services/      # Claude CLI execution, task orchestration
│   └── __tests__/     # Backend tests
├── frontend/src/      # React + Zustand + Tailwind
│   ├── components/    # UI components
│   └── __tests__/     # Frontend tests
└── docs/              # Architecture, API, Database, Conventions
```

## Workflow

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feature/my-feature`
3. **Make changes** following the conventions below
4. **Run tests**: `npm run test`
5. **Commit** with a clear message
6. **Push** and open a **Pull Request**

## Conventions

- **Language**: TypeScript strict mode
- **UI text**: Korean (한국어) for all user-facing strings
- **Testing**: vitest — write tests for core logic (DB, API, services, store actions)
- **Styling**: Tailwind CSS utility classes
- **State**: Zustand store only (no Context providers)
- **DB**: Prepared statements via better-sqlite3

See [docs/CONVENTIONS.md](docs/CONVENTIONS.md) for full details.

## When to Write Tests

- **Required**: DB schema changes, API route handlers, service methods, store actions, utility functions
- **Not required**: Component styling, documentation, config files, type-only changes

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add task reordering via drag-and-drop
fix: prevent duplicate session auto-start
refactor: extract Claude CLI options to config
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/pjy0121/Clork/issues)
- Include steps to reproduce, expected behavior, and actual behavior
- Mention your OS and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
