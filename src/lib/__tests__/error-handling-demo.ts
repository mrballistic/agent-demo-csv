/**
 * Demonstration script showing the robust error handling system in action
 * This shows how all the components work together: error taxonomy, retries, idempotency, and telemetry
 */

import {
  AppError,
  ErrorFactory,
  ErrorType,
  RetryHandler,
  classifyError,
  createErrorTelemetry,
  defaultRetryHandler,
} from '../error-handler';
import { telemetryService, Telemetry } from '../telemetry';
import {
  idempotencyStore,
  withIdempotency,
  getIdempotencyKey,
  validateIdempotencyKey,
} from '../idempotency';

// Demo function that simulates various error scenarios
async function simulateAnalysisRequest(
  scenario:
    | 'success'
    | 'rate_limit'
    | 'timeout'
    | 'quota_exceeded'
    | 'invalid_file',
  attempt: number = 1
): Promise<{ success: boolean; data?: any }> {
  console.log(`\n🔄 Attempt ${attempt}: Simulating ${scenario} scenario...`);

  switch (scenario) {
    case 'success':
      if (attempt <= 2) {
        // Fail first 2 attempts, succeed on 3rd
        throw new Error('Rate limit exceeded (429)');
      }
      return { success: true, data: 'Analysis completed successfully' };

    case 'rate_limit':
      throw new Error('Rate limit exceeded. Please retry after 60 seconds.');

    case 'timeout':
      throw new Error('Request timed out after 30 seconds');

    case 'quota_exceeded':
      throw new Error('Insufficient quota available');

    case 'invalid_file':
      throw ErrorFactory.fileTooLarge(100 * 1024 * 1024);

    default:
      throw new Error('Unknown scenario');
  }
}

// Demo function showing the complete error handling flow
async function demonstrateErrorHandling() {
  console.log('🚀 Error Handling System Demonstration\n');
  console.log('='.repeat(50));

  // Clear previous data
  telemetryService.clearEvents();
  idempotencyStore.clear();

  // 1. Demonstrate successful retry scenario
  console.log('\n📋 1. SUCCESSFUL RETRY SCENARIO');
  console.log('-'.repeat(30));

  try {
    let attemptCount = 0;
    const result = await defaultRetryHandler.executeWithRetry(async () => {
      attemptCount++;
      return await simulateAnalysisRequest('success', attemptCount);
    }, 'demo_analysis');

    console.log('✅ Success after retries:', result);
  } catch (error) {
    console.log('❌ Failed:', error);
  }

  // 2. Demonstrate error classification and telemetry
  console.log('\n📋 2. ERROR CLASSIFICATION & TELEMETRY');
  console.log('-'.repeat(40));

  const errorScenarios = [
    'rate_limit',
    'timeout',
    'quota_exceeded',
    'invalid_file',
  ] as const;

  for (const scenario of errorScenarios) {
    try {
      await simulateAnalysisRequest(scenario);
    } catch (error) {
      const appError = classifyError(error);
      const telemetry = createErrorTelemetry(appError, `demo_${scenario}`);

      telemetryService.logError(telemetry, {
        sessionId: `session_${scenario}`,
        endpoint: '/api/demo',
      });

      console.log(`📊 ${scenario}:`, {
        type: appError.type,
        errorClass: appError.errorClass,
        retryable: appError.retryable,
        suggestedAction: appError.suggestedAction,
      });
    }
  }

  // 3. Demonstrate idempotency
  console.log('\n📋 3. IDEMPOTENCY DEMONSTRATION');
  console.log('-'.repeat(30));

  const idempotencyKey = 'demo-key-123';
  let callCount = 0;

  const idempotentOperation = async () => {
    callCount++;
    console.log(`🔄 Operation called (attempt ${callCount})`);

    if (callCount === 1) {
      throw ErrorFactory.openaiRateLimit(30);
    }
    return { success: true, timestamp: Date.now() };
  };

  // First call - should fail and not be cached
  try {
    await withIdempotency(idempotentOperation, idempotencyKey);
  } catch (error) {
    console.log(
      '❌ First call failed (not cached):',
      (error as AppError).message
    );
  }

  // Second call - should succeed and be cached
  try {
    const result1 = await withIdempotency(idempotentOperation, idempotencyKey);
    console.log('✅ Second call succeeded:', result1);

    // Third call - should return cached result
    const result2 = await withIdempotency(idempotentOperation, idempotencyKey);
    console.log('🎯 Third call returned cached result:', result2);
    console.log(`📈 Total operation calls: ${callCount} (should be 2)`);
  } catch (error) {
    console.log('❌ Unexpected error:', error);
  }

  // 4. Show telemetry statistics
  console.log('\n📋 4. TELEMETRY STATISTICS');
  console.log('-'.repeat(25));

  const errorStats = telemetryService.getErrorStats();
  console.log('📊 Error Statistics:', {
    totalErrors: errorStats.totalErrors,
    retryableErrors: errorStats.retryableErrors,
    errorsByType: errorStats.errorsByType,
    topErrorClasses: Object.entries(errorStats.errorsByClass)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
  });

  // 5. Demonstrate idempotency key validation
  console.log('\n📋 5. IDEMPOTENCY KEY VALIDATION');
  console.log('-'.repeat(35));

  const testKeys = [
    'valid-key-123',
    'invalid key with spaces',
    'valid_underscore_key',
    'invalid@symbols#here',
    'a'.repeat(300), // Too long
  ];

  testKeys.forEach(key => {
    const isValid = validateIdempotencyKey(key);
    console.log(
      `${isValid ? '✅' : '❌'} "${key.length > 50 ? key.substring(0, 50) + '...' : key}": ${isValid ? 'VALID' : 'INVALID'}`
    );
  });

  // 6. Show audit trail
  console.log('\n📋 6. AUDIT TRAIL');
  console.log('-'.repeat(15));

  const auditEvents = telemetryService.getAuditEvents();
  console.log(`📝 Total audit events: ${auditEvents.length}`);

  if (auditEvents.length > 0) {
    console.log('📋 Recent events:');
    auditEvents.slice(-3).forEach((event, index) => {
      console.log(`  ${index + 1}. ${event.data.action} at ${event.timestamp}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Error Handling System Demo Complete!');
  console.log('✅ All components working together seamlessly');
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateErrorHandling().catch(console.error);
}

export { demonstrateErrorHandling };
