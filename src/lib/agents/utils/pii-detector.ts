/**
 * PII Detection Utilities
 *
 * Multi-method PII detection using:
 * - Regex pattern matching
      regex:
        /^(0[1-9]|1[0-2])[/\-](0[1-9]|[12][0-9]|3[01])[/\-](19|20)\d{2}$/,* - Column name analysis
 * - Data format analysis
 * - Confidence scoring
 */

export interface PIIPattern {
  name: string;
  type: PIIType;
  regex: RegExp;
  confidence: number;
  description: string;
}

export enum PIIType {
  EMAIL = 'email',
  PHONE = 'phone',
  SSN = 'ssn',
  CREDIT_CARD = 'credit_card',
  IP_ADDRESS = 'ip_address',
  DATE_OF_BIRTH = 'date_of_birth',
  NAME = 'name',
  ADDRESS = 'address',
  DRIVER_LICENSE = 'driver_license',
  PASSPORT = 'passport',
  ACCOUNT_NUMBER = 'account_number',
  UNKNOWN = 'unknown',
}

export interface PIIDetectionResult {
  type: PIIType;
  confidence: number;
  matches: number;
  sampleValues: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  compliance: ComplianceFlag[];
}

export interface ComplianceFlag {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'PCI_DSS' | 'SOX';
  category: string;
  description: string;
  required: boolean;
}

export class PIIDetector {
  private patterns: PIIPattern[] = [
    // Email addresses
    {
      name: 'email_standard',
      type: PIIType.EMAIL,
      regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      confidence: 0.95,
      description: 'Standard email format',
    },

    // Phone numbers (US formats)
    {
      name: 'phone_us_standard',
      type: PIIType.PHONE,
      regex: /^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
      confidence: 0.9,
      description: 'US phone number format',
    },

    // Social Security Numbers
    {
      name: 'ssn_standard',
      type: PIIType.SSN,
      regex: /^\d{3}-?\d{2}-?\d{4}$/,
      confidence: 0.95,
      description: 'US Social Security Number',
    },

    // Credit Card Numbers (basic Luhn validation would be added)
    {
      name: 'credit_card_basic',
      type: PIIType.CREDIT_CARD,
      regex: /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
      confidence: 0.8,
      description: 'Credit card number format',
    },

    // IP Addresses
    {
      name: 'ip_address_v4',
      type: PIIType.IP_ADDRESS,
      regex: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
      confidence: 0.9,
      description: 'IPv4 address',
    },

    // Date of Birth patterns
    {
      name: 'dob_mmddyyyy',
      type: PIIType.DATE_OF_BIRTH,
      regex:
        /^(0[1-9]|1[0-2])[\/\-](0[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}$/,
      confidence: 0.7,
      description: 'Date of birth MM/DD/YYYY format',
    },
  ];

  private columnNamePatterns: Map<PIIType, string[]> = new Map([
    [
      PIIType.EMAIL,
      ['email', 'e_mail', 'mail', 'email_address', 'contact_email'],
    ],
    [
      PIIType.PHONE,
      ['phone', 'telephone', 'mobile', 'cell', 'phone_number', 'contact_phone'],
    ],
    [
      PIIType.SSN,
      ['ssn', 'social_security', 'social_security_number', 'ss_number'],
    ],
    [
      PIIType.NAME,
      [
        'first_name',
        'last_name',
        'full_name',
        'name',
        'fname',
        'lname',
        'customer_name',
      ],
    ],
    [
      PIIType.ADDRESS,
      [
        'address',
        'street',
        'city',
        'zip',
        'postal_code',
        'home_address',
        'billing_address',
      ],
    ],
    [
      PIIType.DATE_OF_BIRTH,
      ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday'],
    ],
    [
      PIIType.CREDIT_CARD,
      ['credit_card', 'cc_number', 'card_number', 'payment_card'],
    ],
    [
      PIIType.DRIVER_LICENSE,
      ['license', 'drivers_license', 'dl_number', 'license_number'],
    ],
    [
      PIIType.ACCOUNT_NUMBER,
      ['account', 'account_number', 'acct_number', 'customer_id'],
    ],
  ]);

  /**
   * Detect PII in a column based on column name and sample data
   */
  detectColumnPII(
    columnName: string,
    sampleValues: string[]
  ): PIIDetectionResult {
    // Clean and normalize sample values
    const cleanValues = sampleValues
      .filter(val => val && val.trim().length > 0)
      .map(val => val.trim())
      .slice(0, 100); // Limit sample size for performance

    if (cleanValues.length === 0) {
      return this.createNoPIIResult();
    }

    // Method 1: Column name analysis
    const columnNameResult = this.analyzeColumnName(columnName);

    // Method 2: Pattern matching on data values
    const patternResults = this.analyzeDataPatterns(cleanValues);

    // Method 3: Data format analysis
    const formatResult = this.analyzeDataFormat(cleanValues);

    // Combine results and determine best match
    const combinedResult = this.combineDetectionResults(
      columnNameResult,
      patternResults,
      formatResult,
      cleanValues
    );

    return combinedResult;
  }

  /**
   * Analyze column name for PII indicators
   */
  private analyzeColumnName(columnName: string): {
    type: PIIType;
    confidence: number;
  } {
    const normalizedName = columnName.toLowerCase().replace(/[_\s-]/g, '');

    for (const [piiType, patterns] of this.columnNamePatterns.entries()) {
      for (const pattern of patterns) {
        const normalizedPattern = pattern.replace(/[_\s-]/g, '');
        if (normalizedName.includes(normalizedPattern)) {
          // Higher confidence for exact matches
          const confidence = normalizedName === normalizedPattern ? 0.9 : 0.7;
          return { type: piiType, confidence };
        }
      }
    }

    return { type: PIIType.UNKNOWN, confidence: 0 };
  }

  /**
   * Analyze data values using regex patterns
   */
  private analyzeDataPatterns(
    values: string[]
  ): Array<{ type: PIIType; confidence: number; matches: number }> {
    const results: Array<{
      type: PIIType;
      confidence: number;
      matches: number;
    }> = [];

    for (const pattern of this.patterns) {
      let matches = 0;
      for (const value of values) {
        if (pattern.regex.test(value)) {
          matches++;
        }
      }

      if (matches > 0) {
        const matchRatio = matches / values.length;
        // Adjust confidence based on match ratio
        const adjustedConfidence =
          pattern.confidence * Math.min(matchRatio * 2, 1);

        results.push({
          type: pattern.type,
          confidence: adjustedConfidence,
          matches,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze data format characteristics
   */
  private analyzeDataFormat(values: string[]): {
    type: PIIType;
    confidence: number;
  } {
    const sample = values.slice(0, 20);

    // Check for consistent patterns that might indicate PII
    if (this.hasConsistentLength(sample)) {
      const commonLength = sample[0]?.length || 0;

      // Common PII length patterns
      if (commonLength === 9 && this.allNumeric(sample)) {
        return { type: PIIType.SSN, confidence: 0.6 };
      }
      if (commonLength === 16 && this.allNumeric(sample)) {
        return { type: PIIType.CREDIT_CARD, confidence: 0.5 };
      }
    }

    // Check for email-like patterns
    if (sample.every(val => val.includes('@') && val.includes('.'))) {
      return { type: PIIType.EMAIL, confidence: 0.8 };
    }

    return { type: PIIType.UNKNOWN, confidence: 0 };
  }

  /**
   * Combine multiple detection results
   */
  private combineDetectionResults(
    columnNameResult: { type: PIIType; confidence: number },
    patternResults: Array<{
      type: PIIType;
      confidence: number;
      matches: number;
    }>,
    formatResult: { type: PIIType; confidence: number },
    sampleValues: string[]
  ): PIIDetectionResult {
    // Start with the highest confidence pattern match
    let bestResult = patternResults[0];

    // Boost confidence if column name matches
    if (columnNameResult.type !== PIIType.UNKNOWN) {
      if (bestResult && bestResult.type === columnNameResult.type) {
        bestResult.confidence = Math.min(bestResult.confidence + 0.2, 1.0);
      } else if (
        !bestResult ||
        columnNameResult.confidence > (bestResult.confidence || 0)
      ) {
        bestResult = {
          type: columnNameResult.type,
          confidence: columnNameResult.confidence,
          matches: 0,
        };
      }
    }

    // Consider format analysis
    if (formatResult.type !== PIIType.UNKNOWN) {
      if (bestResult && bestResult.type === formatResult.type) {
        bestResult.confidence = Math.min(bestResult.confidence + 0.1, 1.0);
      } else if (
        !bestResult ||
        formatResult.confidence > (bestResult.confidence || 0)
      ) {
        bestResult = {
          type: formatResult.type,
          confidence: formatResult.confidence,
          matches: 0,
        };
      }
    }

    if (!bestResult) {
      return this.createNoPIIResult();
    }

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(
      bestResult.type,
      bestResult.confidence
    );

    // Get compliance flags
    const compliance = this.getComplianceFlags(bestResult.type);

    // Get sample values (redacted for security)
    const sampleValuesRedacted = this.getSampleValues(
      sampleValues,
      bestResult.type
    );

    return {
      type: bestResult.type,
      confidence: bestResult.confidence,
      matches: bestResult.matches || 0,
      sampleValues: sampleValuesRedacted,
      riskLevel,
      compliance,
    };
  }

  /**
   * Calculate risk level based on PII type and confidence
   */
  private calculateRiskLevel(
    type: PIIType,
    confidence: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalTypes = [PIIType.SSN, PIIType.CREDIT_CARD, PIIType.PASSPORT];
    const highTypes = [PIIType.EMAIL, PIIType.PHONE, PIIType.DATE_OF_BIRTH];
    const mediumTypes = [PIIType.NAME, PIIType.ADDRESS, PIIType.DRIVER_LICENSE];

    if (confidence < 0.5) return 'low';

    if (criticalTypes.includes(type)) return 'critical';
    if (highTypes.includes(type)) return 'high';
    if (mediumTypes.includes(type)) return 'medium';

    return 'low';
  }

  /**
   * Get compliance flags for PII type
   */
  private getComplianceFlags(type: PIIType): ComplianceFlag[] {
    const flags: ComplianceFlag[] = [];

    switch (type) {
      case PIIType.EMAIL:
      case PIIType.NAME:
      case PIIType.ADDRESS:
        flags.push({
          regulation: 'GDPR',
          category: 'Personal Data',
          description: 'Subject to GDPR data protection requirements',
          required: true,
        });
        flags.push({
          regulation: 'CCPA',
          category: 'Personal Information',
          description: 'Protected under California Consumer Privacy Act',
          required: true,
        });
        break;

      case PIIType.SSN:
        flags.push({
          regulation: 'SOX',
          category: 'Sensitive Personal Data',
          description: 'Protected under Sarbanes-Oxley Act',
          required: true,
        });
        break;

      case PIIType.CREDIT_CARD:
        flags.push({
          regulation: 'PCI_DSS',
          category: 'Payment Card Data',
          description: 'Protected under PCI Data Security Standard',
          required: true,
        });
        break;

      case PIIType.DATE_OF_BIRTH:
        flags.push({
          regulation: 'HIPAA',
          category: 'Protected Health Information',
          description: 'May be protected under HIPAA if health-related',
          required: false,
        });
        break;
    }

    return flags;
  }

  /**
   * Get sample values with appropriate redaction
   */
  private getSampleValues(values: string[], type: PIIType): string[] {
    const samples = values.slice(0, 3);

    return samples.map(value => {
      switch (type) {
        case PIIType.EMAIL:
          return this.redactEmail(value);
        case PIIType.PHONE:
          return this.redactPhone(value);
        case PIIType.SSN:
          return 'XXX-XX-XXXX';
        case PIIType.CREDIT_CARD:
          return 'XXXX-XXXX-XXXX-XXXX';
        default:
          return value.length > 10
            ? value.substring(0, 3) + '...'
            : '[REDACTED]';
      }
    });
  }

  /**
   * Redact email address
   */
  private redactEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex > 0) {
      const username = email.substring(0, atIndex);
      const domain = email.substring(atIndex);
      const redactedUsername =
        username.substring(0, 2) + '*'.repeat(Math.max(username.length - 2, 1));
      return redactedUsername + domain;
    }
    return '[REDACTED EMAIL]';
  }

  /**
   * Redact phone number
   */
  private redactPhone(phone: string): string {
    return phone.replace(/\d/g, (match, index) => {
      // Show first 3 and last 4 digits
      const digitsOnly = phone.replace(/\D/g, '');
      const digitIndex = phone.substring(0, index).replace(/\D/g, '').length;

      if (digitIndex < 3 || digitIndex >= digitsOnly.length - 4) {
        return match;
      }
      return 'X';
    });
  }

  /**
   * Create a no-PII result
   */
  private createNoPIIResult(): PIIDetectionResult {
    return {
      type: PIIType.UNKNOWN,
      confidence: 0,
      matches: 0,
      sampleValues: [],
      riskLevel: 'low',
      compliance: [],
    };
  }

  /**
   * Helper: Check if values have consistent length
   */
  private hasConsistentLength(values: string[]): boolean {
    if (values.length === 0) return false;
    const firstLength = values[0]?.length || 0;
    return values.every(val => val.length === firstLength);
  }

  /**
   * Helper: Check if all values are numeric
   */
  private allNumeric(values: string[]): boolean {
    return values.every(val => /^\d+$/.test(val.replace(/[-\s]/g, '')));
  }

  /**
   * Batch analyze multiple columns
   */
  analyzeDataset(
    columns: Array<{ name: string; sampleValues: string[] }>
  ): Map<string, PIIDetectionResult> {
    const results = new Map<string, PIIDetectionResult>();

    for (const column of columns) {
      const result = this.detectColumnPII(column.name, column.sampleValues);
      if (result.confidence > 0.5) {
        // Only store significant PII detections
        results.set(column.name, result);
      }
    }

    return results;
  }
}

// Export singleton instance
export const piiDetector = new PIIDetector();
