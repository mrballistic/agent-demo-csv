/**
 * Intent Classifier
 *
 * Analyzes natural language queries to identify intent and extract entities
 */

import {
  QueryType,
  QueryIntent,
  QueryEntity,
  QueryPattern,
  IntentClassificationResult,
} from './query-types';

export class IntentClassifier {
  private patterns: QueryPattern[] = [];

  constructor() {
    this.initializePatterns();
  }

  /**
   * Classify user query intent
   */
  public classifyIntent(
    query: string,
    availableColumns: string[] = []
  ): IntentClassificationResult {
    const startTime = Date.now();
    const normalizedQuery = query.toLowerCase().trim();

    // Try pattern matching first
    const patternMatches = this.matchPatterns(normalizedQuery);

    // Use the highest confidence match or default to UNKNOWN
    const bestMatch = patternMatches[0] || {
      type: QueryType.UNKNOWN,
      confidence: 0.1,
      reason: 'No clear pattern matched',
    };

    // Extract entities based on the identified intent
    const entities = this.extractEntities(
      normalizedQuery,
      bestMatch.type,
      availableColumns
    );

    // Build the query intent
    const timeEntity = entities.find(e => e.type === 'time');
    const limitEntity = entities.find(e => e.type === 'limit');

    const intent: QueryIntent = {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      entities,
      originalQuery: query,
      measures: entities
        .filter(e => e.type === 'measure')
        .map(e => e.column || e.value),
      dimensions: entities
        .filter(e => e.type === 'dimension')
        .map(e => e.column || e.value),
      filters: entities.filter(e => e.type === 'filter'),
      timeColumn: timeEntity?.column,
      limit: limitEntity?.value ? parseInt(limitEntity.value) : undefined,
      requiresLLM: this.shouldUseLLM(
        bestMatch.type,
        bestMatch.confidence,
        entities
      ),
      canUseCache: this.canCacheQuery(bestMatch.type, entities),
      estimatedCost: this.estimateQueryCost(bestMatch.type, entities),
    };

    return {
      intent,
      alternatives: patternMatches.slice(1, 4),
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Initialize query patterns for intent recognition
   */
  private initializePatterns(): void {
    this.patterns = [
      // More specific patterns first - they have higher priority

      // Aggregation patterns (very specific)
      {
        pattern:
          /(sum|total|average|avg|mean|count|max|maximum|min|minimum) (of )?(\w+)/,
        type: QueryType.AGGREGATION,
        confidence: 0.9,
        entityExtractors: {
          measures: [
            /(?:sum|total|average|avg|mean|count|max|maximum|min|minimum) (?:of )?(\w+)/g,
          ],
        },
        examples: ['Sum of sales', 'Average price', 'Count of orders'],
      },

      // Relationship patterns (should come before comparison to catch "between")
      {
        pattern: /(correlation|relationship|related|depends)/,
        type: QueryType.RELATIONSHIP,
        confidence: 0.75,
        entityExtractors: {
          measures: [/\b(sales|revenue|price|age|score)\w*\b/g],
        },
        examples: [
          'Correlation between price and sales',
          'Relationship of age to income',
        ],
      },

      // Trend patterns (specific time-related analysis)
      {
        pattern:
          /(trend|over time|time series|growth|decline|changes?.*over|changes?.*by)/,
        type: QueryType.TREND,
        confidence: 0.85,
        entityExtractors: {
          timeColumns: [/\b(date|time|month|year|day)\w*\b/g],
          measures: [/\b(sales|revenue|price|amount|count|total)\w*\b/g],
        },
        examples: ['Show sales trends over time', 'Revenue growth by month'],
      },

      // Ranking patterns
      {
        pattern: /(top|bottom|highest|lowest|best|worst)/,
        type: QueryType.RANKING,
        confidence: 0.85,
        entityExtractors: {
          limits: [/(?:top|bottom|highest|lowest|best|worst) (\d+)/g],
          measures: [/\b(sales|revenue|price|score|rating)\w*\b/g],
        },
        examples: ['Top 10 customers', 'Highest revenue products'],
      },

      // Distribution patterns
      {
        pattern: /(distribution|spread|histogram|frequency)/,
        type: QueryType.DISTRIBUTION,
        confidence: 0.8,
        entityExtractors: {
          measures: [
            /(?:distribution|spread|histogram|frequency) (?:of )?(\w+)/g,
          ],
        },
        examples: ['Distribution of ages', 'Price histogram'],
      },

      // Filter patterns
      {
        pattern: /(show only|filter|where|>|<|>=|<=|contains|like)/,
        type: QueryType.FILTER,
        confidence: 0.75,
        entityExtractors: {
          filters: [/(where|=|>|<|>=|<=|contains|like)\s+(\w+)/g],
        },
        examples: ['Show only sales > 1000', 'Filter where region = North'],
      },

      // Comparison patterns (less specific, comes after relationship)
      {
        pattern: /(compare|vs|versus|difference|between)/,
        type: QueryType.COMPARISON,
        confidence: 0.7,
        entityExtractors: {
          dimensions: [/\b(category|type|group|region|channel)\w*\b/g],
          measures: [/\b(sales|revenue|count|total|average)\w*\b/g],
        },
        examples: ['Compare sales vs revenue', 'Difference between regions'],
      },

      // Profile patterns (broadest, should come last)
      {
        pattern:
          /(what.*data|tell me.*data|show me.*overview|describe.*dataset|overview|summary|profile)/,
        type: QueryType.PROFILE,
        confidence: 0.9,
        entityExtractors: {},
        examples: [
          'What is in this data?',
          'Show me an overview',
          'Describe the dataset',
        ],
      },
    ];
  }

  private matchPatterns(query: string) {
    const matches: Array<{
      type: QueryType;
      confidence: number;
      reason: string;
    }> = [];

    for (const pattern of this.patterns) {
      if (pattern.pattern.test(query)) {
        matches.push({
          type: pattern.type,
          confidence: pattern.confidence,
          reason: `Matched pattern: ${pattern.pattern.source}`,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private extractEntities(
    query: string,
    intentType: QueryType,
    availableColumns: string[]
  ): QueryEntity[] {
    const entities: QueryEntity[] = [];
    const pattern = this.patterns.find(p => p.type === intentType);
    if (!pattern) return entities;

    // Extract measures
    if (pattern.entityExtractors.measures) {
      for (const regex of pattern.entityExtractors.measures) {
        const matches = Array.from(query.matchAll(regex));
        for (const match of matches) {
          const value = match[1] || match[0];
          const matchedColumn = this.findBestColumnMatch(
            value,
            availableColumns
          );

          entities.push({
            type: 'measure',
            value,
            column: matchedColumn,
            confidence: matchedColumn ? 0.9 : 0.6,
          });
        }
      }
    }

    // Extract dimensions
    if (pattern.entityExtractors.dimensions) {
      for (const regex of pattern.entityExtractors.dimensions) {
        const matches = Array.from(query.matchAll(regex));
        for (const match of matches) {
          const value = match[1] || match[0];
          const matchedColumn = this.findBestColumnMatch(
            value,
            availableColumns
          );

          entities.push({
            type: 'dimension',
            value,
            column: matchedColumn,
            confidence: matchedColumn ? 0.8 : 0.5,
          });
        }
      }
    }

    // Extract time columns
    if (pattern.entityExtractors.timeColumns) {
      for (const regex of pattern.entityExtractors.timeColumns) {
        const matches = Array.from(query.matchAll(regex));
        for (const match of matches) {
          const value = match[1] || match[0];
          const matchedColumn = this.findBestColumnMatch(
            value,
            availableColumns,
            ['date', 'time']
          );

          entities.push({
            type: 'time',
            value,
            column: matchedColumn,
            confidence: matchedColumn ? 0.9 : 0.4,
          });
        }
      }
    }

    // Extract limits
    if (pattern.entityExtractors.limits) {
      for (const regex of pattern.entityExtractors.limits) {
        const matches = Array.from(query.matchAll(regex));
        for (const match of matches) {
          if (match[1]) {
            entities.push({
              type: 'limit',
              value: match[1],
              confidence: 0.9,
            });
          }
        }
      }
    }

    // Extract filters for filter queries
    if (pattern.entityExtractors.filters || intentType === QueryType.FILTER) {
      // Add a filter entity for filter queries to ensure canUseCache works correctly
      if (intentType === QueryType.FILTER) {
        entities.push({
          type: 'filter',
          value: 'filter_condition',
          confidence: 0.8,
        });
      }

      if (pattern.entityExtractors.filters) {
        for (const regex of pattern.entityExtractors.filters) {
          const matches = Array.from(query.matchAll(regex));
          for (const match of matches) {
            entities.push({
              type: 'filter',
              value: match[2] || match[1] || match[0],
              confidence: 0.7,
            });
          }
        }
      }
    }

    // Extract any column names mentioned in the query
    for (const column of availableColumns) {
      if (query.includes(column.toLowerCase())) {
        // Determine if it's likely a measure or dimension
        const isMeasure = [
          'price',
          'amount',
          'total',
          'count',
          'sales',
          'revenue',
          'quantity',
          'cost',
          'value',
        ].some(measure => column.toLowerCase().includes(measure));

        if (
          isMeasure &&
          !entities.some(e => e.column === column && e.type === 'measure')
        ) {
          entities.push({
            type: 'measure',
            value: column,
            column: column,
            confidence: 0.9,
          });
        } else if (
          !isMeasure &&
          !entities.some(e => e.column === column && e.type === 'dimension')
        ) {
          entities.push({
            type: 'dimension',
            value: column,
            column: column,
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  private findBestColumnMatch(
    term: string,
    availableColumns: string[],
    preferredTypes: string[] = []
  ): string | undefined {
    const lowerTerm = term.toLowerCase();

    // Exact match first
    const exactMatch = availableColumns.find(
      col => col.toLowerCase() === lowerTerm
    );
    if (exactMatch) return exactMatch;

    // Partial match with preferred types
    if (preferredTypes.length > 0) {
      const preferredMatch = availableColumns.find(col => {
        const lowerCol = col.toLowerCase();
        return preferredTypes.some(
          type => lowerCol.includes(type) && lowerCol.includes(lowerTerm)
        );
      });
      if (preferredMatch) return preferredMatch;
    }

    // Partial match
    const partialMatch = availableColumns.find(
      col =>
        col.toLowerCase().includes(lowerTerm) ||
        lowerTerm.includes(col.toLowerCase())
    );
    return partialMatch;
  }

  private shouldUseLLM(
    intentType: QueryType,
    confidence: number,
    entities: QueryEntity[]
  ): boolean {
    if (intentType === QueryType.UNKNOWN) return true;
    if (confidence < 0.6) return true;
    if (intentType === QueryType.RELATIONSHIP) return true;
    return false;
  }

  private canCacheQuery(
    intentType: QueryType,
    entities: QueryEntity[]
  ): boolean {
    if (intentType === QueryType.PROFILE) return true;
    const hasFilters = entities.some(e => e.type === 'filter');
    return !hasFilters;
  }

  private estimateQueryCost(
    intentType: QueryType,
    entities: QueryEntity[]
  ): number {
    let cost = 1;

    switch (intentType) {
      case QueryType.PROFILE:
        cost = 2;
        break;
      case QueryType.AGGREGATION:
        cost = 3;
        break;
      case QueryType.FILTER:
        cost = 4;
        break;
      case QueryType.TREND:
        cost = 5;
        break;
      case QueryType.COMPARISON:
        cost = 6;
        break;
      case QueryType.DISTRIBUTION:
        cost = 7;
        break;
      case QueryType.RANKING:
        cost = 7;
        break;
      case QueryType.RELATIONSHIP:
        cost = 9;
        break;
      case QueryType.UNKNOWN:
        cost = 10;
        break;
    }

    const entityCount = entities.length;
    if (entityCount > 3) cost += 2;
    if (entityCount > 6) cost += 3;

    return Math.min(cost, 10);
  }
}
