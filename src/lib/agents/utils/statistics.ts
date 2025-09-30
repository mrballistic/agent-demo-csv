/**
 * Statistical calculations for data profiling
 */
import {
  NumericStats,
  CategoricalStats,
  DateTimeStats,
  TextStats,
  HistogramBin,
} from '../types';

/**
 * Calculate comprehensive numeric statistics
 */
export function calculateNumericStats(values: number[]): NumericStats {
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

  // Percentiles using simple method
  const p25 = percentile(sorted, 0.25);
  const p50 = percentile(sorted, 0.5);
  const p75 = percentile(sorted, 0.75);
  const p90 = percentile(sorted, 0.9);
  const p95 = percentile(sorted, 0.95);

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
  const iqr = p75 - p25;
  const lowerBound = p25 - 1.5 * iqr;
  const upperBound = p75 + 1.5 * iqr;
  const outliers = values.filter(val => val < lowerBound || val > upperBound);

  // Histogram
  const histogram = createHistogram(values, 10);

  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    median: p50,
    mode,
    stddev,
    variance,
    percentiles: { p25, p50, p75, p90, p95 },
    histogram,
    outliers,
  };
}

/**
 * Calculate categorical statistics
 */
export function calculateCategoricalStats(values: string[]): CategoricalStats {
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
      return p > 0 ? p * Math.log2(p) : 0;
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
export function calculateDateTimeStats(values: Date[]): DateTimeStats {
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
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  // Simple frequency detection
  let frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'irregular' =
    'irregular';
  if (values.length > 2) {
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i]!.getTime() - sorted[i - 1]!.getTime());
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Convert to days
    const avgDays = avgInterval / (24 * 60 * 60 * 1000);

    if (avgDays <= 2) frequency = 'daily';
    else if (avgDays <= 9) frequency = 'weekly';
    else if (avgDays <= 35) frequency = 'monthly';
    else if (avgDays <= 400) frequency = 'yearly';
  }

  return {
    min,
    max,
    range: { start: min, end: max },
    frequency,
    trend: 'stable', // Simplified
    gaps: [],
  };
}

/**
 * Calculate text statistics
 */
export function calculateTextStats(values: string[]): TextStats {
  if (values.length === 0) {
    return {
      avgLength: 0,
      minLength: 0,
      maxLength: 0,
      commonWords: [],
      encoding: 'utf-8',
      languages: ['en'],
      patterns: [],
    };
  }

  const lengths = values.map(v => v.length);
  const words = values
    .flatMap(v => v.toLowerCase().split(/\s+/))
    .filter(w => w.length > 2);

  const wordFreq = new Map<string, number>();
  words.forEach(word => {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
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
    encoding: 'utf-8',
    languages: ['en'],
    patterns: [],
  };
}

/**
 * Calculate percentile value
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;

  const index = p * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1]!;
  if (lower < 0) return sortedArray[0]!;

  return sortedArray[lower]! * (1 - weight) + sortedArray[upper]! * weight;
}

/**
 * Create histogram bins
 */
function createHistogram(values: number[], binCount: number): HistogramBin[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [
      {
        min,
        max,
        count: values.length,
        percentage: 100,
      },
    ];
  }

  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = [];

  for (let i = 0; i < binCount; i++) {
    bins.push({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      percentage: 0,
    });
  }

  // Count values in each bin
  values.forEach(value => {
    let binIndex = Math.floor((value - min) / binWidth);
    if (binIndex >= binCount) binIndex = binCount - 1; // Handle max value edge case
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex]!.count++;
    }
  });

  // Calculate percentages
  bins.forEach(bin => {
    bin.percentage = (bin.count / values.length) * 100;
  });

  return bins;
}
