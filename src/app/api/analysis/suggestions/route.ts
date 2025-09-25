import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/lib/session-store';

export const runtime = 'nodejs';

interface SuggestionItem {
  id: string;
  label: string;
  description: string;
  requiredColumns: string[];
  analysisType: 'profile' | 'trend' | 'top-sku' | 'channel-mix' | 'outlier';
  enabled: boolean;
  reason?: string;
}

// Common column patterns for different analysis types
const COLUMN_PATTERNS = {
  date: ['date', 'order_date', 'created_at', 'timestamp', 'time'],
  revenue: ['revenue', 'total', 'amount', 'price', 'net_revenue', 'sales'],
  quantity: ['qty', 'quantity', 'units', 'count'],
  product: ['sku', 'product', 'item', 'product_id', 'product_name'],
  channel: ['channel', 'source', 'medium', 'platform'],
  category: ['category', 'type', 'group', 'segment'],
  customer: ['customer', 'user', 'client', 'customer_id'],
  region: ['region', 'country', 'state', 'location', 'area'],
};

function findColumnsByPattern(columns: string[], patterns: string[]): string[] {
  const lowerColumns = columns.map(col => col.toLowerCase());
  return columns.filter((col, index) => {
    const lowerCol = lowerColumns[index];
    return lowerCol && patterns.some(pattern => lowerCol.includes(pattern));
  });
}

function generateSuggestions(
  columns: string[],
  sampleData: string[][]
): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];

  // Find columns by patterns
  const dateColumns = findColumnsByPattern(columns, COLUMN_PATTERNS.date);
  const revenueColumns = findColumnsByPattern(columns, COLUMN_PATTERNS.revenue);
  const quantityColumns = findColumnsByPattern(
    columns,
    COLUMN_PATTERNS.quantity
  );
  const productColumns = findColumnsByPattern(columns, COLUMN_PATTERNS.product);
  const channelColumns = findColumnsByPattern(columns, COLUMN_PATTERNS.channel);
  const categoryColumns = findColumnsByPattern(
    columns,
    COLUMN_PATTERNS.category
  );
  const customerColumns = findColumnsByPattern(
    columns,
    COLUMN_PATTERNS.customer
  );
  const regionColumns = findColumnsByPattern(columns, COLUMN_PATTERNS.region);

  // 1. Data Profile - Always available
  suggestions.push({
    id: 'profile',
    label: 'Profile Data',
    description:
      'Get an overview of your data structure, quality, and key statistics',
    requiredColumns: [],
    analysisType: 'profile',
    enabled: true,
  });

  // 2. Revenue Trends - Requires date and revenue columns
  const hasTrendRequirements =
    dateColumns.length > 0 && revenueColumns.length > 0;
  const trendSuggestion: SuggestionItem = {
    id: 'trends',
    label: 'Revenue Trends',
    description: 'Analyze revenue patterns and trends over time',
    requiredColumns: ['date column', 'revenue column'],
    analysisType: 'trend',
    enabled: hasTrendRequirements,
  };

  if (!hasTrendRequirements) {
    trendSuggestion.reason = `Missing required columns: ${[
      dateColumns.length === 0 ? 'date column' : null,
      revenueColumns.length === 0 ? 'revenue column' : null,
    ]
      .filter(Boolean)
      .join(', ')}`;
  }

  suggestions.push(trendSuggestion);

  // 3. Top Products - Requires product and revenue/quantity columns
  const hasTopProductRequirements =
    productColumns.length > 0 &&
    (revenueColumns.length > 0 || quantityColumns.length > 0);
  const topProductsSuggestion: SuggestionItem = {
    id: 'top-products',
    label: 'Top Products',
    description: 'Identify best-performing products by revenue or quantity',
    requiredColumns: ['product column', 'revenue or quantity column'],
    analysisType: 'top-sku',
    enabled: hasTopProductRequirements,
  };

  if (!hasTopProductRequirements) {
    topProductsSuggestion.reason = `Missing required columns: ${[
      productColumns.length === 0 ? 'product column' : null,
      revenueColumns.length === 0 && quantityColumns.length === 0
        ? 'revenue or quantity column'
        : null,
    ]
      .filter(Boolean)
      .join(', ')}`;
  }

  suggestions.push(topProductsSuggestion);

  // 4. Channel Analysis - Requires channel and revenue columns
  const hasChannelRequirements =
    channelColumns.length > 0 && revenueColumns.length > 0;
  const channelSuggestion: SuggestionItem = {
    id: 'channel-mix',
    label: 'Channel Performance',
    description: 'Compare performance across different channels or sources',
    requiredColumns: ['channel column', 'revenue column'],
    analysisType: 'channel-mix',
    enabled: hasChannelRequirements,
  };

  if (!hasChannelRequirements) {
    channelSuggestion.reason = `Missing required columns: ${[
      channelColumns.length === 0 ? 'channel column' : null,
      revenueColumns.length === 0 ? 'revenue column' : null,
    ]
      .filter(Boolean)
      .join(', ')}`;
  }

  suggestions.push(channelSuggestion);

  // 5. Customer Analysis - Requires customer and revenue columns
  const hasCustomerRequirements =
    customerColumns.length > 0 && revenueColumns.length > 0;
  if (hasCustomerRequirements) {
    suggestions.push({
      id: 'customer-analysis',
      label: 'Customer Insights',
      description: 'Analyze customer behavior and value distribution',
      requiredColumns: ['customer column', 'revenue column'],
      analysisType: 'outlier',
      enabled: true,
    });
  }

  return suggestions;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId parameter is required' },
        { status: 400 }
      );
    }

    // For now, we'll use mock data since file storage isn't fully implemented
    // In a real implementation, we would retrieve file metadata from storage

    // For demo purposes, we'll use mock data
    // In a real implementation, we would retrieve file metadata from storage using the fileId

    // Mock different file scenarios based on fileId for testing
    let mockColumns: string[];
    let mockSampleData: string[][];

    if (fileId.includes('minimal')) {
      // Minimal file with just basic columns - should disable most analyses
      mockColumns = ['id', 'name', 'value'];
      mockSampleData = [
        mockColumns,
        ['1', 'Item A', '100'],
        ['2', 'Item B', '200'],
      ];
    } else if (fileId.includes('no-date')) {
      // File without date columns - should disable trend analysis
      mockColumns = ['order_id', 'customer_id', 'sku', 'qty', 'unit_price'];
      mockSampleData = [
        mockColumns,
        ['ORD001', 'CUST001', 'SKU001', '2', '99.99'],
        ['ORD002', 'CUST002', 'SKU002', '1', '49.99'],
      ];
    } else {
      // Full sales data structure - should enable all analyses
      mockColumns = [
        'order_id',
        'order_date',
        'customer_id',
        'channel',
        'region',
        'sku',
        'category',
        'qty',
        'unit_price',
        'discount',
        'tax',
        'shipping_cost',
      ];
      mockSampleData = [
        mockColumns,
        [
          'ORD001',
          '2024-01-15',
          'CUST001',
          'online',
          'US-West',
          'SKU001',
          'Electronics',
          '2',
          '99.99',
          '10.00',
          '8.00',
          '5.99',
        ],
        [
          'ORD002',
          '2024-01-16',
          'CUST002',
          'retail',
          'US-East',
          'SKU002',
          'Clothing',
          '1',
          '49.99',
          '0.00',
          '4.00',
          '3.99',
        ],
      ];
    }

    const suggestions = generateSuggestions(mockColumns, mockSampleData);

    return NextResponse.json({
      fileId,
      suggestions,
      metadata: {
        columnCount: mockColumns.length,
        availableColumns: mockColumns,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Suggestions generation failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate suggestions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
