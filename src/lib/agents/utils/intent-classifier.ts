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
      timeColumn: entities.find(e => e.type === 'time')?.column,
      limit: entities.find(e => e.type === 'limit')?.value
        ? parseInt(entities.find(e => e.type === 'limit')!.value)
        : undefined,
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
      alternatives: patternMatches.slice(1, 4), // Include up to 3 alternatives
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Initialize query patterns for intent recognition
   */
  private initializePatterns(): void {
    this.patterns = [
      // Profile patterns
      {
        pattern:
          /^(what|tell me|show me|describe).*(data|dataset|file|csv)|overview|summary|profile/,
        type: QueryType.PROFILE,
        confidence: 0.9,
        entityExtractors: {},
        examples: [
          'What is in this data?',
          'Show me an overview',
          'Describe the dataset',
        ],
      },

      // Trend patterns
      {
        pattern:
          /(trend|over time|time series|change|growth|decline).*(month|year|day|date|time)/,
        type: QueryType.TREND,
        confidence: 0.85,
        entityExtractors: {
          timeColumns: [/\b(date|time|month|year|day)\w*\b/g],
          measures: [/\b(sales|revenue|price|amount|count|total)\w*\b/g],
        },
        examples: ['Show sales trends over time', 'Revenue growth by month'],
      },

      // Comparison patterns
      {
        pattern: /(compare|vs|versus|difference|between).+and|compare.*to/,
        type: QueryType.COMPARISON,
        confidence: 0.8,
        entityExtractors: {
          dimensions: [/\b(category|type|group|region|channel)\w*\b/g],
          measures: [/\b(sales|revenue|count|total|average)\w*\b/g],
        },
        examples: ['Compare sales vs revenue', 'Difference between regions'],
      },

      // Aggregation patterns
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

      // Filter patterns
      {
        pattern: /(show|filter|where|only).*(where|=|>|<|>=|<=|contains|like)/,
        type: QueryType.FILTER,
        confidence: 0.75,
        entityExtractors: {
          filters: [/(where|=|>|<|>=|<=|contains|like)\s+(\w+)/g],
        },
        examples: ['Show only sales > 1000', 'Filter where region = North'],
      },

      // Distribution patterns
      {
        pattern: /(distribution|spread|histogram|frequency) (of )?(\w+)/,
        type: QueryType.DISTRIBUTION,
        confidence: 0.8,
        entityExtractors: {
          measures: [
            /(?:distribution|spread|histogram|frequency) (?:of )?(\w+)/g,
          ],
        },
        examples: ['Distribution of ages', 'Price histogram'],
      },

      // Ranking patterns
      {
        pattern: /(top|bottom|highest|lowest|best|worst) (\d+)?/,
        type: QueryType.RANKING,
        confidence: 0.85,
        entityExtractors: {
          limits: [/(?:top|bottom|highest|lowest|best|worst) (\d+)/g],
          measures: [/\b(sales|revenue|price|score|rating)\w*\b/g],
        },
        examples: ['Top 10 customers', 'Highest revenue products'],
      },

      // Relationship patterns
      {
        pattern: /(correlation|relationship|related|depends) (between|of|on)/,
        type: QueryType.RELATIONSHIP,
        confidence: 0.7,
        entityExtractors: {
          measures: [/\b(sales|revenue|price|age|score)\w*\b/g],
        },
        examples: [
          'Correlation between price and sales',
          'Relationship of age to income',
        ],
      },
    ];
  }

  /**
   * Match query against known patterns
   */
  private matchPatterns(query: string): Array<{
    type: QueryType;
    confidence: number;
    reason: string;
  }> {
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

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract entities from query based on intent type
   */
  private extractEntities(
    query: string,
    intentType: QueryType,
    availableColumns: string[]
  ): QueryEntity[] {
    const entities: QueryEntity[] = [];

    // Find the pattern for this intent type
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
          entities.push({
            type: 'limit',
            value: match[1],
            confidence: 0.9,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Find the best matching column for a given term
   */
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
    if (partialMatch) return partialMatch;

    return undefined;
  }

  /**
   * Determine if query requires LLM processing
   */
  private shouldUseLLM(
    intentType: QueryType,
    confidence: number,
    entities: QueryEntity[]
  ): boolean {
    // Always use LLM for unknown queries
    if (intentType === QueryType.UNKNOWN) return true;

    // Use LLM if confidence is too low
    if (confidence < 0.6) return true;

    // Use LLM for complex relationship queries
    if (intentType === QueryType.RELATIONSHIP) return true;

    // Use semantic layer for simple, high-confidence queries
    return false;
  }

  /**
   * Determine if query results can be cached
   */
  private canCacheQuery(
    intentType: QueryType,
    entities: QueryEntity[]
  ): boolean {
    // Profile queries can always be cached
    if (intentType === QueryType.PROFILE) return true;

    // Queries without filters can be cached
    const hasFilters = entities.some(e => e.type === 'filter');
    return !hasFilters;
  }

  /**
   * Estimate query execution cost (1-10 scale)
   */
  private estimateQueryCost(
    intentType: QueryType,
    entities: QueryEntity[]
  ): number {
    let cost = 1;

    // Base cost by intent type
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

    // Increase cost for multiple entities
    const entityCount = entities.length;
    if (entityCount > 3) cost += 2;
    if (entityCount > 6) cost += 3;

    return Math.min(cost, 10);
  }
}
