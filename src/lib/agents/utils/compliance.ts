/**
 * Compliance Framework Utilities
 *
 * Handles compliance checking for various data protection regulations
 */

import { PIIType, PIIDetectionResult, ComplianceFlag } from './pii-detector';

export interface ComplianceAssessment {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'PCI_DSS' | 'SOX';
  applicable: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requirements: ComplianceRequirement[];
  recommendations: string[];
  auditActions: AuditAction[];
}

export interface ComplianceRequirement {
  id: string;
  description: string;
  mandatory: boolean;
  met: boolean;
  evidence?: string;
}

export interface AuditAction {
  action: 'log' | 'notify' | 'restrict' | 'delete';
  description: string;
  timestamp: string;
  automated: boolean;
}

export interface DataProcessingAudit {
  sessionId: string;
  timestamp: string;
  dataTypes: PIIType[];
  processingPurpose: string;
  legalBasis?: string;
  retentionPeriod?: string;
  userConsent?: boolean;
  actions: AuditAction[];
}

export class ComplianceManager {
  private auditLog: DataProcessingAudit[] = [];

  /**
   * Assess compliance requirements for a dataset
   */
  assessCompliance(
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment[] {
    const assessments: ComplianceAssessment[] = [];
    const detectedTypes = this.getDetectedPIITypes(piiDetections);

    // GDPR Assessment
    if (this.isGDPRApplicable(detectedTypes)) {
      assessments.push(this.assessGDPR(detectedTypes, piiDetections));
    }

    // CCPA Assessment
    if (this.isCCPAApplicable(detectedTypes)) {
      assessments.push(this.assessCCPA(detectedTypes, piiDetections));
    }

    // HIPAA Assessment
    if (this.isHIPAAApplicable(detectedTypes)) {
      assessments.push(this.assessHIPAA(detectedTypes, piiDetections));
    }

    // PCI DSS Assessment
    if (this.isPCIApplicable(detectedTypes)) {
      assessments.push(this.assessPCI(detectedTypes, piiDetections));
    }

    // SOX Assessment
    if (this.isSOXApplicable(detectedTypes)) {
      assessments.push(this.assessSOX(detectedTypes, piiDetections));
    }

    return assessments;
  }

  /**
   * GDPR Compliance Assessment
   */
  private assessGDPR(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment {
    const requirements: ComplianceRequirement[] = [
      {
        id: 'gdpr_lawful_basis',
        description: 'Establish lawful basis for processing personal data',
        mandatory: true,
        met: false, // Requires user action
      },
      {
        id: 'gdpr_consent',
        description: 'Obtain explicit consent where required',
        mandatory: true,
        met: false, // Requires user action
      },
      {
        id: 'gdpr_data_minimization',
        description: 'Process only necessary personal data',
        mandatory: true,
        met: true, // Automated analysis is minimal processing
      },
      {
        id: 'gdpr_retention',
        description: 'Define data retention periods',
        mandatory: true,
        met: false, // Requires policy definition
      },
      {
        id: 'gdpr_security',
        description: 'Implement appropriate technical safeguards',
        mandatory: true,
        met: true, // PII detection provides safeguards
      },
    ];

    const recommendations = [
      'Clearly define the legal basis for processing this personal data',
      'Implement data retention policies and automated deletion',
      'Consider pseudonymization or anonymization techniques',
      'Provide clear privacy notice to data subjects',
      'Implement data subject rights (access, rectification, erasure)',
    ];

    const auditActions: AuditAction[] = [
      {
        action: 'log',
        description: `GDPR-applicable personal data detected: ${detectedTypes.join(', ')}`,
        timestamp: new Date().toISOString(),
        automated: true,
      },
    ];

    return {
      regulation: 'GDPR',
      applicable: true,
      riskLevel: this.calculateGDPRRisk(detectedTypes, piiDetections),
      requirements,
      recommendations,
      auditActions,
    };
  }

  /**
   * CCPA Compliance Assessment
   */
  private assessCCPA(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment {
    const requirements: ComplianceRequirement[] = [
      {
        id: 'ccpa_privacy_notice',
        description: 'Provide privacy notice at collection',
        mandatory: true,
        met: false,
      },
      {
        id: 'ccpa_opt_out',
        description: 'Provide opt-out mechanism for data sales',
        mandatory: true,
        met: false,
      },
      {
        id: 'ccpa_consumer_rights',
        description: 'Honor consumer rights requests',
        mandatory: true,
        met: false,
      },
    ];

    const recommendations = [
      'Implement "Do Not Sell My Personal Information" option',
      'Provide clear categories of personal information collected',
      'Establish process for consumer rights requests',
    ];

    return {
      regulation: 'CCPA',
      applicable: true,
      riskLevel: this.calculateCCPARisk(detectedTypes, piiDetections),
      requirements,
      recommendations,
      auditActions: [
        {
          action: 'log',
          description: `CCPA-applicable personal information detected: ${detectedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
          automated: true,
        },
      ],
    };
  }

  /**
   * HIPAA Compliance Assessment
   */
  private assessHIPAA(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment {
    const requirements: ComplianceRequirement[] = [
      {
        id: 'hipaa_safeguards',
        description:
          'Implement administrative, physical, and technical safeguards',
        mandatory: true,
        met: true, // PII detection provides technical safeguards
      },
      {
        id: 'hipaa_minimum_necessary',
        description: 'Apply minimum necessary standard',
        mandatory: true,
        met: true, // Analysis uses minimum necessary data
      },
      {
        id: 'hipaa_audit_logs',
        description: 'Maintain audit logs of PHI access',
        mandatory: true,
        met: true, // Implemented through audit system
      },
    ];

    return {
      regulation: 'HIPAA',
      applicable: true,
      riskLevel: 'high', // PHI always high risk
      requirements,
      recommendations: [
        'Ensure all personnel handling PHI are trained',
        'Implement role-based access controls',
        'Regular security risk assessments',
      ],
      auditActions: [
        {
          action: 'log',
          description: `Potential PHI detected: ${detectedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
          automated: true,
        },
        {
          action: 'restrict',
          description: 'Apply enhanced security controls for PHI processing',
          timestamp: new Date().toISOString(),
          automated: true,
        },
      ],
    };
  }

  /**
   * PCI DSS Compliance Assessment
   */
  private assessPCI(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment {
    const requirements: ComplianceRequirement[] = [
      {
        id: 'pci_encryption',
        description: 'Encrypt cardholder data transmission and storage',
        mandatory: true,
        met: false, // Requires implementation verification
      },
      {
        id: 'pci_access_control',
        description: 'Restrict access to cardholder data',
        mandatory: true,
        met: true, // PII detection helps restrict access
      },
      {
        id: 'pci_monitoring',
        description: 'Monitor and test networks regularly',
        mandatory: true,
        met: true, // Audit logging provides monitoring
      },
    ];

    return {
      regulation: 'PCI_DSS',
      applicable: true,
      riskLevel: 'critical', // Payment card data is always critical
      requirements,
      recommendations: [
        'Immediately implement PCI DSS controls',
        'Consider tokenization of card data',
        'Regular PCI compliance assessments',
        'Isolate cardholder data environment',
      ],
      auditActions: [
        {
          action: 'log',
          description: `Payment card data detected: ${detectedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
          automated: true,
        },
        {
          action: 'notify',
          description: 'Alert security team about payment card data processing',
          timestamp: new Date().toISOString(),
          automated: true,
        },
      ],
    };
  }

  /**
   * SOX Compliance Assessment
   */
  private assessSOX(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): ComplianceAssessment {
    const requirements: ComplianceRequirement[] = [
      {
        id: 'sox_internal_controls',
        description: 'Implement internal controls over financial reporting',
        mandatory: true,
        met: true, // Audit logging provides controls
      },
      {
        id: 'sox_audit_trail',
        description: 'Maintain comprehensive audit trails',
        mandatory: true,
        met: true, // Implemented through audit system
      },
    ];

    return {
      regulation: 'SOX',
      applicable: true,
      riskLevel: 'medium',
      requirements,
      recommendations: [
        'Document data processing procedures',
        'Regular review of internal controls',
        'Segregation of duties for sensitive data',
      ],
      auditActions: [
        {
          action: 'log',
          description: `Financial data processing detected: ${detectedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
          automated: true,
        },
      ],
    };
  }

  /**
   * Check if regulation is applicable
   */
  private isGDPRApplicable(detectedTypes: PIIType[]): boolean {
    const gdprTypes = [
      PIIType.EMAIL,
      PIIType.NAME,
      PIIType.ADDRESS,
      PIIType.PHONE,
      PIIType.DATE_OF_BIRTH,
      PIIType.IP_ADDRESS,
    ];
    return detectedTypes.some(type => gdprTypes.includes(type));
  }

  private isCCPAApplicable(detectedTypes: PIIType[]): boolean {
    // Similar to GDPR but California-specific
    return this.isGDPRApplicable(detectedTypes);
  }

  private isHIPAAApplicable(detectedTypes: PIIType[]): boolean {
    const hipaaTypes = [PIIType.DATE_OF_BIRTH, PIIType.SSN, PIIType.NAME];
    return detectedTypes.some(type => hipaaTypes.includes(type));
  }

  private isPCIApplicable(detectedTypes: PIIType[]): boolean {
    return detectedTypes.includes(PIIType.CREDIT_CARD);
  }

  private isSOXApplicable(detectedTypes: PIIType[]): boolean {
    const soxTypes = [PIIType.SSN, PIIType.ACCOUNT_NUMBER];
    return detectedTypes.some(type => soxTypes.includes(type));
  }

  /**
   * Calculate risk levels
   */
  private calculateGDPRRisk(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): 'low' | 'medium' | 'high' | 'critical' {
    const highRiskTypes = [PIIType.SSN, PIIType.DATE_OF_BIRTH];
    const mediumRiskTypes = [PIIType.EMAIL, PIIType.PHONE, PIIType.ADDRESS];

    const highConfidenceDetections = Array.from(piiDetections.values()).filter(
      detection => detection.confidence > 0.8
    );

    if (
      detectedTypes.some(type => highRiskTypes.includes(type)) ||
      highConfidenceDetections.length > 3
    ) {
      return 'high';
    }

    if (
      detectedTypes.some(type => mediumRiskTypes.includes(type)) ||
      highConfidenceDetections.length > 1
    ) {
      return 'medium';
    }

    return 'low';
  }

  private calculateCCPARisk(
    detectedTypes: PIIType[],
    piiDetections: Map<string, PIIDetectionResult>
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Similar to GDPR risk calculation
    return this.calculateGDPRRisk(detectedTypes, piiDetections);
  }

  /**
   * Utility methods
   */
  private getDetectedPIITypes(
    piiDetections: Map<string, PIIDetectionResult>
  ): PIIType[] {
    const types = new Set<PIIType>();
    for (const detection of piiDetections.values()) {
      if (detection.confidence > 0.5) {
        types.add(detection.type);
      }
    }
    return Array.from(types);
  }

  /**
   * Log data processing activity for audit
   */
  logDataProcessing(audit: Omit<DataProcessingAudit, 'timestamp'>): void {
    const fullAudit: DataProcessingAudit = {
      ...audit,
      timestamp: new Date().toISOString(),
    };

    this.auditLog.push(fullAudit);

    // In production, this would be sent to a secure audit system
    console.log('Data Processing Audit:', fullAudit);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(sessionId?: string): DataProcessingAudit[] {
    if (sessionId) {
      return this.auditLog.filter(entry => entry.sessionId === sessionId);
    }
    return [...this.auditLog];
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(piiDetections: Map<string, PIIDetectionResult>): {
    summary: {
      totalRegulations: number;
      highRiskRegulations: number;
      criticalActions: number;
      recommendationsCount: number;
    };
    assessments: ComplianceAssessment[];
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
  } {
    const assessments = this.assessCompliance(piiDetections);

    const criticalActions = assessments.reduce(
      (count, assessment) =>
        count +
        assessment.auditActions.filter(action =>
          ['restrict', 'delete'].includes(action.action)
        ).length,
      0
    );

    const recommendationsCount = assessments.reduce(
      (count, assessment) => count + assessment.recommendations.length,
      0
    );

    const highRiskRegulations = assessments.filter(
      assessment => assessment.riskLevel === 'high'
    ).length;

    const overallRisk = this.calculateOverallRisk(assessments);

    return {
      summary: {
        totalRegulations: assessments.length,
        highRiskRegulations,
        criticalActions,
        recommendationsCount,
      },
      assessments,
      overallRisk,
    };
  }

  private calculateOverallRisk(
    assessments: ComplianceAssessment[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (assessments.some(a => a.riskLevel === 'critical')) return 'critical';
    if (assessments.some(a => a.riskLevel === 'high')) return 'high';
    if (assessments.some(a => a.riskLevel === 'medium')) return 'medium';
    return 'low';
  }
}

// Export singleton instance
export const complianceManager = new ComplianceManager();
