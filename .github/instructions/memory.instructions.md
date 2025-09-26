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

**Follow-up Questions Fix**: **COMPLETE** - Fixed raw JSON streaming issue in follow-up questions. System now properly handles structured outputs by buffering content events and using `handleStructuredAnalysisOutput` for formatted responses. Added proper event handling in `processQueuedRun` function to prevent JSON bleeding through to UI.

**Chart Typography Enhancement**: **COMPLETE** - Enhanced SVG chart generation with professional typography system. Fixed XML syntax issues in font-family attributes (removed problematic inner quotes). Charts now use system UI font stack with proper hierarchy: bold titles (700), semi-bold labels (600), normal text (400). All text elements consistently styled with modern, cross-platform fonts.

**Current Architecture**: Dual-path streaming system with structured analysis for CSV-related queries and conversational responses for general questions. Event buffering ensures clean UI presentation. Professional chart generation with accessibility-compliant SVG output.

**Status**: **PRODUCTION READY** - Core functionality complete, follow-up conversations working, charts rendering with enhanced typography, comprehensive error handling implemented.
