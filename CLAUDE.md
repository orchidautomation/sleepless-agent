# Sleepless Agent - Project Instructions

## Overview
Sleepless Agent is a 24/7 AI agent operating system (AgentOS) that maximizes Claude Code Pro usage during idle time. It runs as a daemon processing tasks submitted via Slack or CLI.

## Architecture

### Core Components
- **Daemon** (`src/sleepless_agent/core/daemon.py`): Main event loop, task scheduling
- **Executor** (`src/sleepless_agent/core/executor.py`): Claude Agent SDK integration, multi-agent workflow
- **Task Queue** (`src/sleepless_agent/core/task_queue.py`): SQLAlchemy + SQLite task management
- **Git Manager** (`src/sleepless_agent/git/manager.py`): Branch strategies, auto-commit, PR creation

### Multi-Agent Workflow
Tasks execute through three phases:
1. **Planner**: Analyzes task, creates structured TODO list (tools: Read, Glob, Grep)
2. **Worker**: Executes the plan (tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite)
3. **Evaluator**: Reviews completion status (tools: Read, Glob)

### Workspace Isolation
- Task workspaces: `workspace/tasks/<task_id>_<slug>/`
- Project workspaces: `workspace/projects/<project_id>/`
- Shared resources: `workspace/shared/`

## Code Conventions

### Python Style
- Python 3.11+ with type hints
- Use `loguru` via `get_logger(__name__)` for logging
- Async/await for I/O operations
- SQLAlchemy for database operations

### Logging Levels
- `logger.debug()`: Internal workflow details, metrics
- `logger.info()`: Task lifecycle events (start, complete)
- `logger.warning()`: Recoverable issues
- `logger.error()`: Failures requiring attention
- `logger.critical()`: System-wide issues (usage limits)

### Configuration
- Main config: `src/sleepless_agent/config.yaml`
- Environment: `.env` for secrets (SLACK_BOT_TOKEN, SLACK_APP_TOKEN)

## Key Files

### Entry Points
- `src/sleepless_agent/__main__.py`: CLI entry (`sle` command)
- `src/sleepless_agent/slack/bot.py`: Slack bot with Socket Mode

### Important Modules
- `src/sleepless_agent/utils/config.py`: Configuration loading
- `src/sleepless_agent/monitoring/pro_plan_usage.py`: Usage tracking
- `src/sleepless_agent/scheduling/time_utils.py`: Day/night threshold logic
- `src/sleepless_agent/generation/task_generator.py`: Auto task generation

## Task Types
- **THOUGHT**: Random ideas, auto-committed to `thought-ideas` branch
- **SERIOUS**: Feature work, creates PRs for review
- **NEW**: Fresh workspace, build from scratch
- **REFINE**: Copy source code to workspace, improve existing code

## Testing
```bash
pytest tests/
pytest tests/unit/  # Fast unit tests
pytest tests/integration/  # Requires environment setup
```

## Common Operations

### Run the daemon
```bash
sle daemon start
```

### Submit a task via CLI
```bash
sle think "implement feature X"
sle think -p "serious task requiring PR"  # -p for PR creation
```

### Check status
```bash
sle status
```

## Git Workflow
- Thoughts: Auto-commit to `thought-ideas` branch
- Serious tasks: Create feature branch `feature/<project>-<task_id>`, open PR
- Never force push or modify history

## Usage Thresholds
- Daytime (9 AM - 1 AM): 20% threshold
- Nighttime (1 AM - 9 AM): 80% threshold
- System pauses when threshold reached, resumes on reset
