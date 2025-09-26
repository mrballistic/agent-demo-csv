/**
 * OpenAI Diagnostics - Helper utilities to identify why OpenAI streaming fails
 */

import { assistantManager } from './openai';

export interface DiagnosticResult {
  step: string;
  success: boolean;
  error?: string;
  details?: any;
}

export async function diagnoseOpenAIIssue(
  threadId: string,
  fileId?: string
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  try {
    // Step 1: Check if assistant exists
    console.log('[Diagnostic] Step 1: Check assistant status');
    try {
      await assistantManager.createAssistant();
      results.push({
        step: 'assistant_creation',
        success: true,
        details: { assistantExists: true },
      });
    } catch (error) {
      results.push({
        step: 'assistant_creation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return results; // Can't continue without assistant
    }

    // Step 2: Check thread status
    console.log('[Diagnostic] Step 2: Check thread status');
    try {
      const messages = await assistantManager.getMessages(threadId, 1);
      results.push({
        step: 'thread_access',
        success: true,
        details: { messageCount: messages.length },
      });
    } catch (error) {
      results.push({
        step: 'thread_access',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 3: Check if we can create a simple message (no file)
    console.log('[Diagnostic] Step 3: Test simple message creation');
    try {
      await assistantManager.createMessage(threadId, 'Hello, test message');
      results.push({
        step: 'simple_message',
        success: true,
      });
    } catch (error) {
      results.push({
        step: 'simple_message',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 4: Test file-based message if fileId provided
    if (fileId) {
      console.log('[Diagnostic] Step 4: Test file-based message');
      try {
        await assistantManager.createMessage(
          threadId,
          'Test file message',
          fileId
        );
        results.push({
          step: 'file_message',
          success: true,
          details: { fileId },
        });
      } catch (error) {
        results.push({
          step: 'file_message',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          details: { fileId },
        });
      }
    }

    // Step 5: Test simple run creation (without file)
    console.log('[Diagnostic] Step 5: Test simple run creation');
    try {
      // Create a simple thread for testing
      const testThread = await assistantManager.createThread();
      await assistantManager.createMessage(
        testThread.id,
        'Say hello and explain you are a test assistant.'
      );

      const testRun = await assistantManager.createRun(testThread.id);
      results.push({
        step: 'simple_run_creation',
        success: true,
        details: { runId: testRun.id, status: testRun.status },
      });

      // Wait a moment and check run status
      await new Promise(resolve => setTimeout(resolve, 2000));
      const runStatus = await assistantManager.getRun(
        testThread.id,
        testRun.id
      );
      results.push({
        step: 'simple_run_status',
        success: runStatus.status !== 'failed',
        details: {
          status: runStatus.status,
          error: runStatus.last_error,
        },
      });
    } catch (error) {
      results.push({
        step: 'simple_run_creation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return results;
  } catch (error) {
    console.error('[Diagnostic] Unexpected error:', error);
    results.push({
      step: 'diagnostic_error',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return results;
  }
}

export function logDiagnosticResults(results: DiagnosticResult[]): void {
  console.log('\n=== OpenAI Diagnostic Results ===');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${index + 1}. ${result.step}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.details) {
      console.log(`   Details:`, result.details);
    }
  });
  console.log('=== End Diagnostic ===\n');
}
