---
applyTo: '**'
---

# Memory Bank

## Recent Session: OpenAI Assistant API → Responses API Migration

**Context**: Migrated from unreliable Assistant API (threads/runs/code_interpreter) to chat.completions with structured outputs.

**Key Changes**:

- **New**: `/src/lib/openai-responses.ts` - ConversationManager class using chat.completions
- **Updated**: `/src/app/api/runs/[threadId]/stream/route.ts` - Uses conversationManager instead of assistantManager
- **Updated**: `/src/app/api/analysis/profile/route.ts` - Simplified session creation, no thread management
- **Updated**: `/src/app/api/analysis/query/route.ts` - Removed assistantManager dependencies
- **Schema Fix**: Added `additionalProperties: false` to ANALYSIS_RESPONSE_SCHEMA for OpenAI compliance. Also made `pii_columns` required in metadata object to satisfy OpenAI's strict schema validation.

**Architecture**: Session-based conversations replace OpenAI threads, structured JSON schema outputs replace manifest parsing, streaming via Server-Sent Events maintained.

**Status**: Core migration complete, JSON schema fixed, CSV content integration fixed, follow-up conversation flow implemented. Added CSV sampling for large files to handle OpenAI's 10MB message limit. **FIXED: Token overflow issue** - implemented conversation trimming, CSV content separation, and intelligent token management to prevent 3.8M token context overflows. System now handles any size CSV without hitting 128K token limits.

**Token Management**:

- Added `estimateTokens()` utility for rough token counting (1 token ≈ 4 characters)
- Set MAX_CONTEXT_TOKENS = 100K, MAX_MESSAGE_TOKENS = 50K for safety buffers
- `trimConversationForTokens()` keeps recent messages, removes old CSV data, maintains system prompt
- `sampleCSVForTokens()` reduces CSV size when exceeding token limits
- `streamAnalysis()` now handles CSV analysis separately from conversation history - CSV data not stored in chat, only insights preserved

**Next**: Testing with large CSV files. **FIXED: UI presentation** - system now displays complete analysis summary content in chat instead of just artifact filename. Analysis summaries show full markdown content including insights, metadata, and file information directly in the conversation.
