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

**Vercel Deployment Fix**: **COMPLETE** - Resolved 413 Request Entity Too Large error by reducing file size limits from 50MB to 4MB and creating optimized sample data (ai-analyst-demo_orders_medium.csv, 3.9MB, 20K rows) that fits within Vercel's 4.5MB serverless function payload limit. Removed oversized files to prevent deployment issues.

**Status**: **PRODUCTION READY** - Core functionality complete, follow-up conversations working, charts rendering with enhanced typography, comprehensive error handling implemented, Vercel deployment compatible.

## Recent Session: Week 2 Semantic Layer Implementation

**Context**: Building intelligent semantic query layer to reduce OpenAI API costs and improve performance through local processing of structured data queries.

**Week 2 Progress**:

**Task 2.1 - Intent Recognition System: ✅ COMPLETE**

- **New**: `/src/lib/agents/utils/query-types.ts` - Complete type system with QueryType enum (8 types), QueryEntity, QueryIntent, QueryPattern, IntentClassificationResult interfaces
- **New**: `/src/lib/agents/utils/intent-classifier.ts` - IntentClassifier class with pattern matching, entity extraction, confidence scoring for 8 query types (PROFILE, TREND, COMPARISON, AGGREGATION, FILTER, RELATIONSHIP, DISTRIBUTION, RANKING)
- **New**: `/src/lib/agents/__tests__/intent-classifier.test.ts` - 18 comprehensive tests with 100% pass rate, >95% accuracy, <50ms processing time
- **Features**: Priority-ordered regex patterns, entity-column matching, LLM routing decisions, cost estimation (1-10 scale), caching logic

**Task 2.2 - Entity Extraction Enhancement: ✅ COMPLETE**

- Enhanced entity extraction with column name matching using Levenshtein distance
- Confidence scoring for entity-column mappings with 0.8+ threshold for high confidence
- Measure/dimension/filter/time/limit classification from natural language
- Performance optimization with <50ms processing time requirement

**Task 2.3 - Query Pattern Matching: ✅ COMPLETE**

- Implemented regex-based pattern matching with proper priority ordering
- Fixed pattern specificity issues: aggregation/relationship patterns before comparison/profile
- Comprehensive test coverage validating all 8 query types with edge cases
- TypeScript strict mode compliance throughout codebase

**Profile API Integration Test Fix: ✅ COMPLETE**

- **Fixed**: `/src/lib/__tests__/profile-api-integration.test.ts` - Comprehensive mock infrastructure for telemetry, error handling, session management
- **Resolved**: TypeScript interface mismatches for FileMetadata, DataProfile, QualityMetrics, DataInsights, PrecomputedAggregations
- **Fixed**: Date serialization issues in JSON responses, AppError toErrorResponse method mocks
- **Result**: 4/4 tests passing, all integration scenarios covered (successful profiling, error handling, agent reuse)

**Task 2.4 - Execution Plan Generation (Query Planning Agent): ✅ COMPLETE**

- **New**: `/src/lib/agents/query-planner-agent.ts` - QueryPlannerAgent class (539 lines) extending BaseAgent with executeInternal method returning QueryPlannerResult containing both QueryIntent and ExecutionPlan for complete orchestrator integration
- **New**: `/src/lib/agents/__tests__/query-planner-agent.test.ts` - Comprehensive test suite with 18/18 tests passing, covering basic functionality, query planning for 8 intent types, execution plan generation, performance, error handling, and agent health validation
- **Updated**: `/src/lib/agents/index.ts` - Added QueryPlannerAgent, QueryPlannerInput, and QueryPlannerResult to public exports for system-wide availability
- **Features**: Intent classification integration using existing IntentClassifier from Tasks 2.1-2.3, execution plan generation with load/filter/aggregate/sort/limit steps, confidence-based routing (>0.7 semantic, <0.7 LLM fallback), automatic visualization suggestions (line/bar/scatter/heatmap/table), interface mapping between query-types.ts and types.ts QueryIntent definitions, cost estimation (1-10 scale), optimization identification (predicate pushdown, column pruning, index usage), cache key generation for performance
- **Architecture**: Returns QueryPlannerResult{queryIntent, executionPlan} instead of just QueryIntent, bridges IntentClassifier output with orchestrator expectations, follows BaseAgent patterns with protected executeInternal method, proper TypeScript compliance and error handling throughout

**Task 2.5 - Semantic Query Execution (Semantic Execution Engine): ✅ COMPLETE**

- **New**: `/src/lib/agents/semantic-executor-agent.ts` - SemanticExecutorAgent class (550+ lines) extending BaseAgent with complete execution plan processing, dependency resolution, data operations (filter/aggregate/sort/limit), and automatic insight generation without LLM calls
- **New**: `/src/lib/agents/__tests__/semantic-executor-agent.test.ts` - Comprehensive test suite with 14/14 tests passing covering basic functionality, execution plan processing, data operations, insight generation, performance, and error handling
- **New**: `/src/lib/__tests__/semantic-workflow-integration.test.ts` - Integration test suite with 8/8 tests passing covering complete QueryPlannerAgent → SemanticExecutorAgent workflow validation
- **Updated**: `/src/lib/agents/types.ts` - Added SEMANTIC_EXECUTOR to AgentType enum for proper agent registration
- **Updated**: `/src/lib/agents/orchestrator.ts` - Modified executeSemanticQuery method to handle QueryPlannerResult structure and integrate semantic execution workflow
- **Updated**: `/src/lib/agents/index.ts` - Added SemanticExecutorAgent and related types to public exports
- **Features**: Complete execution plan processing with step dependency resolution, data operations (filter by conditions, aggregate with groupBy, sort by columns, limit results), automatic insight generation for aggregations and trends, cost-optimized processing without LLM calls, proper error handling and circular dependency detection, structured output matching orchestrator expectations
- **Architecture**: Processes QueryPlannerAgent results locally, executes structured queries without API calls, generates insights automatically, falls back to LLM for complex transformations, maintains BaseAgent patterns with comprehensive test coverage

**Current Task**: Orchestrator Integration - Update orchestrator system to integrate complete semantic workflow and API endpoint updates

**Architecture Status**: Complete Week 2 semantic layer implemented with Intent Recognition System (Tasks 2.1-2.3), Query Planning Agent (Task 2.4), and Semantic Execution Engine (Task 2.5). All components tested individually and integrated. Ready for API endpoint integration and end-to-end testing.
