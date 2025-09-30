/**
 * Chart Recommendation Engine
 *
 * Intelligent chart type selection based on data characteristics, column types,
 * cardinality, and statistical properties to recommend optimal visualizations.
 */

export enum ChartType {
  BAR = 'bar',
  LINE = 'line',
  SCATTER = 'scatter',
  PIE = 'pie',
  HISTOGRAM = 'histogram',
  BOX_PLOT = 'box_plot',
  HEATMAP = 'heatmap',
  AREA = 'area',
  TABLE = 'table',
}

export interface ChartRecommendation {
  type: ChartType;
  confidence: number; // 0-1 scale
  reason: string;
  suitability: 'perfect' | 'good' | 'acceptable' | 'poor';
  accessibility: {
    colorBlindSafe: boolean;
    screenReaderFriendly: boolean;
    keyboardNavigable: boolean;
  };
  alternatives?: ChartType[];
}

export interface DataCharacteristics {
  columns: {
    name: string;
    type: 'numeric' | 'categorical' | 'datetime' | 'boolean';
    cardinality: number;
    nullCount: number;
    uniqueRatio: number; // unique values / total values
    distribution?: 'normal' | 'skewed' | 'uniform' | 'bimodal';
  }[];
  rowCount: number;
  relationships?: {
    correlation: number;
    columns: [string, string];
  }[];
  temporal?: {
    hasTimeColumn: boolean;
    timeColumn?: string | undefined;
    timeRange?: [Date, Date];
  };
}

export interface ChartContext {
  purpose: 'exploration' | 'presentation' | 'analysis' | 'comparison';
  audience: 'technical' | 'business' | 'general';
  constraints?: {
    maxCategories?: number;
    preferSimple?: boolean;
    requireInteractive?: boolean;
  };
}

export class ChartRecommendationEngine {
  private readonly CATEGORICAL_THRESHOLD = 50; // Max categories for categorical charts
  private readonly HIGH_CARDINALITY_THRESHOLD = 100;
  private readonly CORRELATION_THRESHOLD = 0.7;

  /**
   * Generate chart recommendations based on data characteristics
   */
  recommend(
    data: DataCharacteristics,
    context: ChartContext = { purpose: 'exploration', audience: 'general' }
  ): ChartRecommendation[] {
    const recommendations: ChartRecommendation[] = [];
    const numericColumns = data.columns.filter(col => col.type === 'numeric');
    const categoricalColumns = data.columns.filter(
      col => col.type === 'categorical'
    );
    const datetimeColumns = data.columns.filter(col => col.type === 'datetime');

    // Single numeric column analysis
    if (numericColumns.length === 1 && categoricalColumns.length === 0) {
      recommendations.push(this.recommendForSingleNumeric(numericColumns[0]));
    }

    // Single categorical column analysis
    if (categoricalColumns.length === 1 && numericColumns.length === 0) {
      recommendations.push(
        this.recommendForSingleCategorical(categoricalColumns[0])
      );
    }

    // Numeric + Categorical combination
    if (numericColumns.length === 1 && categoricalColumns.length === 1) {
      recommendations.push(
        this.recommendForNumericCategorical(
          numericColumns[0],
          categoricalColumns[0],
          context
        )
      );
    }

    // Two numeric columns (scatter plot territory)
    if (numericColumns.length === 2) {
      recommendations.push(
        this.recommendForTwoNumeric(numericColumns[0], numericColumns[1], data)
      );
    }

    // Time series analysis
    if (datetimeColumns.length > 0 && numericColumns.length >= 1) {
      recommendations.push(
        this.recommendForTimeSeries(datetimeColumns[0], numericColumns, data)
      );
    }

    // Multiple categories comparison
    if (categoricalColumns.length >= 2) {
      recommendations.push(
        this.recommendForMultipleCategorical(categoricalColumns, numericColumns)
      );
    }

    // Complex multi-dimensional data
    if (numericColumns.length > 2 || categoricalColumns.length > 2) {
      recommendations.push(this.recommendForComplexData(data, context));
    }

    // Fallback recommendations
    if (recommendations.length === 0) {
      recommendations.push(
        this.getTableRecommendation('No specific pattern detected')
      );
    }

    // Sort by confidence and return top recommendations
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Recommend chart for single numeric column
   */
  private recommendForSingleNumeric(column: any): ChartRecommendation {
    if (column.distribution === 'normal' || column.distribution === 'skewed') {
      return {
        type: ChartType.HISTOGRAM,
        confidence: 0.9,
        reason: `Distribution analysis of ${column.name} shows ${column.distribution} pattern`,
        suitability: 'perfect',
        accessibility: {
          colorBlindSafe: true,
          screenReaderFriendly: true,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.BOX_PLOT],
      };
    }

    return {
      type: ChartType.BOX_PLOT,
      confidence: 0.8,
      reason: `Statistical summary of ${column.name} distribution`,
      suitability: 'good',
      accessibility: {
        colorBlindSafe: true,
        screenReaderFriendly: true,
        keyboardNavigable: true,
      },
      alternatives: [ChartType.HISTOGRAM],
    };
  }

  /**
   * Recommend chart for single categorical column
   */
  private recommendForSingleCategorical(column: any): ChartRecommendation {
    if (column.cardinality <= 8) {
      return {
        type: ChartType.PIE,
        confidence: 0.85,
        reason: `${column.cardinality} categories suitable for pie chart`,
        suitability: 'good',
        accessibility: {
          colorBlindSafe: false, // Pie charts can be challenging for color blind users
          screenReaderFriendly: true,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.BAR],
      };
    }

    return {
      type: ChartType.BAR,
      confidence: 0.9,
      reason: `${column.cardinality} categories better displayed as bar chart`,
      suitability: 'perfect',
      accessibility: {
        colorBlindSafe: true,
        screenReaderFriendly: true,
        keyboardNavigable: true,
      },
      alternatives:
        column.cardinality <= 12 ? [ChartType.PIE] : [ChartType.TABLE],
    };
  }

  /**
   * Recommend chart for numeric + categorical combination
   */
  private recommendForNumericCategorical(
    numericCol: any,
    categoricalCol: any,
    context: ChartContext
  ): ChartRecommendation {
    if (categoricalCol.cardinality > this.CATEGORICAL_THRESHOLD) {
      return this.getTableRecommendation(
        `Too many categories (${categoricalCol.cardinality}) for effective visualization`
      );
    }

    if (context.purpose === 'comparison') {
      return {
        type: ChartType.BAR,
        confidence: 0.95,
        reason: `Comparing ${numericCol.name} across ${categoricalCol.cardinality} categories`,
        suitability: 'perfect',
        accessibility: {
          colorBlindSafe: true,
          screenReaderFriendly: true,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.LINE],
      };
    }

    return {
      type: ChartType.BAR,
      confidence: 0.9,
      reason: `${numericCol.name} by ${categoricalCol.name} relationship`,
      suitability: 'perfect',
      accessibility: {
        colorBlindSafe: true,
        screenReaderFriendly: true,
        keyboardNavigable: true,
      },
      alternatives: [ChartType.LINE, ChartType.AREA],
    };
  }

  /**
   * Recommend chart for two numeric columns
   */
  private recommendForTwoNumeric(
    col1: any,
    col2: any,
    data: DataCharacteristics
  ): ChartRecommendation {
    const correlation = data.relationships?.find(
      rel =>
        (rel.columns[0] === col1.name && rel.columns[1] === col2.name) ||
        (rel.columns[0] === col2.name && rel.columns[1] === col1.name)
    );

    if (
      correlation &&
      Math.abs(correlation.correlation) > this.CORRELATION_THRESHOLD
    ) {
      return {
        type: ChartType.SCATTER,
        confidence: 0.95,
        reason: `Strong correlation (${correlation.correlation.toFixed(2)}) between ${col1.name} and ${col2.name}`,
        suitability: 'perfect',
        accessibility: {
          colorBlindSafe: true,
          screenReaderFriendly: false, // Scatter plots are challenging for screen readers
          keyboardNavigable: true,
        },
        alternatives: [ChartType.LINE],
      };
    }

    return {
      type: ChartType.SCATTER,
      confidence: 0.8,
      reason: `Relationship analysis between ${col1.name} and ${col2.name}`,
      suitability: 'good',
      accessibility: {
        colorBlindSafe: true,
        screenReaderFriendly: false,
        keyboardNavigable: true,
      },
      alternatives: [ChartType.HEATMAP],
    };
  }

  /**
   * Recommend chart for time series data
   */
  private recommendForTimeSeries(
    timeCol: any,
    numericCols: any[],
    data: DataCharacteristics
  ): ChartRecommendation {
    if (numericCols.length === 1) {
      return {
        type: ChartType.LINE,
        confidence: 0.95,
        reason: `Time series trend of ${numericCols[0].name} over time`,
        suitability: 'perfect',
        accessibility: {
          colorBlindSafe: true,
          screenReaderFriendly: true,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.AREA],
      };
    }

    return {
      type: ChartType.LINE,
      confidence: 0.9,
      reason: `Multiple time series comparison over ${timeCol.name}`,
      suitability: 'perfect',
      accessibility: {
        colorBlindSafe: false, // Multiple lines can be challenging
        screenReaderFriendly: true,
        keyboardNavigable: true,
      },
      alternatives: [ChartType.AREA],
    };
  }

  /**
   * Recommend chart for multiple categorical columns
   */
  private recommendForMultipleCategorical(
    categoricalCols: any[],
    numericCols: any[]
  ): ChartRecommendation {
    const totalCombinations = categoricalCols.reduce(
      (acc, col) => acc * col.cardinality,
      1
    );

    if (totalCombinations > 100) {
      return this.getTableRecommendation(
        'Too many category combinations for effective visualization'
      );
    }

    if (numericCols.length > 0) {
      return {
        type: ChartType.HEATMAP,
        confidence: 0.8,
        reason: `Cross-tabulation heatmap for ${categoricalCols.length} categorical dimensions`,
        suitability: 'good',
        accessibility: {
          colorBlindSafe: false, // Heatmaps rely on color
          screenReaderFriendly: false,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.TABLE],
      };
    }

    return this.getTableRecommendation(
      'Multiple categorical columns best displayed in tabular format'
    );
  }

  /**
   * Recommend chart for complex multi-dimensional data
   */
  private recommendForComplexData(
    data: DataCharacteristics,
    context: ChartContext
  ): ChartRecommendation {
    if (context.constraints?.preferSimple) {
      return this.getTableRecommendation(
        'Complex data simplified to table view per user preference'
      );
    }

    if (data.rowCount > 10000) {
      return {
        type: ChartType.HEATMAP,
        confidence: 0.7,
        reason: 'Large dataset with multiple dimensions suitable for heatmap',
        suitability: 'acceptable',
        accessibility: {
          colorBlindSafe: false,
          screenReaderFriendly: false,
          keyboardNavigable: true,
        },
        alternatives: [ChartType.TABLE],
      };
    }

    return this.getTableRecommendation(
      'Complex multi-dimensional data best explored in tabular format'
    );
  }

  /**
   * Generate table recommendation as fallback
   */
  private getTableRecommendation(reason: string): ChartRecommendation {
    return {
      type: ChartType.TABLE,
      confidence: 0.6,
      reason,
      suitability: 'acceptable',
      accessibility: {
        colorBlindSafe: true,
        screenReaderFriendly: true,
        keyboardNavigable: true,
      },
    };
  }

  /**
   * Analyze data and extract characteristics for recommendation
   */
  static analyzeData(
    data: Record<string, (string | number | Date | null)[]>
  ): DataCharacteristics {
    const columns = Object.entries(data).map(([name, values]) => {
      const nonNullValues = values.filter(v => v !== null && v !== undefined);
      const uniqueValues = new Set(nonNullValues);

      // Determine column type
      let type: 'numeric' | 'categorical' | 'datetime' | 'boolean' =
        'categorical';

      if (
        nonNullValues.every(v => typeof v === 'number' || !isNaN(Number(v)))
      ) {
        type = 'numeric';
      } else if (
        nonNullValues.every(
          v => v instanceof Date || !isNaN(Date.parse(String(v)))
        )
      ) {
        type = 'datetime';
      } else if (
        nonNullValues.every(
          v =>
            String(v).toLowerCase() === 'true' ||
            String(v).toLowerCase() === 'false' ||
            String(v).toLowerCase() === 'yes' ||
            String(v).toLowerCase() === 'no' ||
            v === 1 ||
            v === 0
        )
      ) {
        type = 'boolean';
      }

      const baseColumn = {
        name,
        type,
        cardinality: uniqueValues.size,
        nullCount: values.length - nonNullValues.length,
        uniqueRatio: uniqueValues.size / values.length,
      };

      if (type === 'numeric') {
        return {
          ...baseColumn,
          distribution: ChartRecommendationEngine.detectDistribution(
            nonNullValues.map(v => Number(v))
          ),
        };
      } else {
        return baseColumn;
      }
    });

    // Calculate correlations for numeric columns
    const numericColumns = columns.filter(col => col.type === 'numeric');
    const relationships: { correlation: number; columns: [string, string] }[] =
      [];

    for (let i = 0; i < numericColumns.length; i++) {
      for (let j = i + 1; j < numericColumns.length; j++) {
        const col1 = numericColumns[i];
        const col2 = numericColumns[j];
        if (!col1 || !col2) continue;

        const col1Data = data[col1.name];
        const col2Data = data[col2.name];
        if (!col1Data || !col2Data) continue;

        const values1 = col1Data.map(v => Number(v)).filter(v => !isNaN(v));
        const values2 = col2Data.map(v => Number(v)).filter(v => !isNaN(v));

        if (values1.length > 10 && values2.length > 10) {
          const correlation = ChartRecommendationEngine.calculateCorrelation(
            values1,
            values2
          );
          relationships.push({
            correlation,
            columns: [col1.name, col2.name],
          });
        }
      }
    }

    // Check for temporal data
    const datetimeColumns = columns.filter(col => col.type === 'datetime');
    const temporal =
      datetimeColumns.length > 0
        ? {
            hasTimeColumn: true,
            timeColumn: datetimeColumns[0]?.name,
          }
        : { hasTimeColumn: false };

    return {
      columns,
      rowCount: Object.values(data)[0]?.length || 0,
      relationships,
      temporal,
    };
  }

  /**
   * Detect distribution pattern in numeric data
   */
  private static detectDistribution(
    values: number[]
  ): 'normal' | 'skewed' | 'uniform' | 'bimodal' {
    if (values.length < 10) return 'uniform';

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    // Simple skewness calculation
    const skewness =
      values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) /
      values.length;

    if (Math.abs(skewness) < 0.5) return 'normal';
    return 'skewed';
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private static calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const sumX = x.slice(0, n).reduce((sum, val) => sum + val, 0);
    const sumY = y.slice(0, n).reduce((sum, val) => sum + val, 0);
    const sumXY = x
      .slice(0, n)
      .reduce((sum, val, i) => sum + val * (y[i] || 0), 0);
    const sumX2 = x.slice(0, n).reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.slice(0, n).reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }
}

// Export singleton instance
export const chartRecommendationEngine = new ChartRecommendationEngine();
