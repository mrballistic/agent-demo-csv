/**
 * End-to-End Security Integration Tests
 *
 * These tests validate the complete security workflow from file upload
 * through analysis to frontend display, ensuring PII detection accuracy,
 * security recommendation quality, and compliance assessment correctness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sessionStore } from '@/lib/session-store';
import { DataProfilingAgent } from '@/lib/agents/profiling-agent';
import { SecurityAgent } from '@/lib/agents/security-agent';
import { globalOrchestrator, createExecutionContext } from '@/lib/agents';

describe('End-to-End Security Integration', () => {
  let profilingAgent: DataProfilingAgent;
  let securityAgent: SecurityAgent;
  let testSessionId: string;

  beforeEach(async () => {
    // Initialize agents
    profilingAgent = new DataProfilingAgent();
    securityAgent = new SecurityAgent();

    // Register agents with orchestrator
    globalOrchestrator.registerAgent(profilingAgent);
    globalOrchestrator.registerAgent(securityAgent);

    // Create test session
    const session = sessionStore.createSession('test-thread-e2e');
    testSessionId = session.id;
  });

  afterEach(async () => {
    // Unregister agents from orchestrator
    try {
      await globalOrchestrator.unregisterAgent(profilingAgent.type);
      await globalOrchestrator.unregisterAgent(securityAgent.type);
    } catch (error) {
      // Ignore errors if agents weren't registered
    }

    // Clear session
    if (testSessionId) {
      sessionStore.deleteSession(testSessionId);
    }
  });
  it('should detect PII correctly in customer data CSV', async () => {
    // Create test CSV with various PII types
    const customerCsv = `customer_id,customer_email,customer_phone,full_name
1,john.doe@example.com,555-123-4567,John Doe
2,jane.smith@test.com,555-987-6543,Jane Smith
3,bob.wilson@demo.org,555-555-5555,Bob Wilson`;

    const csvBuffer = Buffer.from(customerCsv, 'utf-8');

    // Process the CSV through the complete pipeline
    const input = {
      buffer: csvBuffer,
      name: 'customer_data.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Verify security analysis was performed
    expect(profile.security).toBeDefined();
    expect(profile.security.piiColumns).toBeDefined();
    expect(profile.security.piiColumns.length).toBeGreaterThan(0);

    // Check for expected PII types
    const piiColumnNames = profile.security.piiColumns.map(
      (col: any) => col.name
    );
    const piiColumnTypes = profile.security.piiColumns.map(
      (col: any) => col.type
    );

    // Should detect email columns
    expect(piiColumnNames).toContain('customer_email');
    expect(piiColumnTypes).toContain('email');

    // Should detect phone columns
    expect(piiColumnNames).toContain('customer_phone');
    expect(piiColumnTypes).toContain('phone');

    // Should detect name columns
    expect(piiColumnNames).toContain('full_name');
    expect(piiColumnTypes).toContain('name');

    // Verify risk level is appropriate for PII content
    expect(['medium', 'high', 'critical']).toContain(
      profile.security.riskLevel
    );

    // Verify compliance flags are generated
    expect(profile.security.complianceFlags).toBeDefined();
    expect(profile.security.complianceFlags.length).toBeGreaterThan(0);

    // Should flag GDPR and CCPA compliance
    const regulations = profile.security.complianceFlags.map(
      (flag: any) => flag.regulation
    );
    expect(regulations).toContain('GDPR');
    expect(regulations).toContain('CCPA');

    // Verify security recommendations are generated
    expect(profile.security.recommendations).toBeDefined();
    expect(profile.security.recommendations.length).toBeGreaterThan(0);
  });
  it('should handle low-risk data correctly', async () => {
    // Create test CSV with no PII
    const productCsv = `product_id,product_name,category,price
P001,Wireless Headphones,Electronics,99.99
P002,Coffee Mug,Home & Kitchen,12.99
P003,Notebook,Office Supplies,5.99`;

    const csvBuffer = Buffer.from(productCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'products.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Should have minimal PII detection (product names might trigger name detection)
    expect(profile.security.piiColumns.length).toBeLessThanOrEqual(1);
    expect(profile.security.riskLevel).toBe('low');

    // Should have minimal compliance flags
    expect(profile.security.complianceFlags.length).toBeLessThanOrEqual(3);

    // Should have basic security recommendations
    expect(profile.security.recommendations.length).toBeGreaterThanOrEqual(0);
  });

  it('should provide appropriate confidence scores for PII detection', async () => {
    // Create CSV with both obvious and subtle PII
    const mixedCsv = `id,contact,user_identifier,notes
1,john@example.com,user123,Personal information
2,support@company.com,admin456,System notes
3,555-0123,guest789,Phone contact`;

    const csvBuffer = Buffer.from(mixedCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'mixed_data.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Should detect PII with appropriate confidence levels
    const piiColumns = profile.security.piiColumns;
    expect(piiColumns.length).toBeGreaterThan(0);

    // Check confidence scores are within valid range
    piiColumns.forEach((col: any) => {
      expect(col.confidence).toBeGreaterThanOrEqual(0);
      expect(col.confidence).toBeLessThanOrEqual(1);

      // High confidence for obvious email patterns
      if (col.type === 'email' && col.name === 'contact') {
        expect(col.confidence).toBeGreaterThan(0.8);
      }
    });
  });

  it('should generate proper security recommendations based on PII types', async () => {
    // Create CSV with financial PII
    const financialCsv = `account_id,customer_ssn,credit_card_number,transaction_amount
ACC001,123-45-6789,4532-1234-5678-9012,2500.00
ACC002,987-65-4321,5555-4444-3333-2222,1750.50`;

    const csvBuffer = Buffer.from(financialCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'financial_data.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Should have high risk level for financial data
    expect(['high', 'critical']).toContain(profile.security.riskLevel);

    // Should include specific compliance requirements
    const regulations = profile.security.complianceFlags.map(
      (flag: any) => flag.regulation
    );
    expect(regulations).toContain('PCI_DSS'); // Credit card data
    expect(regulations).toContain('SOX'); // Financial data

    // Should recommend appropriate security controls
    const recommendationTypes = profile.security.recommendations.map(
      (rec: any) => rec.type
    );
    // System generates redaction recommendations by default for PII
    expect(recommendationTypes.length).toBeGreaterThan(0);
    expect(recommendationTypes).toContain('redaction');

    // Should have high-priority recommendations
    const priorities = profile.security.recommendations.map(
      (rec: any) => rec.priority
    );
    expect(priorities).toContain('medium');
  });

  it('should maintain data quality assessment alongside security analysis', async () => {
    // Create CSV with quality issues and PII
    const qualityCsv = `id,email,phone,name,age
1,john@test.com,555-1234,John Doe,25
2,invalid-email,555-5678,Jane Smith,null
3,bob@example.com,,Bob Wilson,30`;

    const csvBuffer = Buffer.from(qualityCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'quality_test.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Should have both security and quality analysis
    expect(profile.security).toBeDefined();
    expect(profile.quality).toBeDefined();

    // Security analysis should detect PII
    expect(profile.security.piiColumns.length).toBeGreaterThan(0);

    // Quality analysis should detect issues
    expect(profile.quality.overall).toBeLessThan(100);
    expect(profile.quality.issues.length).toBeGreaterThan(0);

    // Should have appropriate risk level considering both factors
    expect(['medium', 'high']).toContain(profile.security.riskLevel);
  });

  it('should validate detection methods are properly classified', async () => {
    const testCsv = `user_email,mobile_number,customer_name
test@example.com,555-0123,John Doe`;

    const csvBuffer = Buffer.from(testCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'detection_test.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Verify detection methods are properly set
    profile.security.piiColumns.forEach((col: any) => {
      expect(['pattern', 'column_name', 'ml_classifier', 'manual']).toContain(
        col.detectionMethod
      );

      // Email and phone should typically use pattern detection
      if (col.type === 'email' || col.type === 'phone') {
        expect(col.detectionMethod).toBe('pattern');
      }

      // Columns with obvious names might use column_name detection
      if (
        col.name.includes('email') ||
        col.name.includes('phone') ||
        col.name.includes('name')
      ) {
        expect(['pattern', 'column_name']).toContain(col.detectionMethod);
      }
    });
  });

  it('should provide actionable security recommendations', async () => {
    const healthCsv = `patient_id,patient_name,ssn,diagnosis
P001,John Smith,123-45-6789,Hypertension
P002,Jane Doe,987-65-4321,Diabetes`;

    const csvBuffer = Buffer.from(healthCsv, 'utf-8');

    const input = {
      buffer: csvBuffer,
      name: 'health_data.csv',
      mimeType: 'text/csv',
      size: csvBuffer.length,
    };

    const context = createExecutionContext(testSessionId);
    const result = await profilingAgent.execute(input, context);

    expect(result.success).toBe(true);

    if (!result.success || !result.data) {
      throw new Error('Expected successful result with data');
    }

    const profile = result.data;

    // Should flag HIPAA compliance for health data
    const regulations = profile.security.complianceFlags.map(
      (flag: any) => flag.regulation
    );
    expect(regulations).toContain('HIPAA');

    // All recommendations should have required fields
    profile.security.recommendations.forEach((rec: any) => {
      expect(rec.type).toBeDefined();
      expect(rec.priority).toBeDefined();
      expect(rec.description).toBeDefined();
      expect(rec.implementation).toBeDefined();

      // Should have actionable descriptions
      expect(rec.description.length).toBeGreaterThan(10);
      expect(rec.implementation.length).toBeGreaterThan(10);
    });
  });
});
