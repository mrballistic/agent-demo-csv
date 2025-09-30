/**
 * Security Agent
 *
 * Comprehensive security analysis agent that detects PII, assesses compliance,
 * and provides redaction capabilities for data protection.
 */

import { BaseAgent } from './base';
import { AgentResult, AgentExecutionContext, AgentType } from './types';
import {
  PIIDetector,
  PIIDetectionResult,
  PIIType,
  piiDetector,
} from './utils/pii-detector';
import { DataRedactor, dataRedactor } from './utils/redaction';
import {
  ComplianceManager,
  ComplianceAssessment,
  complianceManager,
} from './utils/compliance';

export interface SecurityAgentInput {
  data: Record<string, string[]>; // Column name -> sample values
  sessionId: string;
  processingPurpose?: string;
  userConsent?: boolean;
  options?: {
    enableRedaction?: boolean;
    redactionOptions?: {
      preserveFormat?: boolean;
      showPartial?: boolean;
      useSemanticPlaceholders?: boolean;
    };
    complianceCheck?: boolean;
    auditLogging?: boolean;
  };
}

export interface SecurityAnalysisResult {
  piiDetections: Map<string, PIIDetectionResult>;
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    criticalColumns: string[];
    recommendations: string[];
  };
  complianceAssessments: ComplianceAssessment[];
  redactionReport?:
    | {
        redactedData: Record<string, string[]>;
        columnsRedacted: string[];
        totalValuesRedacted: number;
        averageUtilityPreserved: number;
      }
    | undefined;
  auditActions: Array<{
    action: string;
    description: string;
    timestamp: string;
  }>;
  metadata: {
    processingTime: number;
    columnsAnalyzed: number;
    piiColumnsFound: number;
    complianceRegulations: number;
  };
}

export class SecurityAgent extends BaseAgent<
  SecurityAgentInput,
  SecurityAnalysisResult
> {
  readonly type = AgentType.SECURITY;
  readonly name = 'security' as const;
  readonly version = '1.0.0';
  description =
    'PII detection, compliance assessment, and data protection agent';

  private piiDetector: PIIDetector;
  private dataRedactor: DataRedactor;
  private complianceManager: ComplianceManager;

  constructor() {
    super();
    this.piiDetector = piiDetector;
    this.dataRedactor = dataRedactor;
    this.complianceManager = complianceManager;
  }

  protected async executeInternal(
    input: SecurityAgentInput,
    context: AgentExecutionContext
  ): Promise<SecurityAnalysisResult> {
    console.log('🔒 Security Agent: Starting security analysis');

    // Validate input
    if (!input.data || Object.keys(input.data).length === 0) {
      throw new Error('No data provided for security analysis');
    }

    const options = {
      enableRedaction: false,
      complianceCheck: true,
      auditLogging: true,
      redactionOptions: {
        preserveFormat: true,
        showPartial: true,
        useSemanticPlaceholders: true,
      },
      ...input.options,
    };

    // Step 1: PII Detection
    console.log('🔍 Detecting PII in dataset...');
    const columns = Object.entries(input.data).map(([name, values]) => ({
      name,
      sampleValues: values.slice(0, 100), // Limit for performance
    }));

    const piiDetections = this.piiDetector.analyzeDataset(columns);
    console.log(`Found PII in ${piiDetections.size} columns`);

    // Step 2: Risk Assessment
    const riskAssessment = this.assessDataRisk(piiDetections);

    // Step 3: Compliance Assessment
    let complianceAssessments: ComplianceAssessment[] = [];
    if (options.complianceCheck) {
      console.log('⚖️ Assessing compliance requirements...');
      complianceAssessments =
        this.complianceManager.assessCompliance(piiDetections);
    }

    // Step 4: Data Redaction (if enabled)
    let redactionReport: SecurityAnalysisResult['redactionReport'] = undefined;
    if (options.enableRedaction) {
      console.log('🎭 Applying data redaction...');
      const redactionResult = this.dataRedactor.createRedactedDataset(
        input.data,
        piiDetections,
        options.redactionOptions
      );
      redactionReport = {
        redactedData: redactionResult.redactedData,
        columnsRedacted: redactionResult.redactionReport.columnsRedacted,
        totalValuesRedacted:
          redactionResult.redactionReport.totalPIIValuesRedacted,
        averageUtilityPreserved:
          redactionResult.redactionReport.averageUtilityPreserved,
      };
    }

    // Step 5: Audit Logging
    const auditActions: Array<{
      action: string;
      description: string;
      timestamp: string;
    }> = [];

    if (options.auditLogging) {
      const piiTypes = Array.from(piiDetections.values()).map(
        detection => detection.type
      );

      this.complianceManager.logDataProcessing({
        sessionId: input.sessionId,
        dataTypes: piiTypes,
        processingPurpose: input.processingPurpose || 'Data analysis',
        userConsent: input.userConsent || false,
        actions: complianceAssessments.flatMap(
          assessment => assessment.auditActions
        ),
      });

      // Collect audit actions
      auditActions.push(
        ...complianceAssessments.flatMap(assessment =>
          assessment.auditActions.map(action => ({
            action: action.action,
            description: action.description,
            timestamp: action.timestamp,
          }))
        )
      );
    }

    // Compile results
    const processingTime = Math.max(
      Date.now() - context.startTime.getTime(),
      1
    );
    const result: SecurityAnalysisResult = {
      piiDetections,
      riskAssessment,
      complianceAssessments,
      redactionReport,
      auditActions,
      metadata: {
        processingTime,
        columnsAnalyzed: columns.length,
        piiColumnsFound: piiDetections.size,
        complianceRegulations: complianceAssessments.length,
      },
    };

    console.log(
      `✅ Security analysis completed: ${piiDetections.size} PII columns, ${complianceAssessments.length} compliance regulations`
    );

    return result;
  }

  /**
   * Assess overall data risk based on PII detections
   */
  private assessDataRisk(piiDetections: Map<string, PIIDetectionResult>): {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    criticalColumns: string[];
    recommendations: string[];
  } {
    const detections = Array.from(piiDetections.entries());
    const criticalColumns: string[] = [];
    const recommendations: string[] = [];

    // Categorize columns by risk
    const criticalTypes = [PIIType.SSN, PIIType.CREDIT_CARD, PIIType.PASSPORT];
    const highRiskTypes = [PIIType.EMAIL, PIIType.PHONE, PIIType.DATE_OF_BIRTH];

    let criticalCount = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;

    for (const [columnName, detection] of detections) {
      if (detection.confidence > 0.7) {
        if (criticalTypes.includes(detection.type)) {
          criticalCount++;
          criticalColumns.push(columnName);
        } else if (highRiskTypes.includes(detection.type)) {
          highRiskCount++;
        } else {
          mediumRiskCount++;
        }
      }
    }

    // Determine overall risk
    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    if (criticalCount > 0) {
      overallRisk = 'critical';
      recommendations.push(
        'Immediately implement data redaction for critical PII types'
      );
      recommendations.push('Review data access controls and audit logs');
      recommendations.push('Consider data minimization strategies');
    } else if (highRiskCount > 2) {
      overallRisk = 'high';
      recommendations.push('Implement comprehensive PII protection measures');
      recommendations.push('Regular compliance audits recommended');
    } else if (highRiskCount > 0 || mediumRiskCount > 3) {
      overallRisk = 'medium';
      recommendations.push('Consider implementing data redaction policies');
      recommendations.push('Review data retention policies');
    } else {
      overallRisk = 'low';
      recommendations.push('Maintain current security practices');
    }

    // Add general recommendations
    if (detections.length > 0) {
      recommendations.push('Document data processing activities');
      recommendations.push('Implement regular security assessments');
      recommendations.push('Train personnel on data protection practices');
    }

    return {
      overallRisk,
      criticalColumns,
      recommendations,
    };
  }

  /**
   * Validate input data
   */
  validateInput(input: SecurityAgentInput): boolean {
    try {
      if (!input.sessionId || input.sessionId.trim().length === 0) {
        return false;
      }

      if (!input.data || typeof input.data !== 'object') {
        return false;
      }

      const entries = Object.entries(input.data);
      if (entries.length === 0) {
        return false;
      }

      // Validate each column has sample data
      for (const [columnName, values] of entries) {
        if (!Array.isArray(values)) {
          return false;
        }
        if (values.length === 0) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}
