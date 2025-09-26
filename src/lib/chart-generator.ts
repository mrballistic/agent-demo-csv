import fs from 'fs/promises';
import path from 'path';

/**
 * Generate a placeholder chart image based on analysis metadata
 * This creates a simple SVG chart that can be converted to PNG
 */
export async function generatePlaceholderChart(
  analysisData: any,
  sessionId: string
): Promise<Buffer | null> {
  try {
    const { metadata, insight } = analysisData;

    // Create a simple SVG chart
    const width = 800;
    const height = 600;
    const padding = 80;

    // Determine chart type based on analysis type
    let chartTitle = 'Data Analysis Chart';
    let chartType = 'bar';

    if (metadata?.analysis_type) {
      switch (metadata.analysis_type) {
        case 'trend':
          chartTitle = 'Trend Analysis';
          chartType = 'line';
          break;
        case 'top-sku':
          chartTitle = 'Top SKU Performance';
          chartType = 'bar';
          break;
        case 'channel-mix':
          chartTitle = 'Channel Performance';
          chartType = 'pie';
          break;
        case 'profile':
          chartTitle = 'Data Profile Overview';
          chartType = 'histogram';
          break;
        default:
          chartTitle = 'Analysis Results';
          chartType = 'bar';
      }
    }

    // Create sample data points for visualization
    const sampleData = generateSampleData(chartType, metadata);

    let svgContent = '';

    if (chartType === 'bar') {
      svgContent = generateBarChart(
        width,
        height,
        padding,
        chartTitle,
        sampleData
      );
    } else if (chartType === 'line') {
      svgContent = generateLineChart(
        width,
        height,
        padding,
        chartTitle,
        sampleData
      );
    } else if (chartType === 'pie') {
      svgContent = generatePieChart(
        width,
        height,
        padding,
        chartTitle,
        sampleData
      );
    } else {
      svgContent = generateBarChart(
        width,
        height,
        padding,
        chartTitle,
        sampleData
      ); // Default
    }

    // Convert SVG to Buffer
    const svgBuffer = Buffer.from(svgContent, 'utf8');

    return svgBuffer;
  } catch (error) {
    console.error('Failed to generate placeholder chart:', error);
    return null;
  }
}

function generateSampleData(chartType: string, metadata: any) {
  // Generate appropriate sample data based on chart type and available columns
  const columns = metadata?.columns_used || ['Category', 'Value'];

  if (chartType === 'trend' || chartType === 'line') {
    return [
      { x: 'Jan', y: 45 },
      { x: 'Feb', y: 52 },
      { x: 'Mar', y: 48 },
      { x: 'Apr', y: 61 },
      { x: 'May', y: 55 },
      { x: 'Jun', y: 67 },
    ];
  } else if (chartType === 'pie') {
    return [
      { label: 'Online', value: 45, color: '#3B82F6' },
      { label: 'Retail', value: 30, color: '#10B981' },
      { label: 'Wholesale', value: 25, color: '#F59E0B' },
    ];
  } else {
    return [
      { x: 'Product A', y: 85 },
      { x: 'Product B', y: 67 },
      { x: 'Product C', y: 43 },
      { x: 'Product D', y: 29 },
      { x: 'Product E', y: 18 },
    ];
  }
}

function generateBarChart(
  width: number,
  height: number,
  padding: number,
  title: string,
  data: any[]
) {
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding - 40; // Leave space for title
  const barWidth = (chartWidth / data.length) * 0.8;
  const maxValue = Math.max(...data.map(d => d.y));

  let bars = '';
  let labels = '';

  data.forEach((item, index) => {
    const barHeight = (item.y / maxValue) * chartHeight;
    const x =
      padding +
      index * (chartWidth / data.length) +
      (chartWidth / data.length - barWidth) / 2;
    const y = height - padding - barHeight;

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#3B82F6" stroke="#1E40AF" stroke-width="1"/>`;
    labels += `<text x="${x + barWidth / 2}" y="${height - padding + 20}" text-anchor="middle" class="chart-label">${item.x}</text>`;

    // Value labels on top of bars
    bars += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="value-label">${item.y}</text>`;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .chart-title { font: bold 18px sans-serif; fill: #1F2937; text-anchor: middle; }
        .chart-label { font: 12px sans-serif; fill: #6B7280; }
        .value-label { font: 11px sans-serif; fill: #1F2937; }
        .axis-line { stroke: #9CA3AF; stroke-width: 2; }
      </style>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="white" stroke="#E5E7EB" stroke-width="1"/>
      
      <!-- Title -->
      <text x="${width / 2}" y="30" class="chart-title">${title}</text>
      
      <!-- Axes -->
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis-line"/>
      <line x1="${padding}" y1="${padding + 40}" x2="${padding}" y2="${height - padding}" class="axis-line"/>
      
      <!-- Bars and Labels -->
      ${bars}
      ${labels}
      
      <!-- Y-axis labels -->
      <text x="${padding - 10}" y="${padding + 50}" text-anchor="end" class="chart-label">0</text>
      <text x="${padding - 10}" y="${padding + 90}" text-anchor="end" class="chart-label">${Math.round(maxValue / 2)}</text>
      <text x="${padding - 10}" y="${padding + 130}" text-anchor="end" class="chart-label">${maxValue}</text>
      
      <!-- Watermark -->
      <text x="${width - 10}" y="${height - 10}" text-anchor="end" class="chart-label" opacity="0.5">Generated by Analyst-in-a-Box</text>
    </svg>
  `;
}

function generateLineChart(
  width: number,
  height: number,
  padding: number,
  title: string,
  data: any[]
) {
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding - 40;
  const maxValue = Math.max(...data.map(d => d.y));

  let points = '';
  let labels = '';
  let circles = '';

  const pointSpacing = chartWidth / (data.length - 1);

  data.forEach((item, index) => {
    const x = padding + index * pointSpacing;
    const y = height - padding - (item.y / maxValue) * chartHeight;

    if (index === 0) {
      points = `M ${x} ${y}`;
    } else {
      points += ` L ${x} ${y}`;
    }

    circles += `<circle cx="${x}" cy="${y}" r="4" fill="#3B82F6" stroke="white" stroke-width="2"/>`;
    labels += `<text x="${x}" y="${height - padding + 20}" text-anchor="middle" class="chart-label">${item.x}</text>`;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .chart-title { font: bold 18px sans-serif; fill: #1F2937; text-anchor: middle; }
        .chart-label { font: 12px sans-serif; fill: #6B7280; }
        .trend-line { stroke: #3B82F6; stroke-width: 3; fill: none; }
        .axis-line { stroke: #9CA3AF; stroke-width: 2; }
      </style>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="white" stroke="#E5E7EB" stroke-width="1"/>
      
      <!-- Title -->
      <text x="${width / 2}" y="30" class="chart-title">${title}</text>
      
      <!-- Axes -->
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis-line"/>
      <line x1="${padding}" y1="${padding + 40}" x2="${padding}" y2="${height - padding}" class="axis-line"/>
      
      <!-- Trend line -->
      <path d="${points}" class="trend-line"/>
      
      <!-- Data points -->
      ${circles}
      
      <!-- Labels -->
      ${labels}
      
      <!-- Watermark -->
      <text x="${width - 10}" y="${height - 10}" text-anchor="end" class="chart-label" opacity="0.5">Generated by Analyst-in-a-Box</text>
    </svg>
  `;
}

function generatePieChart(
  width: number,
  height: number,
  padding: number,
  title: string,
  data: any[]
) {
  const centerX = width / 2;
  const centerY = (height + 40) / 2;
  const radius = Math.min(width, height - 80) / 3;

  let slices = '';
  let labels = '';
  let legends = '';

  let currentAngle = -Math.PI / 2; // Start at top
  const total = data.reduce((sum, item) => sum + item.value, 0);

  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const endAngle = currentAngle + sliceAngle;

    const x1 = centerX + Math.cos(currentAngle) * radius;
    const y1 = centerY + Math.sin(currentAngle) * radius;
    const x2 = centerX + Math.cos(endAngle) * radius;
    const y2 = centerY + Math.sin(endAngle) * radius;

    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z',
    ].join(' ');

    slices += `<path d="${pathData}" fill="${item.color}" stroke="white" stroke-width="2"/>`;

    // Label in middle of slice
    const labelAngle = currentAngle + sliceAngle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
    labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" class="slice-label">${Math.round((item.value / total) * 100)}%</text>`;

    // Legend
    const legendY = padding + 60 + index * 25;
    legends += `<rect x="${width - 150}" y="${legendY - 8}" width="12" height="12" fill="${item.color}"/>`;
    legends += `<text x="${width - 130}" y="${legendY}" class="legend-label">${item.label} (${item.value}%)</text>`;

    currentAngle = endAngle;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .chart-title { font: bold 18px sans-serif; fill: #1F2937; text-anchor: middle; }
        .slice-label { font: bold 11px sans-serif; fill: white; text-anchor: middle; }
        .legend-label { font: 12px sans-serif; fill: #1F2937; }
      </style>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="white" stroke="#E5E7EB" stroke-width="1"/>
      
      <!-- Title -->
      <text x="${width / 2}" y="30" class="chart-title">${title}</text>
      
      <!-- Pie slices -->
      ${slices}
      
      <!-- Labels -->
      ${labels}
      
      <!-- Legend -->
      ${legends}
      
      <!-- Watermark -->
      <text x="${width - 10}" y="${height - 10}" text-anchor="end" class="legend-label" opacity="0.5">Generated by Analyst-in-a-Box</text>
    </svg>
  `;
}
