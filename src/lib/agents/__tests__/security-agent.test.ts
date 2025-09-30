/**
 * Security Agent Tests
 *
 * Comprehensive test suite for the SecurityAgent that validates PII detection,
 * compliance assessment, and data redaction functionality.
 */

import { SecurityAgent } from '../security-agent';
import { AgentType, AgentExecutionContext } from '../types';
import { PIIType } from '../utils/pii-detector';

describe('SecurityAgent', () => {
  let securityAgent: SecurityAgent;
  let mockContext: AgentExecutionContext;

  beforeEach(() => {
    securityAgent = new SecurityAgent();
    mockContext = {
      requestId: 'test-request-123',
      userId: 'test-user',
      sessionId: 'test-session',
      startTime: new Date(),
      timeout: 30000,
    };
  });

  describe('Basic Agent Functionality', () => {
    it('should have correct agent properties', () => {
      expect(securityAgent.type).toBe(AgentType.SECURITY);
      expect(securityAgent.name).toBe('security');
      expect(securityAgent.version).toBe('1.0.0');
      expect(securityAgent.description).toContain('PII detection');
    });

    it('should validate input correctly', () => {
      const validInput = {
        data: {
          email: ['test@example.com', 'user@domain.org'],
          name: ['John Doe', 'Jane Smith'],
        },
        sessionId: 'test-session',
      };

      expect(securityAgent.validateInput(validInput)).toBe(true);
    });

    it('should reject invalid input', () => {
      const invalidInput = {
        data: {},
        sessionId: '',
      };

      expect(securityAgent.validateInput(invalidInput)).toBe(false);
    });

    it('should report healthy status', async () => {
      const health = await securityAgent.getHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('metrics');
    });
  });

  describe('PII Detection', () => {
    it('should detect email PII in data', async () => {
      const input = {
        data: {
          email_column: ['test@example.com', 'user@domain.org'],
          safe_column: ['Product A', 'Product B'],
        },
        sessionId: 'test-session',
        options: {
          enableRedaction: false,
          complianceCheck: false,
          auditLogging: false,
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.piiDetections.size).toBeGreaterThan(0);

      const emailDetection = result.data!.piiDetections.get('email_column');
      expect(emailDetection).toBeDefined();
      expect(emailDetection!.type).toBe(PIIType.EMAIL);
      expect(emailDetection!.confidence).toBeGreaterThan(0.7);
    });

    it('should detect multiple PII types', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
          phone: ['555-123-4567'],
          ssn: ['123-45-6789'],
          name: ['John Doe'],
        },
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.piiDetections.size).toBeGreaterThanOrEqual(3);

      // Check for different PII types
      const detectedTypes = Array.from(result.data!.piiDetections.values()).map(
        detection => detection.type
      );
      expect(detectedTypes).toContain(PIIType.EMAIL);
      expect(detectedTypes).toContain(PIIType.PHONE);
      expect(detectedTypes).toContain(PIIType.SSN);
    });

    it('should handle empty or null data gracefully', async () => {
      const input = {
        data: {
          empty_column: [],
        },
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Risk Assessment', () => {
    it('should assess critical risk for sensitive PII', async () => {
      const input = {
        data: {
          ssn: ['123-45-6789', '987-65-4321'],
          credit_card: ['4532-1234-5678-9012'],
        },
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.riskAssessment.overallRisk).toBe('critical');
      expect(
        result.data!.riskAssessment.criticalColumns.length
      ).toBeGreaterThan(0);
      expect(
        result.data!.riskAssessment.recommendations.length
      ).toBeGreaterThan(0);
    });

    it('should assess lower risk for less sensitive PII', async () => {
      const input = {
        data: {
          city: ['New York', 'Los Angeles'],
          age: ['25', '30'],
        },
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(['low', 'medium']).toContain(
        result.data!.riskAssessment.overallRisk
      );
    });
  });

  describe('Compliance Assessment', () => {
    it('should perform compliance assessment when enabled', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
          name: ['John Doe'],
        },
        sessionId: 'test-session',
        options: {
          complianceCheck: true,
          auditLogging: false,
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.complianceAssessments).toBeDefined();
      expect(result.data!.complianceAssessments.length).toBeGreaterThan(0);

      // Check that GDPR assessment is included (since we have email data)
      const gdprAssessment = result.data!.complianceAssessments.find(
        assessment => assessment.regulation === 'GDPR'
      );
      expect(gdprAssessment).toBeDefined();
    });

    it('should skip compliance assessment when disabled', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
        },
        sessionId: 'test-session',
        options: {
          complianceCheck: false,
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.complianceAssessments).toEqual([]);
    });
  });

  describe('Data Redaction', () => {
    it('should redact data when enabled', async () => {
      const input = {
        data: {
          email: ['test@example.com', 'user@domain.org'],
          name: ['John Doe', 'Jane Smith'],
        },
        sessionId: 'test-session',
        options: {
          enableRedaction: true,
          redactionOptions: {
            preserveFormat: true,
            showPartial: false,
            useSemanticPlaceholders: true,
          },
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.redactionReport).toBeDefined();
      expect(result.data!.redactionReport!.redactedData).toBeDefined();
      expect(
        result.data!.redactionReport!.columnsRedacted.length
      ).toBeGreaterThan(0);
      expect(result.data!.redactionReport!.totalValuesRedacted).toBeGreaterThan(
        0
      );
    });

    it('should skip redaction when disabled', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
        },
        sessionId: 'test-session',
        options: {
          enableRedaction: false,
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.redactionReport).toBeUndefined();
    });
  });

  describe('Audit Logging', () => {
    it('should generate audit actions when enabled', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
          ssn: ['123-45-6789'],
        },
        sessionId: 'test-session',
        processingPurpose: 'Data analysis for compliance',
        userConsent: true,
        options: {
          auditLogging: true,
          complianceCheck: true,
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.auditActions).toBeDefined();
      expect(result.data!.auditActions.length).toBeGreaterThan(0);

      // Check audit action structure
      const auditAction = result.data!.auditActions[0];
      expect(auditAction).toHaveProperty('action');
      expect(auditAction).toHaveProperty('description');
      expect(auditAction).toHaveProperty('timestamp');
    });
  });

  describe('Performance and Metadata', () => {
    it('should provide execution metadata', async () => {
      const input = {
        data: {
          test_column: ['value1', 'value2'],
        },
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toBeDefined();
      expect(result.data!.metadata.processingTime).toBeGreaterThan(0);
      expect(result.data!.metadata.columnsAnalyzed).toBe(1);
      expect(result.metrics.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metrics.memoryUsed).toBeGreaterThan(0);
    });

    it('should execute quickly for small datasets', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
          name: ['John Doe'],
        },
        sessionId: 'test-session',
      };

      const startTime = Date.now();
      const result = await securityAgent.execute(input, mockContext);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Error Handling', () => {
    it('should handle missing session ID', async () => {
      const input = {
        data: {
          email: ['test@example.com'],
        },
        sessionId: '',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty data object', async () => {
      const input = {
        data: {},
        sessionId: 'test-session',
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed input gracefully', async () => {
      const input = {
        data: {
          test_column: 'not_an_array', // Should be array
        },
        sessionId: 'test-session',
      } as any;

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle comprehensive security analysis', async () => {
      const input = {
        data: {
          customer_email: ['john@company.com', 'jane@business.org'],
          customer_phone: ['555-123-4567', '555-987-6543'],
          customer_name: ['John Smith', 'Jane Johnson'],
          order_id: ['ORD-001', 'ORD-002'],
          product_name: ['Widget A', 'Widget B'],
          order_date: ['2024-01-15', '2024-01-16'],
        },
        sessionId: 'comprehensive-test',
        processingPurpose: 'Customer analytics and reporting',
        userConsent: true,
        options: {
          enableRedaction: true,
          complianceCheck: true,
          auditLogging: true,
          redactionOptions: {
            preserveFormat: true,
            showPartial: true,
            useSemanticPlaceholders: true,
          },
        },
      };

      const result = await securityAgent.execute(input, mockContext);

      expect(result.success).toBe(true);

      // Validate all components worked
      expect(result.data!.piiDetections.size).toBeGreaterThan(0);
      expect(result.data!.riskAssessment).toBeDefined();
      expect(result.data!.complianceAssessments).toBeDefined();
      expect(result.data!.redactionReport).toBeDefined();
      expect(result.data!.auditActions.length).toBeGreaterThan(0);
      expect(result.data!.metadata.columnsAnalyzed).toBe(6);

      // Should detect PII in email, phone, and name columns
      expect(result.data!.metadata.piiColumnsFound).toBeGreaterThanOrEqual(3);
    });
  });
});
