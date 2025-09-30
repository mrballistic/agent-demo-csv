/**
 * Conversation Agent - Smart routing between semantic layer and LLM
 *
 * This agent manages the conversation flow and decides whether to:
 * - Use the semantic layer for structured queries
 * - Route to LLM for complex analysis
 * - Generate insights from analysis results
 * - Maintain conversation context
 */
import { BaseAgent } from './base';
import { AgentType, AgentExecutionContext } from './types';
import { conversationManager } from '@/lib/openai-responses';
import { QueryPlannerAgent } from './query-planner-agent';
import { SemanticExecutorAgent } from './semantic-executor-agent';
import { DataProfilingAgent } from './profiling-agent';
import { fileStore } from '@/lib/file-store';

// Input interface for conversation requests
export interface ConversationInput {
  sessionId: string;
  query: string;
  fileId?: string;
  context?: ConversationContext;
  preferSemanticLayer?: boolean;
}

// Conversation context for maintaining state
export interface ConversationContext {
  previousAnalyses: AnalysisReference[];
  currentDataProfile?: any;
  csvContent?: string | undefined;
  conversationHistory: ConversationTurn[];
  userPreferences: UserPreferences;
}

export interface AnalysisReference {
  id: string;
  query: string;
  result: any;
  timestamp: Date;
  type: 'semantic' | 'llm';
  confidence: number;
}

export interface ConversationTurn {
  id: string;
  userMessage: string;
  agentResponse: string;
  timestamp: Date;
  agentPath: AgentType[];
  confidence: number;
}

export interface UserPreferences {
  preferredChartTypes: string[];
  detailLevel: 'brief' | 'detailed' | 'comprehensive';
  includeInsights: boolean;
  includeVisualization: boolean;
}

// Output interface for conversation responses
export interface ConversationOutput {
  response: string;
  agentPath: AgentType[];
  confidence: number;
  usedSemanticLayer: boolean;
  insights?: GeneratedInsight[];
  visualization?: ChartOutput;
  followUpSuggestions: string[];
  context: ConversationContext;
}

export interface GeneratedInsight {
  type: 'summary' | 'trend' | 'comparison' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  data?: any;
}

export interface ChartOutput {
  svg: string;
  type: string;
  config: any;
  accessibility: {
    altText: string;
    description: string;
  };
}

/**
 * ConversationAgent - Manages intelligent conversation flow
 */
export class ConversationAgent extends BaseAgent<
  ConversationInput,
  ConversationOutput
> {
  readonly type = AgentType.CONVERSATION;
  readonly name = 'ConversationAgent';
  readonly version = '1.0.0';

  // Confidence thresholds for routing decisions
  private readonly SEMANTIC_CONFIDENCE_THRESHOLD = 0.7;
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.3;

  // Context storage (in production, would use Redis or similar)

  private contextStore = new Map<string, ConversationContext>();

  // Suppress system/info/debug messages from chat window
  protected info(message: string, meta?: any) {
    // Only log to server console, not to chat output
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info(`[ConversationAgent] ${message}`, meta || '');
    }
  }

  protected warn(message: string, meta?: any) {
    // Only log to server console, not to chat output
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[ConversationAgent] ${message}`, meta || '');
    }
  }

  constructor() {
    super();
    this.info('ConversationAgent initialized');
  }

  /**
   * Main execution method - routes between semantic layer and LLM
   */
  protected async executeInternal(
    input: ConversationInput,
    context: AgentExecutionContext
  ): Promise<ConversationOutput> {
    const startTime = Date.now();

    if (
      !input.query ||
      typeof input.query !== 'string' ||
      input.query.trim().length === 0
    ) {
      this.warn('ConversationAgent received an undefined or empty query', {
        input,
      });
      throw new Error('Query is required for conversation processing.');
    }

    this.info('Processing conversation request', {
      sessionId: input.sessionId,
      query: input.query.substring(0, 100) + '...',
      hasFileId: !!input.fileId,
      preferSemanticLayer: input.preferSemanticLayer,
    });

    try {
      // Load or initialize conversation context
      const conversationContext = await this.getOrCreateContext(input);

      // Load CSV content if fileId provided
      let csvContent: string | undefined;
      if (input.fileId) {
        csvContent = await this.loadCsvContent(input.fileId);
        if (csvContent) {
          conversationContext.csvContent = csvContent;
        }
      }

      // Determine routing strategy
      const routingDecision = await this.determineRoutingStrategy(
        input.query,
        conversationContext,
        input.preferSemanticLayer
      );

      this.info('Routing decision made', {
        strategy: routingDecision.strategy,
        confidence: routingDecision.confidence,
        reasons: routingDecision.reasons,
      });

      let result: ConversationOutput;

      // Route based on strategy
      switch (routingDecision.strategy) {
        case 'semantic_only':
          result = await this.processSemanticQuery(
            input,
            conversationContext,
            context
          );
          break;
        case 'llm_only':
          result = await this.processLLMQuery(
            input,
            conversationContext,
            context
          );
          break;
        case 'hybrid':
          result = await this.processHybridQuery(
            input,
            conversationContext,
            context
          );
          break;
        default:
          throw new Error(
            `Unknown routing strategy: ${routingDecision.strategy}`
          );
      }

      // Update conversation context
      await this.updateConversationContext(
        input.sessionId,
        result,
        conversationContext
      );

      // Generate follow-up suggestions
      result.followUpSuggestions = await this.generateFollowUpSuggestions(
        result,
        conversationContext
      );

      const executionTime = Date.now() - startTime;
      this.info('Conversation processing completed', {
        executionTime,
        strategy: routingDecision.strategy,
        confidence: result.confidence,
        agentPath: result.agentPath,
      });

      return result;
    } catch (error) {
      this.warn('Conversation processing failed, using LLM fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to direct LLM processing
      return await this.fallbackToLLM(input, context);
    }
  }

  /**
   * Determine the best routing strategy based on query analysis
   */
  private async determineRoutingStrategy(
    query: string,
    context: ConversationContext,
    preferSemanticLayer?: boolean
  ): Promise<{
    strategy: 'semantic_only' | 'llm_only' | 'hybrid';
    confidence: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    // Check if we have CSV data available for semantic processing
    const hasDataForSemantic = !!(
      context.csvContent || context.currentDataProfile
    );
    if (!hasDataForSemantic) {
      reasons.push('No CSV data available for semantic processing');
      return { strategy: 'llm_only', confidence: 0.9, reasons };
    }

    try {
      // Use QueryPlannerAgent to analyze the query
      const queryPlanner = new QueryPlannerAgent();
      const plannerResult = await queryPlanner.execute(
        {
          query,
          profile: context.currentDataProfile,
        },
        {
          requestId: `routing-${Date.now()}`,
          startTime: new Date(),
          timeout: 5000,
        }
      );

      if (!plannerResult.success || !plannerResult.data) {
        reasons.push('Query planning failed');
        return { strategy: 'llm_only', confidence: 0.8, reasons };
      }

      const confidence = plannerResult.data.queryIntent.confidence;
      const intentType = plannerResult.data.queryIntent.type;

      // Apply user preferences
      if (preferSemanticLayer && confidence > this.LOW_CONFIDENCE_THRESHOLD) {
        reasons.push('User preference for semantic layer');
        return {
          strategy: 'semantic_only',
          confidence: Math.min(confidence + 0.1, 1.0),
          reasons,
        };
      }

      // High confidence semantic queries
      if (confidence >= this.SEMANTIC_CONFIDENCE_THRESHOLD) {
        reasons.push(
          `High confidence semantic query (${confidence.toFixed(2)})`
        );
        reasons.push(`Intent type: ${intentType}`);
        return { strategy: 'semantic_only', confidence, reasons };
      }

      // Medium confidence - use hybrid approach
      if (confidence >= this.LOW_CONFIDENCE_THRESHOLD) {
        reasons.push(`Medium confidence query (${confidence.toFixed(2)})`);
        reasons.push('Using hybrid approach for best results');
        return { strategy: 'hybrid', confidence, reasons };
      }

      // Low confidence - route to LLM
      reasons.push(
        `Low confidence semantic parsing (${confidence.toFixed(2)})`
      );
      reasons.push('Complex query requires LLM processing');
      return { strategy: 'llm_only', confidence: 1.0 - confidence, reasons };
    } catch (error) {
      reasons.push('Error during query analysis');
      this.warn('Query analysis failed, defaulting to LLM', { error });
      return { strategy: 'llm_only', confidence: 0.7, reasons };
    }
  }

  /**
   * Process query using semantic layer only
   */
  private async processSemanticQuery(
    input: ConversationInput,
    context: ConversationContext,
    execContext: AgentExecutionContext
  ): Promise<ConversationOutput> {
    this.info('Processing semantic-only query');

    try {
      // Check if we have the data profile needed for semantic processing
      if (!context.currentDataProfile) {
        throw new Error('No data profile available for semantic processing');
      }

      // Create semantic agents directly instead of using global orchestrator
      // This ensures we have the agents available even if orchestrator isn't properly configured
      const queryPlannerAgent = new QueryPlannerAgent();
      const semanticExecutorAgent = new SemanticExecutorAgent();

      // Plan the query
      const plannerResult = await queryPlannerAgent.execute(
        {
          query: input.query,
          profile: context.currentDataProfile,
        },
        execContext
      );

      if (!plannerResult.success) {
        throw new Error(`Query planning failed: ${plannerResult.error}`);
      }

      const plannerData = plannerResult.data as {
        queryIntent: any;
        executionPlan: any;
      };

      // Execute the planned query with the current data profile
      const executorResult = await semanticExecutorAgent.execute(
        {
          executionPlan: plannerData.executionPlan,
          queryIntent: plannerData.queryIntent,
          profile: context.currentDataProfile,
        },
        execContext
      );

      if (!executorResult.success) {
        throw new Error(`Semantic execution failed: ${executorResult.error}`);
      }

      const semanticResult = executorResult.data as any;

      // Check if the semantic result indicates LLM processing is needed
      if (semanticResult.requiresLLMProcessing) {
        this.info('Semantic processing indicates LLM fallback needed', {
          reason: semanticResult.llmFallbackReason,
        });
        // Fall back to LLM processing
        return await this.processLLMQuery(input, context, execContext);
      }

      // Generate insights from semantic results
      const insights =
        await this.generateInsightsFromSemanticResult(semanticResult);

      // Create conversational response from structured data
      const response = await this.createConversationalResponse(
        semanticResult,
        insights
      );

      // Ensure we have a valid response
      if (!response || response.trim().length === 0) {
        this.warn(
          'Semantic processing returned empty response, falling back to LLM'
        );
        return await this.processLLMQuery(input, context, execContext);
      }

      return {
        response,
        agentPath: [
          AgentType.CONVERSATION,
          AgentType.QUERY_PLANNING,
          AgentType.SEMANTIC_EXECUTOR,
        ],
        confidence: plannerData.queryIntent?.confidence || 0.8,
        usedSemanticLayer: true,
        insights,
        followUpSuggestions: [],
        context,
      };
    } catch (error) {
      this.warn('Semantic processing failed, falling back to LLM', { error });
      return await this.processLLMQuery(input, context, execContext);
    }
  }

  /**
   * Process query using LLM only
   */
  private async processLLMQuery(
    input: ConversationInput,
    context: ConversationContext,
    execContext: AgentExecutionContext
  ): Promise<ConversationOutput> {
    this.info('Processing LLM-only query', {
      query: input.query?.substring(0, 100) + '...',
      hasFileId: !!input.fileId,
      hasCsvContent: !!context.csvContent,
    });

    try {
      // Stream analysis using ConversationManager
      let accumulatedResponse = '';
      let structuredOutput: any = null;

      // For ConversationAgent, we should use streamConversation for follow-up questions
      // streamAnalysis is only for initial CSV analysis, not for conversation flow
      const stream = conversationManager.streamConversation(
        input.sessionId,
        input.query,
        input.fileId
      );

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          accumulatedResponse += chunk.data.delta || '';
        } else if (chunk.type === 'structured_output') {
          structuredOutput = chunk.data;
          // Only overwrite if the insight is defined and non-empty
          if (
            structuredOutput.insight &&
            typeof structuredOutput.insight === 'string' &&
            structuredOutput.insight.trim().length > 0
          ) {
            accumulatedResponse = structuredOutput.insight;
          }
        } else if (chunk.type === 'error') {
          throw new Error(chunk.data.error);
        }
      }

      // Extract insights from structured output if available
      const insights = structuredOutput
        ? await this.extractInsightsFromStructuredOutput(structuredOutput)
        : [];

      // Defensive: never return undefined or empty response
      const finalResponse =
        accumulatedResponse && accumulatedResponse.trim().length > 0
          ? accumulatedResponse.trim()
          : 'I analyzed your data, but could not generate a detailed summary. Please try rephrasing your question or ask for a specific insight.';

      return {
        response: finalResponse,
        agentPath: [AgentType.CONVERSATION],
        confidence: 0.8, // LLM responses have consistent confidence
        usedSemanticLayer: false,
        insights,
        followUpSuggestions: [],
        context,
      };
    } catch (error) {
      this.warn('LLM processing failed', { error });
      throw error;
    }
  }

  /**
   * Process query using hybrid approach (semantic + LLM enhancement)
   */
  private async processHybridQuery(
    input: ConversationInput,
    context: ConversationContext,
    execContext: AgentExecutionContext
  ): Promise<ConversationOutput> {
    this.info('Processing hybrid query (semantic + LLM)');

    try {
      // First, try semantic processing
      const semanticResult = await this.processSemanticQuery(
        input,
        context,
        execContext
      );

      // If semantic confidence is reasonable, enhance with LLM insights
      if (semanticResult.confidence > this.LOW_CONFIDENCE_THRESHOLD) {
        try {
          // Use LLM to enhance the semantic results with additional context
          const enhancedResponse = await this.enhanceSemanticWithLLM(
            input.query,
            semanticResult.response,
            context
          );

          return {
            ...semanticResult,
            response: enhancedResponse,
            agentPath: [...semanticResult.agentPath, AgentType.CONVERSATION],
            confidence: Math.min(semanticResult.confidence + 0.1, 1.0),
          };
        } catch (enhanceError) {
          this.warn('LLM enhancement failed, returning semantic result', {
            enhanceError,
          });
          return semanticResult;
        }
      }

      // If semantic confidence is too low, fall back to LLM
      return await this.processLLMQuery(input, context, execContext);
    } catch (error) {
      this.warn('Hybrid processing failed, falling back to LLM', { error });
      return await this.processLLMQuery(input, context, execContext);
    }
  }

  /**
   * Get or create conversation context
   */
  private async getOrCreateContext(
    input: ConversationInput
  ): Promise<ConversationContext> {
    const existingContext = this.contextStore.get(input.sessionId);

    if (existingContext) {
      // Update with any new context provided
      if (input.context) {
        Object.assign(existingContext, input.context);
      }
      return existingContext;
    }

    // Create new context
    const newContext: ConversationContext = {
      previousAnalyses: [],
      conversationHistory: [],
      userPreferences: {
        preferredChartTypes: ['bar', 'line', 'pie'],
        detailLevel: 'detailed',
        includeInsights: true,
        includeVisualization: true,
      },
      ...input.context,
    };

    // Load current data profile if fileId is provided
    if (input.fileId) {
      newContext.currentDataProfile = await this.loadDataProfile(input.fileId);
    }

    this.contextStore.set(input.sessionId, newContext);
    return newContext;
  }

  /**
   * Load CSV content from file store
   */
  private async loadCsvContent(fileId: string): Promise<string | undefined> {
    try {
      const fileBuffer = await fileStore.getFile(fileId);
      return fileBuffer?.toString('utf-8');
    } catch (error) {
      this.warn('Failed to load CSV content', { fileId, error });
      return undefined;
    }
  }

  /**
   * Load data profile associated with file
   */
  private async loadDataProfile(fileId: string): Promise<any | undefined> {
    try {
      // Try to get existing profile from session store or similar
      // For now, we'll create it on-demand using DataProfilingAgent
      const csvContent = await this.loadCsvContent(fileId);
      if (!csvContent) return undefined;

      const profilingAgent = new DataProfilingAgent();
      const result = await profilingAgent.execute(
        {
          buffer: Buffer.from(csvContent, 'utf-8'),
          name: `${fileId}.csv`,
          mimeType: 'text/csv',
          size: csvContent.length,
        },
        {
          requestId: `profile-${Date.now()}`,
          startTime: new Date(),
          timeout: 10000,
        }
      );

      return result.success ? result.data : undefined;
    } catch (error) {
      this.warn('Failed to load data profile', { fileId, error });
      return undefined;
    }
  }

  /**
   * Generate insights from semantic query results
   */
  private async generateInsightsFromSemanticResult(
    semanticResult: any
  ): Promise<GeneratedInsight[]> {
    const insights: GeneratedInsight[] = [];

    // Extract key insights from the structured semantic result
    if (semanticResult.data && Array.isArray(semanticResult.data)) {
      const dataLength = semanticResult.data.length;

      insights.push({
        type: 'summary',
        title: 'Data Summary',
        description: `Found ${dataLength} records matching your query criteria.`,
        confidence: 0.9,
        data: { recordCount: dataLength },
      });

      // Add trend insights if data has numeric values
      const numericColumns = this.findNumericColumns(semanticResult.data);
      if (numericColumns.length > 0) {
        insights.push({
          type: 'trend',
          title: 'Numeric Analysis',
          description: `Analysis includes ${numericColumns.length} numeric columns: ${numericColumns.join(', ')}.`,
          confidence: 0.8,
          data: { numericColumns },
        });
      }
    }

    return insights;
  }

  /**
   * Create conversational response from structured semantic data
   */
  private async createConversationalResponse(
    semanticResult: any,
    insights: GeneratedInsight[]
  ): Promise<string> {
    let response = '';

    // Handle cases where semantic result is undefined or incomplete
    if (!semanticResult) {
      return 'I encountered an issue processing your query. Please try rephrasing your question.';
    }

    // Start with a natural greeting based on the query intent
    const intentType = semanticResult.queryIntent?.type || 'analysis';
    response += this.getIntentGreeting(intentType);

    // Add data summary
    if (semanticResult.data && Array.isArray(semanticResult.data)) {
      response += ` I found ${semanticResult.data.length} records that match your criteria.`;
    } else {
      response += ' I analyzed your data based on the available information.';
    }

    // Add key insights
    if (insights.length > 0) {
      response += '\n\nKey findings:\n';
      insights.forEach((insight, index) => {
        response += `${index + 1}. ${insight.description}\n`;
      });
    }

    // Add specific data points if available
    if (semanticResult.data && semanticResult.data.length > 0) {
      const sampleData = semanticResult.data.slice(0, 3);
      response += '\n\nHere are some sample results:\n';
      sampleData.forEach((record: any, index: number) => {
        const keys = Object.keys(record).slice(0, 3); // Show first 3 columns
        const summary = keys.map(key => `${key}: ${record[key]}`).join(', ');
        response += `${index + 1}. ${summary}\n`;
      });
    }

    // If we still don't have much content, add a helpful message
    if (response.trim().length < 50) {
      response +=
        '\n\nFor more detailed analysis, you may want to ask more specific questions about your data.';
    }

    return response.trim();
  }

  /**
   * Get appropriate greeting based on query intent
   */
  private getIntentGreeting(intentType: string): string {
    switch (intentType) {
      case 'trend':
        return "I've analyzed the trends in your data.";
      case 'comparison':
        return "I've compared the values across your dataset.";
      case 'aggregation':
        return "I've calculated the aggregated values you requested.";
      case 'filter':
        return "I've filtered your data based on your criteria.";
      case 'profile':
        return "I've profiled your dataset to understand its structure.";
      default:
        return "I've analyzed your data.";
    }
  }

  /**
   * Find numeric columns in data
   */
  private findNumericColumns(data: any[]): string[] {
    if (!data || data.length === 0) return [];

    const firstRecord = data[0];
    const numericColumns: string[] = [];

    for (const [key, value] of Object.entries(firstRecord)) {
      if (
        typeof value === 'number' ||
        (!isNaN(Number(value)) && value !== null && value !== '')
      ) {
        numericColumns.push(key);
      }
    }

    return numericColumns;
  }

  /**
   * Extract insights from LLM structured output
   */
  private async extractInsightsFromStructuredOutput(
    structuredOutput: any
  ): Promise<GeneratedInsight[]> {
    const insights: GeneratedInsight[] = [];

    // Extract insights from the structured response
    if (structuredOutput.insights) {
      structuredOutput.insights.forEach((insight: any) => {
        insights.push({
          type: insight.type || 'summary',
          title: insight.title || 'Insight',
          description: insight.description || insight.insight || '',
          confidence: insight.confidence || 0.7,
          data: insight.data,
        });
      });
    }

    return insights;
  }

  /**
   * Enhance semantic results with LLM context
   */
  private async enhanceSemanticWithLLM(
    originalQuery: string,
    semanticResponse: string,
    context: ConversationContext
  ): Promise<string> {
    try {
      const enhancementPrompt = `Based on this semantic analysis result, provide additional context and insights:

Original Query: ${originalQuery}

Semantic Analysis Result: ${semanticResponse}

Please enhance this with:
1. Additional context about what this means
2. Potential implications or next steps
3. Related questions the user might want to ask

Keep your response conversational and helpful.`;

      // Use conversation manager for enhancement
      let enhancedResponse = '';
      const stream = conversationManager.streamConversation(
        'enhancement',
        enhancementPrompt
      );

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          enhancedResponse += chunk.data.delta || '';
        } else if (chunk.type === 'error') {
          throw new Error(chunk.data.error);
        }
      }

      return `${semanticResponse}\n\n${enhancedResponse}`;
    } catch (error) {
      this.warn('LLM enhancement failed', { error });
      return semanticResponse;
    }
  }

  /**
   * Update conversation context with new results
   */
  private async updateConversationContext(
    sessionId: string,
    result: ConversationOutput,
    context: ConversationContext
  ): Promise<void> {
    // Add to conversation history
    const turn: ConversationTurn = {
      id: `turn-${Date.now()}`,
      userMessage: '', // Would need to be passed from input
      agentResponse: result.response,
      timestamp: new Date(),
      agentPath: result.agentPath,
      confidence: result.confidence,
    };

    context.conversationHistory.push(turn);

    // Add to analysis references if it was a significant analysis
    if (result.usedSemanticLayer || result.insights) {
      const analysisRef: AnalysisReference = {
        id: `analysis-${Date.now()}`,
        query: '', // Would need to be passed from input
        result: {
          // Store only the essential parts to avoid circular references
          response: result.response,
          confidence: result.confidence,
          usedSemanticLayer: result.usedSemanticLayer,
          agentPath: result.agentPath,
          insights: result.insights || [],
          followUpSuggestions: result.followUpSuggestions || [],
          // Exclude context to prevent circular references
        },
        timestamp: new Date(),
        type: result.usedSemanticLayer ? 'semantic' : 'llm',
        confidence: result.confidence,
      };

      context.previousAnalyses.push(analysisRef);
    }

    // Keep only recent history (last 10 turns)
    context.conversationHistory = context.conversationHistory.slice(-10);
    context.previousAnalyses = context.previousAnalyses.slice(-5);

    // Update context store
    this.contextStore.set(sessionId, context);
  }

  /**
   * Generate follow-up suggestions based on conversation context
   */
  private async generateFollowUpSuggestions(
    result: ConversationOutput,
    context: ConversationContext
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Base suggestions on the type of analysis performed
    if (result.usedSemanticLayer) {
      suggestions.push(
        'Can you show me the data in a different chart type?',
        'What are the key trends in this data?',
        'Can you filter this data by a specific criteria?'
      );
    }

    // Add context-specific suggestions based on data profile
    if (context.currentDataProfile) {
      const columnNames =
        context.currentDataProfile.schema?.columns?.map(
          (col: any) => col.name
        ) || [];
      if (columnNames.length > 0) {
        suggestions.push(`Tell me more about the ${columnNames[0]} column`);
        if (columnNames.length > 1) {
          suggestions.push(`Compare ${columnNames[0]} and ${columnNames[1]}`);
        }
      }
    }

    // Limit to 3 most relevant suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Fallback to direct LLM processing when all else fails
   */
  private async fallbackToLLM(
    input: ConversationInput,
    context: AgentExecutionContext
  ): Promise<ConversationOutput> {
    this.warn('Using LLM fallback due to conversation processing failure');

    try {
      let response = '';
      const stream = conversationManager.streamConversation(
        input.sessionId,
        input.query,
        input.fileId
      );

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          response += chunk.data.delta || '';
        } else if (chunk.type === 'error') {
          throw new Error(chunk.data.error);
        }
      }

      return {
        response:
          response ||
          'I apologize, but I encountered an issue processing your request.',
        agentPath: [AgentType.CONVERSATION],
        confidence: 0.5,
        usedSemanticLayer: false,
        followUpSuggestions: [
          'Could you rephrase your question?',
          'Would you like to try a different analysis?',
          'Can you provide more specific details?',
        ],
        context: this.contextStore.get(input.sessionId) || {
          previousAnalyses: [],
          conversationHistory: [],
          userPreferences: {
            preferredChartTypes: ['bar', 'line'],
            detailLevel: 'detailed',
            includeInsights: true,
            includeVisualization: true,
          },
        },
      };
    } catch (error) {
      throw new Error(
        `Conversation processing completely failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate conversation input
   */
  validateInput(input: ConversationInput): boolean {
    return !!(
      input &&
      input.sessionId &&
      input.query &&
      typeof input.sessionId === 'string' &&
      typeof input.query === 'string' &&
      input.query.trim().length > 0
    );
  }

  /**
   * Clean up resources when disposing
   */
  async dispose(): Promise<void> {
    this.info('Disposing ConversationAgent');
    this.contextStore.clear();
    await super.dispose();
  }
}
