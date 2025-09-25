# Memory Bank Instructions

## Purpose

The memory bank provides centralized context for AI agents working on this project. It contains key project information, current status, and implementation guidance.

## Structure

- `activeContext.md` - Current project state and immediate priorities
- `progress.md` - Implementation progress tracking
- `requirements.md` - Complete requirements documentation
- `design.md` - Architecture and technical design
- `tasks.md` - Implementation plan and task breakdown

## Usage Guidelines

1. **Always read `activeContext.md` first** to understand current state
2. **Load all memory bank files** before starting any task
3. **Update `progress.md`** when completing tasks or milestones
4. **Refresh `activeContext.md`** when project priorities change
5. **Follow the Kiro-Lite workflow**: PRD → Design → Tasks → Code

## Update Protocol

When instructed to "/update memory bank":

1. Refresh `activeContext.md` with current status
2. Update `progress.md` with completed tasks
3. Sync with `.kiro/specs/` if changed
4. Maintain consistency across all files
