/**
 * Column type inference with confidence scoring
 */
import {
  ColumnProfile,
  NumericStats,
  CategoricalStats,
  DateTimeStats,
  TextStats,
} from '../types';

export type ColumnType =
  | 'numeric'
  | 'categorical'
  | 'datetime'
  | 'text'
  | 'boolean';

export interface TypeInferenceResult {
  type: ColumnType;
  confidence: number;
  nullable: boolean;
  unique: boolean;
  statistics: NumericStats | CategoricalStats | DateTimeStats | TextStats;
  sampleValues: any[];
  qualityFlags: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    count: number;
    percentage: number;
    description: string;
    suggestion: string;
  }>;
}

/**
 * Advanced type inference engine for CSV columns
 */
export class TypeInferenceEngine {
  private readonly DATE_PATTERNS = [
    // ISO formats
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/,
    // US formats
    /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    /^\d{1,2}-\d{1,2}-\d{4}$/,
    // European formats
    /^\d{1,2}\.\d{1,2}\.\d{4}$/,
    // Timestamps
    /^\d{10}$/,
    /^\d{13}$/,
  ];

  private readonly BOOLEAN_VALUES = new Set([
    'true',
    'false',
    'yes',
    'no',
    'on',
    'off',
    '1',
    '0',
    'y',
    'n',
    't',
    'f',
  ]);

  /**
   * Infer column type from sample values
   */
  inferColumnType(columnName: string, values: string[]): TypeInferenceResult {
    // Filter out null/empty values for analysis
    const nonNullValues = values.filter(v => v != null && v.trim() !== '');
    const totalValues = values.length;
    const nonNullCount = nonNullValues.length;
    const nullCount = totalValues - nonNullCount;

    // Basic properties
    const nullable = nullCount > 0;
    const uniqueValues = new Set(nonNullValues);
    const unique = uniqueValues.size === nonNullCount;

    // If too few values, default to text
    if (nonNullValues.length < 3) {
      return this.createTextResult(columnName, values, nullable, unique);
    }

    // Check for boolean first (highest specificity)
    const booleanResult = this.checkBoolean(nonNullValues);
    if (booleanResult.confidence > 0.8) {
      return {
        ...booleanResult,
        nullable,
        unique,
        sampleValues: Array.from(uniqueValues).slice(0, 10),
        qualityFlags: this.generateQualityFlags(values, 'boolean'),
      };
    }

    // Check for numeric
    const numericResult = this.checkNumeric(nonNullValues);
    if (numericResult.confidence > 0.7) {
      return {
        ...numericResult,
        nullable,
        unique,
        sampleValues: Array.from(uniqueValues).slice(0, 10),
        qualityFlags: this.generateQualityFlags(values, 'numeric'),
      };
    }

    // Check for datetime
    const datetimeResult = this.checkDateTime(nonNullValues);
    if (datetimeResult.confidence > 0.6) {
      return {
        ...datetimeResult,
        nullable,
        unique,
        sampleValues: Array.from(uniqueValues).slice(0, 10),
        qualityFlags: this.generateQualityFlags(values, 'datetime'),
      };
    }

    // Check for categorical vs text
    const categoricalResult = this.checkCategorical(nonNullValues);
    if (categoricalResult.confidence > 0.5) {
      return {
        ...categoricalResult,
        nullable,
        unique,
        sampleValues: Array.from(uniqueValues).slice(0, 10),
        qualityFlags: this.generateQualityFlags(values, 'categorical'),
      };
    }

    // Default to text
    return this.createTextResult(columnName, values, nullable, unique);
  }

  /**
   * Check if values are boolean
   */
  private checkBoolean(
    values: string[]
  ): Omit<
    TypeInferenceResult,
    'nullable' | 'unique' | 'sampleValues' | 'qualityFlags'
  > {
    const normalizedValues = values.map(v => v.toLowerCase().trim());
    const booleanMatches = normalizedValues.filter(v =>
      this.BOOLEAN_VALUES.has(v)
    );
    const confidence = booleanMatches.length / values.length;

    return {
      type: 'boolean',
      confidence,
      statistics: this.calculateCategoricalStats(values),
    };
  }

  /**
   * Check if values are numeric
   */
  private checkNumeric(
    values: string[]
  ): Omit<
    TypeInferenceResult,
    'nullable' | 'unique' | 'sampleValues' | 'qualityFlags'
  > {
    const numericValues: number[] = [];
    const patterns = {
      integer: /^-?\d+$/,
      decimal: /^-?\d*\.\d+$/,
      scientific: /^-?\d+(?:\.\d+)?e[+-]?\d+$/i,
      percentage: /^-?\d+(?:\.\d+)?%$/,
      currency: /^[€$£¥₹]?-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/,
    };

    let validCount = 0;

    for (const value of values) {
      const trimmed = value.trim();

      // Try different numeric patterns
      if (patterns.integer.test(trimmed) || patterns.decimal.test(trimmed)) {
        const num = parseFloat(trimmed);
        if (!isNaN(num) && isFinite(num)) {
          numericValues.push(num);
          validCount++;
        }
      } else if (patterns.scientific.test(trimmed)) {
        const num = parseFloat(trimmed);
        if (!isNaN(num) && isFinite(num)) {
          numericValues.push(num);
          validCount++;
        }
      } else if (patterns.percentage.test(trimmed)) {
        const num = parseFloat(trimmed.replace('%', ''));
        if (!isNaN(num) && isFinite(num)) {
          numericValues.push(num / 100);
          validCount++;
        }
      } else if (patterns.currency.test(trimmed)) {
        const cleaned = trimmed.replace(/[€$£¥₹,]/g, '');
        const num = parseFloat(cleaned);
        if (!isNaN(num) && isFinite(num)) {
          numericValues.push(num);
          validCount++;
        }
      }
    }

    const confidence = validCount / values.length;

    return {
      type: 'numeric',
      confidence,
      statistics: this.calculateNumericStats(numericValues),
    };
  }

  /**
   * Check if values are datetime
   */
  private checkDateTime(
    values: string[]
  ): Omit<
    TypeInferenceResult,
    'nullable' | 'unique' | 'sampleValues' | 'qualityFlags'
  > {
    const dateValues: Date[] = [];
    let validCount = 0;

    for (const value of values) {
      const trimmed = value.trim();

      // Check against date patterns
      const matchesPattern = this.DATE_PATTERNS.some(pattern =>
        pattern.test(trimmed)
      );

      if (matchesPattern) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          dateValues.push(date);
          validCount++;
        }
      } else {
        // Try parsing as timestamp
        const timestamp = parseInt(trimmed, 10);
        if (!isNaN(timestamp)) {
          const date = new Date(
            timestamp > 1e10 ? timestamp : timestamp * 1000
          );
          if (
            !isNaN(date.getTime()) &&
            date.getFullYear() > 1970 &&
            date.getFullYear() < 2100
          ) {
            dateValues.push(date);
            validCount++;
          }
        }
      }
    }

    const confidence = validCount / values.length;

    return {
      type: 'datetime',
      confidence,
      statistics: this.calculateDateTimeStats(dateValues),
    };
  }

  /**
   * Check if values are categorical
   */
  private checkCategorical(
    values: string[]
  ): Omit<
    TypeInferenceResult,
    'nullable' | 'unique' | 'sampleValues' | 'qualityFlags'
  > {
    const uniqueValues = new Set(values);
    const uniqueRatio = uniqueValues.size / values.length;

    // Categorical if:
    // - Low unique ratio (< 50%)
    // - Or reasonable number of categories (< 100 unique values)
    // - And values are relatively short (avg length < 50 chars)

    const avgLength =
      values.reduce((sum, v) => sum + v.length, 0) / values.length;

    let confidence = 0;

    if (uniqueRatio < 0.1) {
      confidence = 0.9; // Very few unique values
    } else if (uniqueRatio < 0.3) {
      confidence = 0.7; // Moderate repetition
    } else if (uniqueRatio < 0.5 && uniqueValues.size < 100) {
      confidence = 0.6; // Some repetition with reasonable categories
    } else if (avgLength < 20 && uniqueValues.size < 50) {
      confidence = 0.5; // Short values with few categories
    } else {
      confidence = 0.2; // Likely text
    }

    return {
      type: 'categorical',
      confidence,
      statistics: this.calculateCategoricalStats(values),
    };
  }

  /**
   * Create text result
   */
  private createTextResult(
    columnName: string,
    values: string[],
    nullable: boolean,
    unique: boolean
  ): TypeInferenceResult {
    return {
      type: 'text',
      confidence: 1.0,
      nullable,
      unique,
      statistics: this.calculateTextStats(values),
      sampleValues: [...new Set(values)].slice(0, 10),
      qualityFlags: this.generateQualityFlags(values, 'text'),
    };
  }

  /**
   * Calculate numeric statistics
   */
  private calculateNumericStats(values: number[]): NumericStats {
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        mode: [],
        stddev: 0,
        variance: 0,
        percentiles: { p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 },
        histogram: [],
        outliers: [],
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;

    // Variance and standard deviation
    const variance =
      values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      values.length;
    const stddev = Math.sqrt(variance);

    // Percentiles
    const percentiles = {
      p25: this.percentile(sorted, 0.25),
      p50: this.percentile(sorted, 0.5),
      p75: this.percentile(sorted, 0.75),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
    };

    // Mode calculation
    const frequency = new Map<number, number>();
    values.forEach(val => {
      frequency.set(val, (frequency.get(val) || 0) + 1);
    });
    const maxFreq = Math.max(...frequency.values());
    const mode = Array.from(frequency.entries())
      .filter(([, freq]) => freq === maxFreq)
      .map(([val]) => val);

    // Outliers using IQR method
    const iqr = percentiles.p75 - percentiles.p25;
    const lowerBound = percentiles.p25 - 1.5 * iqr;
    const upperBound = percentiles.p75 + 1.5 * iqr;
    const outliers = values.filter(val => val < lowerBound || val > upperBound);

    // Histogram (10 bins)
    const binCount = Math.min(
      10,
      Math.max(3, Math.floor(Math.sqrt(values.length)))
    );
    const histogram = this.createHistogram(values, binCount);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      median: percentiles.p50,
      mode,
      stddev,
      variance,
      percentiles,
      histogram,
      outliers,
    };
  }

  /**
   * Calculate categorical statistics
   */
  private calculateCategoricalStats(values: string[]): CategoricalStats {
    const frequency = new Map<string, number>();
    values.forEach(val => {
      const cleaned = val.trim();
      frequency.set(cleaned, (frequency.get(cleaned) || 0) + 1);
    });

    const totalCount = values.length;
    const sortedEntries = Array.from(frequency.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    const topValues = sortedEntries.slice(0, 10).map(([value, count]) => ({
      value,
      count,
      percentage: (count / totalCount) * 100,
    }));

    const distribution = Object.fromEntries(frequency);

    // Calculate entropy
    const entropy = -Array.from(frequency.values())
      .map(count => {
        const p = count / totalCount;
        return p * Math.log2(p);
      })
      .reduce((sum, val) => sum + val, 0);

    // Mode is the most frequent value(s)
    const maxCount = sortedEntries[0]?.[1] || 0;
    const mode = sortedEntries
      .filter(([, count]) => count === maxCount)
      .map(([value]) => value);

    return {
      uniqueCount: frequency.size,
      topValues,
      entropy,
      mode,
      distribution,
    };
  }

  /**
   * Calculate datetime statistics
   */
  private calculateDateTimeStats(values: Date[]): DateTimeStats {
    if (values.length === 0) {
      const now = new Date();
      return {
        min: now,
        max: now,
        range: { start: now, end: now },
        frequency: 'irregular',
        trend: 'stable',
        gaps: [],
      };
    }

    const sorted = [...values].sort((a, b) => a.getTime() - b.getTime());
    const min = sorted[0] ?? new Date();
    const max = sorted[sorted.length - 1] ?? new Date();

    // Detect frequency
    let frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'irregular' =
      'irregular';
    if (values.length > 2) {
      const intervals = [];
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const previous = sorted[i - 1];
        if (current !== undefined && previous !== undefined) {
          intervals.push(current.getTime() - previous.getTime());
        }
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Rough frequency detection (in milliseconds)
      if (avgInterval < 2 * 24 * 60 * 60 * 1000) frequency = 'daily';
      else if (avgInterval < 9 * 24 * 60 * 60 * 1000) frequency = 'weekly';
      else if (avgInterval < 35 * 24 * 60 * 60 * 1000) frequency = 'monthly';
      else if (avgInterval < 400 * 24 * 60 * 60 * 1000) frequency = 'yearly';
    }

    // Simple trend detection
    let trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal' = 'stable';
    if (values.length > 3) {
      const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
      const firstAvg =
        firstHalf.reduce((sum, date) => sum + date.getTime(), 0) /
        firstHalf.length;
      const secondAvg =
        secondHalf.reduce((sum, date) => sum + date.getTime(), 0) /
        secondHalf.length;

      if (secondAvg > firstAvg * 1.1) trend = 'increasing';
      else if (secondAvg < firstAvg * 0.9) trend = 'decreasing';
    }

    return {
      min,
      max,
      range: { start: min, end: max },
      frequency,
      trend,
      gaps: [], // Gap detection would require more complex logic
    };
  }

  /**
   * Calculate text statistics
   */
  private calculateTextStats(values: string[]): TextStats {
    const lengths = values.map(v => v.length);
    const words = values.flatMap(v => v.toLowerCase().split(/\s+/));

    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      if (word.length > 2) {
        // Ignore very short words
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });

    const commonWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    return {
      avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
      commonWords,
      encoding: 'utf-8', // Assume UTF-8
      languages: ['en'], // Simple assumption
      patterns: [], // Pattern detection would be more complex
    };
  }

  /**
   * Generate quality flags for a column
   */
  private generateQualityFlags(values: string[], type: ColumnType) {
    const flags = [];
    const totalCount = values.length;
    const nullCount = values.filter(v => v == null || v.trim() === '').length;

    if (nullCount > 0) {
      flags.push({
        type: 'missing_values',
        severity:
          nullCount / totalCount > 0.1 ? ('high' as const) : ('low' as const),
        count: nullCount,
        percentage: (nullCount / totalCount) * 100,
        description: `${nullCount} missing values found`,
        suggestion: 'Consider data cleaning or imputation strategies',
      });
    }

    // Type-specific quality checks would go here
    return flags;
  }

  /**
   * Calculate percentile value
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = percentile * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length)
      return sortedArray[sortedArray.length - 1] ?? 0;
    if (lower < 0) return sortedArray[0] ?? 0;

    const lowerValue = sortedArray[lower] ?? sortedArray[0] ?? 0;
    const upperValue =
      sortedArray[upper] ?? sortedArray[sortedArray.length - 1] ?? 0;
    return lowerValue * (1 - weight) + upperValue * weight;
  }

  /**
   * Create histogram bins
   */
  private createHistogram(values: number[], binCount: number) {
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;

    const bins = Array.from({ length: binCount }, (_, i) => ({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      percentage: 0,
    }));

    // Count values in each bin
    values.forEach(value => {
      let binIndex = Math.floor((value - min) / binWidth);
      if (binIndex >= binCount) binIndex = binCount - 1; // Handle max value
      const bin = bins[binIndex];
      if (bin !== undefined) {
        bin.count++;
      }
    });

    // Calculate percentages
    bins.forEach(bin => {
      bin.percentage = (bin.count / values.length) * 100;
    });

    return bins;
  }
}
