# Profiling Workflow Implementation

This document describes the implementation of Task 9: "Profiling workflow with streaming" from the AI Data Analyst Demo specification.

## Overview

The profiling workflow enables users to upload CSV files and receive automated data analysis with real-time streaming updates. The implementation includes:

1. **POST /api/analysis/profile** - Initiates profiling analysis
2. **GET /api/runs/:threadId/stream** - Server-Sent Events for real-time updates
3. **GET /api/artifacts/:id/download** - Download generated artifacts
4. Artifact creation and manifest parsing
5. Session and file management with TTL cleanup

## API Endpoints

### POST /api/analysis/profile

Initiates a profiling analysis for an uploaded CSV file.

**Request:**

```json
{
  "fileId": "string",
  "sessionId": "string" // optional
}
```

**Response:**

```json
{
  "runId": "run_abc123",
  "threadId": "thread_xyz789",
  "sessionId": "session_def456",
  "status": "queued"
}
```

### GET /api/runs/:threadId/stream

Server-Sent Events endpoint providing real-time updates during analysis.

**Events:**

- `connection.established` - Initial connection
- `run.started` - Analysis begins
- `run.in_progress` - Analysis running
- `message.delta` - Streaming text updates
- `message.completed` - Message finished
- `artifact.created` - New file generated
- `run.completed` - Analysis finished
- `run.failed` - Analysis error
- `error` - Connection error

**Example Event:**

```json
{
  "type": "artifact.created",
  "data": {
    "artifactId": "file_123",
    "filename": "profile_summary_2024-12-01.md",
    "type": "file",
    "purpose": "profile",
    "downloadUrl": "/api/artifacts/file_123/download"
  },
  "timestamp": 1701234567890
}
```

### GET /api/artifacts/:id/download

Downloads generated artifacts with proper headers and integrity checks.

**Features:**

- Content-Type detection
- ETag caching
- Integrity verification
- Proper download headers

## Implementation Details

### Session Management

- **Rolling TTL**: 24-hour sessions with activity-based renewal
- **Automatic Cleanup**: Expired sessions removed every 30 minutes
- **Metrics Tracking**: Upload counts, analysis runs, artifacts generated

### File Storage

- **Temporary Storage**: Files stored in `/tmp/analyst-demo` by default
- **Versioning**: Timestamped filenames prevent conflicts
- **Integrity**: SHA-256 checksums for all files
- **Cleanup**: Automatic removal after 24 hours

### OpenAI Integration

- **Dual Mode**: Real OpenAI API when key available, simulation otherwise
- **Streaming**: Real-time updates via Server-Sent Events
- **Manifest Parsing**: Extracts structured results from assistant output
- **Error Handling**: Graceful fallbacks and retry logic

### Artifact Generation

The system generates several types of artifacts:

1. **Profile Summary** (`profile_summary_YYYY-MM-DD.md`)
   - Dataset overview and statistics
   - Column analysis and data quality
   - PII detection results
   - Suggested next analyses

2. **Charts** (`chart_YYYY-MM-DD.png`) - When analysis includes visualizations
3. **Cleaned Data** (`cleaned_data_YYYY-MM-DD.csv`) - When data transformation occurs

## Testing

The implementation includes comprehensive tests:

- **Unit Tests**: Core functionality (session store, file store, OpenAI integration)
- **Integration Tests**: API endpoints and workflows
- **Demo Script**: End-to-end workflow demonstration

Run tests:

```bash
npm test -- --run src/lib/__tests__/profiling-workflow.test.ts
npm test -- --run src/lib/__tests__/profiling-api.test.ts
```

Run demo:

```bash
npx tsx src/lib/__tests__/profiling-demo.ts
```

## Configuration

### Environment Variables

```bash
# Required for real OpenAI integration
OPENAI_API_KEY=your_openai_api_key_here

# Optional configuration
APP_URL=http://localhost:3000
LOG_LEVEL=info
NODE_OPTIONS=--max-old-space-size=4096
```

### File Storage

Default storage location: `/tmp/analyst-demo`

Customize via FileStore constructor:

```typescript
const fileStore = new FileStore('/custom/path');
```

## Security Features

- **File Validation**: CSV format and size limits (50MB)
- **PII Detection**: Automatic identification and flagging
- **Integrity Checks**: SHA-256 checksums for all files
- **TTL Cleanup**: Automatic data expiration
- **Content Headers**: Proper MIME types and security headers

## Performance Considerations

- **Streaming**: Real-time updates reduce perceived latency
- **Caching**: ETag support for artifact downloads
- **Cleanup**: Automatic removal of expired data
- **Memory**: In-memory storage suitable for demo/prototype use

## Error Handling

The system provides detailed error categorization:

- **Validation Errors**: Invalid file format or size
- **API Errors**: OpenAI service issues
- **Timeout Errors**: Analysis taking too long
- **System Errors**: Internal server problems

Each error includes:

- Clear user-friendly message
- Suggested corrective action
- Retry guidance when applicable

## Next Steps

This implementation satisfies the requirements for Task 9. The next tasks in the specification are:

- **Task 10**: Chat interface with live updates
- **Task 11**: Analysis suggestions and quick actions
- **Task 12**: Run execution with progress tracking

The profiling workflow provides the foundation for these subsequent features.

## DoD Verification

✅ **POST /api/analysis/profile route** - Creates thread, message with CSV attachment, run  
✅ **GET /api/runs/:threadId/stream SSE endpoint** - Emits run._ + message._ events  
✅ **Server-side artifact.created events** - When parsing new files  
✅ **Handle code cell saving** - /mnt/data/summary.md and manifest printing  
✅ **Chat shows "Profile created" + insight** - Via streaming events  
✅ **Artifacts panel shows summary.md** - Via artifact.created events

All requirements (2.1, 2.2, 3.1, 3.2, 6.1, 6.2, 6.3) have been addressed in the implementation.
