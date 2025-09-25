# Active Context

## Project: AI Data Analyst Demo

**Status**: Advanced Development - Core Complete, Testing & Polish Phase  
**Last Updated**: September 25, 2025  
**Current Branch**: main

## Quick Overview

Web application that provides automated CSV data analysis using OpenAI's Assistants API with Code Interpreter. Users upload CSV files, receive intelligent data profiling and analysis suggestions, and generate downloadable insights including charts, cleaned data, and summaries.

## Current State

- ✅ **Foundation Complete**: Next.js 14 + TypeScript + MUI setup
- ✅ **Security**: Headers, rate limiting, CSP configuration
- ✅ **Core Layout**: Responsive scaffold with system-only theme (removed manual toggle)
- ✅ **Session Management**: In-memory store with TTL cleanup
- ✅ **OpenAI Integration**: Assistant/thread creation, streaming runs
- ✅ **File Upload**: CSV validation, PII detection, metadata storage
- ✅ **Analysis Workflow**: Profile generation, suggestions, streaming UI
- ✅ **Artifacts System**: Download system, versioning, bulk export
- ✅ **Error Handling**: Comprehensive error taxonomy and resilience
- ✅ **Queue Management**: Run cancellation, queue depth, rate limiting
- ✅ **Observability**: Metrics dashboard, telemetry, performance tracking
- ✅ **Testing Suite**: Comprehensive unit, integration, E2E, and accessibility tests
- ✅ **Code Quality**: All TypeScript strict mode compliance, ESLint clean, Prettier formatted
- 🔄 **Current Focus**: Final polish and demo preparation

## Recent Achievements

- **Comprehensive Testing**: 30+ test files covering all critical paths
- **TypeScript Strict Mode**: All compilation errors resolved across codebase
- **Observability Dashboard**: Real-time metrics with system health monitoring
- **Enhanced Error Handling**: Robust error taxonomy with retry logic
- **Theme System Simplified**: Removed manual toggle, now uses system preference only
- **Code Quality**: Full ESLint/Prettier compliance, no lint errors

## Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript 5.3+, MUI v5, React 18
- **Backend**: Next.js API routes, OpenAI SDK v4.20+
- **Storage**: In-memory (SessionStore, FileStore) with TTL cleanup
- **External**: OpenAI Assistants API, Code Interpreter, Files API
- **Testing**: Vitest, Testing Library, Jest-Axe, E2E automation
- **Development**: ESLint, Prettier, Husky, TypeScript strict mode

## Key Implementation Notes

- **File Constraints**: ≤50MB CSV files, PII detection via heuristics
- **Performance Goals**: <15s analysis for ≤100k rows, 90s hard timeout
- **Session TTL**: 24 hours with activity refresh
- **Artifact Naming**: `analysisType_YYYYMMDD_HHMMSS_vN.ext`
- **System Prompt**: Structured manifest output for artifact extraction
- **Theme System**: System preference detection only (light/dark auto-detection)
- **Error Taxonomy**: VALIDATION_ERROR, USER_ERROR, API_ERROR, TIMEOUT_ERROR, SYSTEM_ERROR, QUEUE_LIMIT_REACHED

## Demo Readiness

Project is nearing demo-ready state with all core functionality implemented and tested. Remaining work focuses on final polish and sample data preparation.

## Next Steps

See `tasks.md` for detailed implementation plan. Focus on sample data creation and final UX polish for demo presentation.
