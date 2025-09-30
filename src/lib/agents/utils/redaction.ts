/**
 * Data Redaction Utilities
 *
 * Handles automatic redaction of PII data while preserving analytical utility
 */

import { PIIType, PIIDetectionResult } from './pii-detector';

export interface RedactionOptions {
  preserveFormat: boolean; // Keep original format (e.g., XXX-XX-XXXX for SSN)
  preserveLength: boolean; // Keep original string length
  showPartial: boolean; // Show first/last characters for context
  useSemanticPlaceholders: boolean; // Use meaningful placeholders
}

export interface RedactionResult {
  originalValue: string;
  redactedValue: string;
  redactionType: 'full' | 'partial' | 'format_preserving' | 'semantic';
  preservedUtility: number; // 0-1 score for how much analytical utility is preserved
}

export class DataRedactor {
  private defaultOptions: RedactionOptions = {
    preserveFormat: true,
    preserveLength: false,
    showPartial: true,
    useSemanticPlaceholders: true,
  };

  /**
   * Redact a single value based on PII type
   */
  redactValue(
    value: string,
    piiType: PIIType,
    options: Partial<RedactionOptions> = {}
  ): RedactionResult {
    const opts = { ...this.defaultOptions, ...options };

    switch (piiType) {
      case PIIType.EMAIL:
        return this.redactEmail(value, opts);
      case PIIType.PHONE:
        return this.redactPhone(value, opts);
      case PIIType.SSN:
        return this.redactSSN(value, opts);
      case PIIType.CREDIT_CARD:
        return this.redactCreditCard(value, opts);
      case PIIType.NAME:
        return this.redactName(value, opts);
      case PIIType.ADDRESS:
        return this.redactAddress(value, opts);
      case PIIType.DATE_OF_BIRTH:
        return this.redactDateOfBirth(value, opts);
      default:
        return this.redactGeneric(value, opts);
    }
  }

  /**
   * Redact email addresses
   */
  private redactEmail(
    email: string,
    options: RedactionOptions
  ): RedactionResult {
    if (options.useSemanticPlaceholders) {
      return {
        originalValue: email,
        redactedValue: '[EMAIL_ADDRESS]',
        redactionType: 'semantic',
        preservedUtility: 0.8, // Preserves that it's an email for analysis
      };
    }

    if (options.showPartial) {
      const atIndex = email.indexOf('@');
      if (atIndex > 2) {
        const username = email.substring(0, atIndex);
        const domain = email.substring(atIndex);
        const redactedUsername =
          username.substring(0, 2) +
          '*'.repeat(Math.max(username.length - 2, 1));
        return {
          originalValue: email,
          redactedValue: redactedUsername + domain,
          redactionType: 'partial',
          preservedUtility: 0.6,
        };
      }
    }

    return {
      originalValue: email,
      redactedValue: '[REDACTED]',
      redactionType: 'full',
      preservedUtility: 0.2,
    };
  }

  /**
   * Redact phone numbers
   */
  private redactPhone(
    phone: string,
    options: RedactionOptions
  ): RedactionResult {
    if (options.useSemanticPlaceholders) {
      return {
        originalValue: phone,
        redactedValue: '[PHONE_NUMBER]',
        redactionType: 'semantic',
        preservedUtility: 0.8,
      };
    }

    if (options.preserveFormat) {
      // Preserve format but redact digits
      const formatPreserved = phone.replace(/\d/g, 'X');
      return {
        originalValue: phone,
        redactedValue: formatPreserved,
        redactionType: 'format_preserving',
        preservedUtility: 0.7,
      };
    }

    if (options.showPartial) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length >= 7) {
        // Show area code and last 4 digits
        const areaCode = digitsOnly.substring(0, 3);
        const lastFour = digitsOnly.substring(digitsOnly.length - 4);
        const middle = 'X'.repeat(digitsOnly.length - 7);
        const formatted = `${areaCode}-${middle}-${lastFour}`;

        return {
          originalValue: phone,
          redactedValue: formatted,
          redactionType: 'partial',
          preservedUtility: 0.5,
        };
      }
    }

    return {
      originalValue: phone,
      redactedValue: '[REDACTED]',
      redactionType: 'full',
      preservedUtility: 0.2,
    };
  }

  /**
   * Redact Social Security Numbers
   */
  private redactSSN(ssn: string, options: RedactionOptions): RedactionResult {
    // SSNs are always fully redacted for security
    if (options.preserveFormat) {
      return {
        originalValue: ssn,
        redactedValue: 'XXX-XX-XXXX',
        redactionType: 'format_preserving',
        preservedUtility: 0.3,
      };
    }

    return {
      originalValue: ssn,
      redactedValue: '[SSN_REDACTED]',
      redactionType: 'semantic',
      preservedUtility: 0.3,
    };
  }

  /**
   * Redact credit card numbers
   */
  private redactCreditCard(
    ccNumber: string,
    options: RedactionOptions
  ): RedactionResult {
    // Credit cards are always fully redacted for PCI compliance
    if (options.preserveFormat) {
      return {
        originalValue: ccNumber,
        redactedValue: 'XXXX-XXXX-XXXX-XXXX',
        redactionType: 'format_preserving',
        preservedUtility: 0.2,
      };
    }

    return {
      originalValue: ccNumber,
      redactedValue: '[CREDIT_CARD]',
      redactionType: 'semantic',
      preservedUtility: 0.2,
    };
  }

  /**
   * Redact names
   */
  private redactName(name: string, options: RedactionOptions): RedactionResult {
    if (options.useSemanticPlaceholders) {
      // Preserve name structure for analysis
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) {
        return {
          originalValue: name,
          redactedValue: '[NAME]',
          redactionType: 'semantic',
          preservedUtility: 0.7,
        };
      } else if (parts.length === 2) {
        return {
          originalValue: name,
          redactedValue: '[FIRST_NAME] [LAST_NAME]',
          redactionType: 'semantic',
          preservedUtility: 0.8,
        };
      } else {
        return {
          originalValue: name,
          redactedValue: '[FULL_NAME]',
          redactionType: 'semantic',
          preservedUtility: 0.7,
        };
      }
    }

    if (options.showPartial) {
      const parts = name.trim().split(/\s+/);
      const redactedParts = parts.map(part => {
        if (part.length <= 2) return part;
        return part.charAt(0) + '*'.repeat(part.length - 1);
      });

      return {
        originalValue: name,
        redactedValue: redactedParts.join(' '),
        redactionType: 'partial',
        preservedUtility: 0.5,
      };
    }

    return {
      originalValue: name,
      redactedValue: '[REDACTED]',
      redactionType: 'full',
      preservedUtility: 0.2,
    };
  }

  /**
   * Redact addresses
   */
  private redactAddress(
    address: string,
    options: RedactionOptions
  ): RedactionResult {
    if (options.useSemanticPlaceholders) {
      // Preserve address structure
      const parts = address.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        return {
          originalValue: address,
          redactedValue: '[STREET_ADDRESS], [CITY]',
          redactionType: 'semantic',
          preservedUtility: 0.8,
        };
      }
      return {
        originalValue: address,
        redactedValue: '[ADDRESS]',
        redactionType: 'semantic',
        preservedUtility: 0.7,
      };
    }

    return {
      originalValue: address,
      redactedValue: '[ADDRESS_REDACTED]',
      redactionType: 'full',
      preservedUtility: 0.3,
    };
  }

  /**
   * Redact dates of birth
   */
  private redactDateOfBirth(
    dob: string,
    options: RedactionOptions
  ): RedactionResult {
    if (options.showPartial) {
      // Preserve year for age-related analysis
      const yearMatch = dob.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        const year = yearMatch[0];
        return {
          originalValue: dob,
          redactedValue: `[DATE]/${year}`,
          redactionType: 'partial',
          preservedUtility: 0.6,
        };
      }
    }

    return {
      originalValue: dob,
      redactedValue: '[DATE_OF_BIRTH]',
      redactionType: 'semantic',
      preservedUtility: 0.4,
    };
  }

  /**
   * Generic redaction for unknown PII types
   */
  private redactGeneric(
    value: string,
    options: RedactionOptions
  ): RedactionResult {
    if (options.preserveLength) {
      return {
        originalValue: value,
        redactedValue: '*'.repeat(value.length),
        redactionType: 'format_preserving',
        preservedUtility: 0.3,
      };
    }

    return {
      originalValue: value,
      redactedValue: '[REDACTED]',
      redactionType: 'full',
      preservedUtility: 0.2,
    };
  }

  /**
   * Batch redact multiple values in a column
   */
  redactColumn(
    values: string[],
    piiDetection: PIIDetectionResult,
    options: Partial<RedactionOptions> = {}
  ): {
    redactedValues: string[];
    redactionSummary: {
      totalValues: number;
      redactedCount: number;
      averageUtilityPreserved: number;
      redactionType: string;
    };
  } {
    const results = values.map(value =>
      this.redactValue(value, piiDetection.type, options)
    );

    const redactedValues = results.map(r => r.redactedValue);
    const averageUtility =
      results.reduce((sum, r) => sum + r.preservedUtility, 0) / results.length;

    return {
      redactedValues,
      redactionSummary: {
        totalValues: values.length,
        redactedCount: results.length,
        averageUtilityPreserved: averageUtility,
        redactionType: results[0]?.redactionType || 'unknown',
      },
    };
  }

  /**
   * Create redacted dataset while preserving analytical utility
   */
  createRedactedDataset(
    data: Record<string, string[]>,
    piiDetections: Map<string, PIIDetectionResult>,
    options: Partial<RedactionOptions> = {}
  ): {
    redactedData: Record<string, string[]>;
    redactionReport: {
      columnsRedacted: string[];
      totalPIIValuesRedacted: number;
      averageUtilityPreserved: number;
      redactionTimestamp: string;
    };
  } {
    const redactedData: Record<string, string[]> = {};
    const redactionStats: Array<{
      column: string;
      count: number;
      utility: number;
    }> = [];
    let totalRedacted = 0;

    // Process each column
    for (const [columnName, values] of Object.entries(data)) {
      const piiDetection = piiDetections.get(columnName);

      if (piiDetection && piiDetection.confidence > 0.7) {
        // Redact this column
        const redactionResult = this.redactColumn(
          values,
          piiDetection,
          options
        );
        redactedData[columnName] = redactionResult.redactedValues;

        redactionStats.push({
          column: columnName,
          count: redactionResult.redactionSummary.redactedCount,
          utility: redactionResult.redactionSummary.averageUtilityPreserved,
        });

        totalRedacted += redactionResult.redactionSummary.redactedCount;
      } else {
        // Keep original data
        redactedData[columnName] = [...values];
      }
    }

    const averageUtility =
      redactionStats.length > 0
        ? redactionStats.reduce((sum, stat) => sum + stat.utility, 0) /
          redactionStats.length
        : 1.0;

    return {
      redactedData,
      redactionReport: {
        columnsRedacted: redactionStats.map(stat => stat.column),
        totalPIIValuesRedacted: totalRedacted,
        averageUtilityPreserved: averageUtility,
        redactionTimestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Validate redaction effectiveness
   */
  validateRedaction(
    originalValue: string,
    redactedValue: string,
    piiType: PIIType
  ): {
    isEffective: boolean;
    vulnerabilities: string[];
    score: number; // 0-1, higher is better
  } {
    const vulnerabilities: string[] = [];
    let score = 1.0;

    // Check if original value is still present
    if (redactedValue.includes(originalValue)) {
      vulnerabilities.push('Original value still present in redacted output');
      score -= 0.5;
    }

    // Check for partial exposure based on PII type
    switch (piiType) {
      case PIIType.SSN:
        if (/\d{3}-?\d{2}-?\d{4}/.test(redactedValue)) {
          vulnerabilities.push('SSN format may still be identifiable');
          score -= 0.3;
        }
        break;

      case PIIType.CREDIT_CARD:
        if (/\d{4}/.test(redactedValue)) {
          vulnerabilities.push('Credit card digits still visible');
          score -= 0.4;
        }
        break;

      case PIIType.EMAIL:
        if (redactedValue.includes('@') && !redactedValue.startsWith('[')) {
          const domain = redactedValue.split('@')[1];
          if (domain && !domain.includes('*')) {
            vulnerabilities.push('Email domain fully exposed');
            score -= 0.2;
          }
        }
        break;
    }

    return {
      isEffective: vulnerabilities.length === 0,
      vulnerabilities,
      score: Math.max(0, score),
    };
  }
}

// Export singleton instance
export const dataRedactor = new DataRedactor();
