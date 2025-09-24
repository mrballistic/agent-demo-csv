# Implementation Plan

## Foundation & Guardrails

- [x] 1. Environment setup and security configuration
  - Set up environment variables: OPENAI_API_KEY, APP_URL, NODE_OPTIONS, LOG_LEVEL
  - Configure TypeScript strict mode, ESLint + Prettier, Zod for API validation
  - Add Husky pre-commit hooks for code quality
  - Initialize git repository and ensure .kiro folder is tracked (not in .gitignore)
  - **DoD:** Environment loads correctly, linting passes, TypeScript strict mode enabled, .kiro specs committed to git
  - _Requirements: 8.1, 8.2, 8.5_

- [x] 2. Security headers and API protection
  - Implement Content Security Policy, CORP/COEP headers
  - Add CORS configuration and rate limiting on /api/\* routes
  - Create /api/healthz endpoint returning build SHA
  - **DoD:** Security headers present, rate limiting active, health check responds
  - _Requirements: 8.1, 8.8_

## Core Application Structure

- [x] 3. Next.js foundation with MUI integration
  - Create Next.js 14 app with App Router and TypeScript
  - Install MUI, icons, Emotion, and OpenAI SDK
  - Set up basic project structure with components and lib directories
  - **DoD:** App boots without errors, dependencies installed correctly
  - _Requirements: 8.5_

- [x] 4. MUI layout scaffold and theme system
  - Implement AnalystMuiScaffold component with responsive layout
  - Add ThemeToggle with dark/light/system mode (localStorage + prefers-color-scheme)
  - Create AppBar, chat pane, artifacts drawer with proper responsive behavior
  - **DoD:** App renders with complete layout, theme switching works, no hydration flash
  - _Requirements: 5.1, 5.2, 8.5_

- [x] 5. Session and storage management (in-memory)
  - Implement SessionStore with rolling 24h TTL: { id, threadId, ttlExpiresAt, lastActivity, metrics }
  - Create FileStore for temporary artifacts with checksums and 24h retention
  - Add automatic TTL sweeper for expired sessions and files
  - **DoD:** TTL sweeper deletes expired data, reload restores thread state
  - _Requirements: 7.6, 8.1, 8.2_

## OpenAI Integration

- [x] 6. OpenAI integration layer
  - Create AssistantManager: createAssistant(), createThread(), createMessage(), createRun(), streamRun(), cancelRun()
  - Configure assistant with tools:[{type:'code_interpreter'}], temperature:0.2, system prompt
  - Implement manifest extractor parsing last line JSON with fallback to message content
  - **DoD:** Can create assistant/thread, send message with attachment, start run, parse manifest
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

## File Handling

- [-] 7. File upload API and validation
  - Create POST /api/files/upload route with Node runtime
  - Add CSV validation: ≤50MB, .csv extension, delimiter/encoding detection, row estimation
  - Implement PII heuristics: column-name + regex sample scan, record pii_flags
  - Store metadata: checksum, encoding, delimiter, sniffRows, pii flags
  - **DoD:** Returns {fileId, filename, size, rowCount, profileHints}, rejects non-CSV with clear message
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8_

- [ ] 8. File uploader UI component
  - Build drag & drop interface with progress indication
  - Add error toasts using MUI Alert components
  - Post system chat message "File received: ..." on success
  - Disable uploader while run is active
  - **DoD:** Clear success/failure feedback, proper state management during uploads
  - _Requirements: 1.1, 1.2, 1.3, 3.7_

## Analysis Workflow

- [ ] 9. Profiling workflow with streaming
  - Create POST /api/analysis/profile route (creates thread, message with CSV attachment, run)
  - Implement GET /api/runs/:threadId/stream SSE endpoint emitting run._ + message._ events
  - Add server-side artifact.created events when parsing new files
  - Handle code cell saving /mnt/data/summary.md and manifest printing
  - **DoD:** Chat shows "Profile created" + insight, Artifacts panel shows summary.md
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 6.1, 6.2, 6.3_

- [ ] 10. Chat interface with live updates
  - Create ChatPane with real-time updates from SSE
  - Implement optimistic user messages and scroll management
  - Add keyboard accessibility and smooth streaming delta rendering
  - **DoD:** Streaming deltas render smoothly, completed messages pinned, focus management works
  - _Requirements: 5.1, 5.2, 5.4_

- [ ] 11. Analysis suggestions and quick actions
  - Create GET /api/analysis/suggestions?fileId endpoint
  - Build QuickActions component with preset analysis buttons
  - Gray out suggestions when required columns missing
  - Wire actions to POST /api/analysis/query
  - **DoD:** 3-5 suggestions appear, actions trigger runs, missing columns handled
  - _Requirements: 2.1, 2.2, 2.3, 5.4_

- [ ] 12. Run execution with progress tracking
  - Implement POST /api/analysis/query route (creates message and run)
  - Add budget enforcement: 90s hard timeout, 15s goal for ≤100k rows
  - Forward SSE events to UI with status chips
  - **DoD:** Status indicators (Queued/In Progress/Completed), timeout errors with retry CTA
  - _Requirements: 3.1, 3.6, 5.5, 3.2, 3.3_

## Artifacts and Downloads

- [ ] 13. Artifacts panel and download system
  - Create GET /api/artifacts/:id/download route (signed URL or stream)
  - Implement versioning: analysisType_YYYYMMDD_HHMMSS_vN.ext
  - Add POST /api/export/artifacts for bulk ZIP + manifest.txt
  - **DoD:** Single/multi downloads work, versions preserved, ZIP includes manifest
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3_

## Error Handling and Resilience

- [ ] 14. Robust error handling and retries
  - Implement error taxonomy: VALIDATION_ERROR, USER_ERROR, API_ERROR, TIMEOUT_ERROR, SYSTEM_ERROR
  - Add exponential backoff for transient OpenAI errors
  - Support Idempotency-Key header on analysis POSTs
  - **DoD:** Each error shows friendly copy + suggested action, telemetry records error_class
  - _Requirements: 8.4, 8.6, 3.6_

- [ ] 15. Run cancellation and queue management
  - Create POST /api/runs/:threadId/cancel route forwarding to OpenAI
  - Implement simple FIFO queue (in-memory) with max depth
  - Add UI queue position display and 429 responses with Retry-After
  - **DoD:** Cancel button stops runs, queue messages visible, overload returns 429 cleanly
  - _Requirements: 8.3, 8.7_

## Accessibility and Observability

- [ ] 16. Accessibility compliance
  - Add alt text for charts from manifest data
  - Implement ARIA labels and roving tab index for chat & artifacts
  - Fix focus traps and keyboard navigation
  - **DoD:** Axe/Pa11y passes, keyboard can operate all controls
  - _Requirements: 3.4, 5.6, 8.5_

- [ ] 17. Observability and cost tracking
  - Add metrics: p50/p95 run latency, token usage per run, runs started/completed/failed, queue depth
  - Implement logging: run_id, thread_id, user agent, error_class, file_ids produced
  - **DoD:** Simple dashboard shows latency and error rate
  - _Requirements: 8.2_

## Testing and Polish

- [ ] 18. Comprehensive test suite
  - Write unit tests (stores, manifest parser), integration tests (upload/profile/query/zip)
  - Add E2E tests (happy path + timeout + cancel) and accessibility tests (Axe)
  - **DoD:** All critical paths covered, tests pass in CI
  - _Requirements: All requirements validation_

- [ ] 19. Demo polish and sample data
  - Create sample CSVs (valid, PII, outliers scenarios)
  - Add loading shimmers, help text, "Delete all my data" action
  - Implement proper error recovery and user guidance
  - **DoD:** Demo-ready with sample data, smooth UX, complete cleanup functionality
  - _Requirements: User experience optimization_

## Critical Implementation Reminders

### System Prompt Must-Haves

- Profile → Suggestions → On selection: INSIGHT + one PNG + optional cleaned CSV
- Print single JSON "manifest" line at end with files[], analysis_type, columns_used
- If multi-segmentation requested → run first segment only and note limitation
- Never display raw PII; aggregate or redact
- Use ISO dates, currency symbols, thousands separators

### Required SSE Events

- run.started | run.in_progress | run.completed | run.failed
- message.delta | message.completed
- custom artifact.created (when manifest/files detected)

### Validation Gates

- CSV: ≤50 MB, header present, minimal columns (order_date, qty, unit_price or net_revenue)
- Rows: warn 100k–1M; propose downsample >1M
- PII flags: mark columns, switch UI to aggregate-only

### OpenAI API Payloads

**Create message with CSV:**

```typescript
await openai.beta.threads.messages.create(threadId, {
  role: 'user',
  content: 'Profile the file and suggest questions.',
  attachments: [{ file_id: csvFileId, tools: [{ type: 'code_interpreter' }] }],
});
```

**Create streaming run:**

```typescript
await openai.beta.threads.runs.create(threadId, {
  assistant_id: assistantId,
  stream: true,
  tool_choice: 'auto',
  max_prompt_tokens: 1000,
  max_completion_tokens: 1000,
  temperature: 0.2,
});
```

**Cancel run:**

```typescript
await openai.beta.threads.runs.cancel(runId, { thread_id: threadId });
```
