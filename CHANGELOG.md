# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2025-09-30

### 🎨 Chat Interface Modernization

#### Modern Bubble Chat Design

- **Redesigned**: Complete chat interface transformation to modern bubble-style messaging
- **Added**: Left-aligned assistant messages with clean light background
- **Added**: Right-aligned user messages in elegant dark grey bubbles (`grey.800`) with white text
- **Enhanced**: Message containers with rounded corners, proper spacing, and 75% max-width for optimal readability
- **Improved**: Professional contrast with enhanced styling for code blocks and markdown content in user messages

#### Intelligent Message Filtering System

- **Implemented**: Multi-layer system message suppression for cleaner chat experience
- **Added**: ConversationAgent-level info/warn message suppression to reduce noise
- **Enhanced**: Streaming API filtering with comprehensive message type detection
- **Added**: UI-level filtering for system messages containing debug phrases:
  - "Starting data profiling", "Data profiling completed"
  - "Processing query", "Semantic processing", "Query planning"
  - "Sample data loaded", "File uploaded", "Queued (position X)"
- **Removed**: Source-level message generation from FileUploader and system components

#### Profiling Animation Restoration

- **Fixed**: Missing "AI is analyzing your data..." animation during initial CSV upload
- **Added**: `isProfiling` state in main page component to track CSV analysis
- **Enhanced**: ChatPane `isRunning` prop now includes profiling state (`isRunning || isProfiling`)
- **Implemented**: Proper loading state management with animation appearing during file profiling
- **Added**: Graceful cleanup with `finally` block ensuring animation disappears after profiling completion

### 🧹 Code Quality Improvements

#### Component Cleanup

- **Removed**: Unused Chip component and related Material-UI imports
- **Removed**: Helper functions `getMessageIcon()` and `getMessageColor()` no longer needed
- **Removed**: Icon imports (Person, SmartToy, Info) replaced with modern bubble design
- **Enhanced**: Cleaner component structure with reduced complexity and better performance

#### Architecture Enhancements

- **Improved**: State management for profiling lifecycle with proper start/stop tracking
- **Enhanced**: Error handling in profiling process with loading state cleanup
- **Added**: Comprehensive message filtering logic with configurable phrase detection
- **Optimized**: Component rendering with reduced unnecessary re-renders

### 🎯 User Experience Improvements

- **Enhanced**: Clean, distraction-free chat interface without system message clutter
- **Improved**: Visual hierarchy with clear distinction between user and assistant messages
- **Added**: Consistent loading animations throughout the application lifecycle
- **Enhanced**: Professional appearance matching modern messaging application standards

### 📱 Responsive Design

- **Optimized**: Bubble layout works seamlessly across all screen sizes
- **Enhanced**: Touch-friendly message spacing and sizing
- **Improved**: Mobile-first approach to message alignment and width constraints

---

## [2.0.0] - 2025-09-26

### 🚀 Major Features Added

#### Chat Completions Migration

- **BREAKING**: Migrated from OpenAI Assistant API to Chat Completions API with structured outputs
- **New**: `ConversationManager` class in `/src/lib/openai-responses.ts` for streamlined conversation handling
- **Enhanced**: Dual-path streaming system supporting both structured analysis and conversational responses
- **Improved**: Token management with intelligent conversation trimming and CSV sampling

#### Follow-up Question System

- **Fixed**: Raw JSON streaming issue in follow-up questions
- **Added**: Event buffering system to prevent JSON bleeding through to UI
- **Enhanced**: `processQueuedRun` function with proper structured output handling
- **Improved**: Clean UI presentation with formatted responses instead of raw data

#### Professional Chart Typography

- **Enhanced**: SVG chart generation with modern typography system
- **Added**: System UI font stack: `system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif`
- **Fixed**: XML syntax issues in font-family attributes (removed problematic inner quotes)
- **Improved**: Font hierarchy with proper weights: bold titles (700), semi-bold labels (600), normal text (400)

### 🔧 Technical Improvements

#### API Architecture

- **Updated**: `/src/app/api/runs/[threadId]/stream/route.ts` - Enhanced streaming with structured output support
- **Improved**: Session-based conversations replace OpenAI threads
- **Added**: Comprehensive error handling and retry mechanisms
- **Enhanced**: Real-time processing with Server-Sent Events

#### Data Processing

- **Added**: `estimateTokens()` utility for token counting (1 token ≈ 4 characters)
- **Implemented**: MAX_CONTEXT_TOKENS = 100K, MAX_MESSAGE_TOKENS = 50K safety buffers
- **Enhanced**: CSV sampling for large files to handle OpenAI's message limits
- **Improved**: Intelligent conversation history management

#### Chart Generation

- **Fixed**: SVG rendering issues caused by malformed XML attributes
- **Enhanced**: Cross-platform font compatibility
- **Improved**: Accessibility with proper font sizing and contrast
- **Added**: Professional styling consistent with system UI conventions

### 🐛 Bug Fixes

- **Fixed**: Follow-up questions displaying raw JSON instead of formatted responses
- **Resolved**: SVG charts showing as broken images due to font-family syntax errors
- **Corrected**: Token overflow issues causing 3.8M token context overflows
- **Fixed**: UI presentation showing filenames instead of complete analysis summaries

### 📊 Performance Improvements

- **Optimized**: Token usage with intelligent conversation trimming
- **Enhanced**: CSV processing with sampling for large datasets
- **Improved**: Streaming performance with event buffering
- **Reduced**: Memory usage through better session management

### 🎨 UI/UX Enhancements

- **Enhanced**: Chart typography with professional font stack
- **Improved**: Follow-up question user experience with clean formatted responses
- **Added**: Consistent visual hierarchy across all chart text elements
- **Enhanced**: Cross-platform rendering with system fonts

### 🔒 Architecture Changes

- **Migrated**: From Assistant API threads to session-based conversations
- **Implemented**: Structured JSON schema outputs with strict validation
- **Enhanced**: Event-driven frontend with proper type handling
- **Added**: Comprehensive error categorization and handling

### 📝 Documentation Updates

- **Updated**: Memory bank with recent session improvements
- **Enhanced**: README with current architecture and features
- **Added**: Comprehensive changelog for version tracking
- **Improved**: Code comments and technical documentation

### ⚡ Developer Experience

- **Enhanced**: Error logging with structured output parsing details
- **Improved**: Debug information for streaming events
- **Added**: Comprehensive test coverage for new features
- **Enhanced**: Development workflow with proper linting and formatting

---

## Previous Versions

### [1.0.0] - 2025-09-25

- Initial production release
- OpenAI Assistant API integration
- Basic CSV analysis capabilities
- File upload and processing
- Initial chart generation
- Session management system

---

**Migration Notes**: Version 2.0.0 introduces breaking changes with the API migration. The new system provides better reliability, performance, and user experience while maintaining backward compatibility for data processing workflows.
