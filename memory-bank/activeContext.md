# Active Context

## Project: AI Data Analyst Demo

**Status**: Development Phase - Core Infrastructure Complete  
**Last Updated**: September 25, 2025  
**Current Branch**: main

## Quick Overview

Web application that provides automated CSV data analysis using OpenAI's Assistants API with Code Interpreter. Users upload CSV files, receive intelligent data profiling and analysis suggestions, and generate downloadable insights including charts, cleaned data, and summaries.

## Current State

- ✅ **Foundation Complete**: Next.js 14 + TypeScript + MUI setup
- ✅ **Security**: Headers, rate limiting, CSP configuration
- ✅ **Core Layout**: Responsive scaffold with theme system
- ✅ **Session Management**: In-memory store with TTL cleanup
- ✅ **OpenAI Integration**: Assistant/thread creation, streaming runs
- ✅ **File Upload**: CSV validation, PII detection, metadata storage
- ✅ **Analysis Workflow**: Profile generation, suggestions, streaming UI
- ✅ **Artifacts System**: Download system, versioning, bulk export
- 🔄 **Current Focus**: Error handling and resilience improvements

## Immediate Priorities

1. **Error Handling** - Robust error taxonomy and retry logic
2. **Queue Management** - Run cancellation and queue depth limits
3. **Accessibility** - ARIA labels, keyboard navigation, alt text
4. **Testing** - Unit, integration, and E2E test coverage

## Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, MUI v5, React
- **Backend**: Next.js API routes, OpenAI SDK v4
- **Storage**: In-memory (SessionStore, FileStore) with TTL cleanup
- **External**: OpenAI Assistants API, Code Interpreter, Files API
- **Development**: ESLint, Prettier, Husky, Vitest

## Key Implementation Notes

- **File Constraints**: ≤50MB CSV files, PII detection via heuristics
- **Performance Goals**: <15s analysis for ≤100k rows, 90s hard timeout
- **Session TTL**: 24 hours with activity refresh
- **Artifact Naming**: `analysisType_YYYYMMDD_HHMMSS_vN.ext`
- **System Prompt**: Structured manifest output for artifact extraction

## Next Steps

See `tasks.md` for detailed implementation plan. Focus on error handling robustness and user experience polish before demo readiness.
