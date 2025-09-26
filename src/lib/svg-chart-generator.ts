// Simplified chart generator that creates SVG charts without canvas dependency
// This is a temporary solution until we can resolve the canvas/webpack issue

import { storageManager } from './storage-manager';
import { AnalysisResponse } from './openai-responses';

/**
 * Generate a simple SVG chart from structured data
 */
export async function generateSimpleSVGChart(
  analysisData: AnalysisResponse
): Promise<{ path: string; width: number; height: number }> {
  const { chart_data } = analysisData;

  // Chart dimensions
  const width = 800;
  const height = 600;
  const margin = { top: 60, right: 60, bottom: 80, left: 100 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Find max value for scaling
  const maxValue = Math.max(...chart_data.data_points.map(d => d.value));
  const scale = chartHeight / maxValue;

  // Color palette
  const colors = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#f97316',
    '#06b6d4',
    '#84cc16',
  ];

  // Generate SVG based on chart type
  let chartElements = '';

  if (chart_data.chart_type === 'bar') {
    const barWidth = (chartWidth / chart_data.data_points.length) * 0.8;
    const barSpacing = (chartWidth / chart_data.data_points.length) * 0.2;

    chartElements = chart_data.data_points
      .map((point, index) => {
        const barHeight = point.value * scale;
        const x =
          margin.left + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = margin.top + chartHeight - barHeight;
        const color = colors[index % colors.length];

        return `
        <!-- Bar ${index} -->
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" 
              fill="${color}" stroke="#ffffff" stroke-width="2" rx="4"/>
        <!-- Value label -->
        <text x="${x + barWidth / 2}" y="${y - 10}" 
              text-anchor="middle" fill="#374151" font-size="12" font-weight="bold">
          ${point.value.toLocaleString()}
        </text>
        <!-- X-axis label -->
        <text x="${x + barWidth / 2}" y="${margin.top + chartHeight + 20}" 
              text-anchor="middle" fill="#6b7280" font-size="11" 
              transform="rotate(-45, ${x + barWidth / 2}, ${margin.top + chartHeight + 20})">
          ${point.label}
        </text>
      `;
      })
      .join('');
  } else if (chart_data.chart_type === 'line') {
    const pointSpacing = chartWidth / (chart_data.data_points.length - 1);

    // Generate line path
    const pathData = chart_data.data_points
      .map((point, index) => {
        const x = margin.left + index * pointSpacing;
        const y = margin.top + chartHeight - point.value * scale;
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');

    chartElements = `
      <!-- Line path -->
      <path d="${pathData}" fill="none" stroke="${colors[0]}" stroke-width="3" stroke-linecap="round"/>
      
      ${chart_data.data_points
        .map((point, index) => {
          const x = margin.left + index * pointSpacing;
          const y = margin.top + chartHeight - point.value * scale;

          return `
          <!-- Data point -->
          <circle cx="${x}" cy="${y}" r="6" fill="${colors[0]}" stroke="#ffffff" stroke-width="3"/>
          <!-- Value label -->
          <text x="${x}" y="${y - 15}" text-anchor="middle" fill="#374151" font-size="12" font-weight="bold">
            ${point.value.toLocaleString()}
          </text>
          <!-- X-axis label -->
          <text x="${x}" y="${margin.top + chartHeight + 20}" 
                text-anchor="middle" fill="#6b7280" font-size="11"
                transform="rotate(-45, ${x}, ${margin.top + chartHeight + 20})">
            ${point.label}
          </text>
        `;
        })
        .join('')}
    `;
  } else if (chart_data.chart_type === 'pie') {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = (Math.min(chartWidth, chartHeight) / 2) * 0.8;

    const total = chart_data.data_points.reduce(
      (sum, point) => sum + point.value,
      0
    );
    let currentAngle = -Math.PI / 2; // Start at top

    chartElements = chart_data.data_points
      .map((point, index) => {
        const percentage = point.value / total;
        const angle = percentage * 2 * Math.PI;
        const endAngle = currentAngle + angle;

        // Calculate arc path
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);

        const largeArcFlag = angle > Math.PI ? 1 : 0;
        const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

        // Calculate label position
        const labelAngle = currentAngle + angle / 2;
        const labelRadius = radius * 0.7;
        const labelX = centerX + labelRadius * Math.cos(labelAngle);
        const labelY = centerY + labelRadius * Math.sin(labelAngle);

        const color = colors[index % colors.length];

        const result = `
        <!-- Pie slice -->
        <path d="${pathData}" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <!-- Label -->
        <text x="${labelX}" y="${labelY}" text-anchor="middle" fill="white" 
              font-size="12" font-weight="bold">
          ${(percentage * 100).toFixed(1)}%
        </text>
      `;

        currentAngle = endAngle;
        return result;
      })
      .join('');

    // Add legend for pie chart
    const legendItems = chart_data.data_points
      .map((point, index) => {
        const y = 50 + index * 25;
        const color = colors[index % colors.length];

        return `
        <rect x="20" y="${y}" width="15" height="15" fill="${color}"/>
        <text x="40" y="${y + 12}" fill="#374151" font-size="12">
          ${point.label}: ${point.value.toLocaleString()}
        </text>
      `;
      })
      .join('');

    chartElements = chartElements + legendItems;
  }

  // Y-axis ticks for bar and line charts
  let yAxisTicks = '';
  if (chart_data.chart_type === 'bar' || chart_data.chart_type === 'line') {
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const value = (maxValue / tickCount) * i;
      const y = margin.top + chartHeight - value * scale;

      yAxisTicks += `
        <!-- Y-axis tick -->
        <line x1="${margin.left - 10}" y1="${y}" x2="${margin.left}" y2="${y}" 
              stroke="#d1d5db" stroke-width="1"/>
        <!-- Y-axis label -->
        <text x="${margin.left - 15}" y="${y + 4}" text-anchor="end" fill="#6b7280" font-size="11">
          ${Math.round(value).toLocaleString()}
        </text>
        <!-- Grid line -->
        <line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" 
              stroke="#f3f4f6" stroke-width="1"/>
      `;
    }
  }

  // Generate complete SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="100%" height="100%" fill="white"/>
  
  <!-- Chart Title -->
  <text x="${width / 2}" y="30" text-anchor="middle" fill="#1f2937" font-size="18" font-weight="bold">
    ${chart_data.title}
  </text>
  
  ${
    chart_data.chart_type === 'pie'
      ? ''
      : `
  <!-- Y-axis -->
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" 
        stroke="#374151" stroke-width="2"/>
  
  <!-- X-axis -->  
  <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" 
        stroke="#374151" stroke-width="2"/>
        
  <!-- Y-axis label -->
  <text x="25" y="${margin.top + chartHeight / 2}" text-anchor="middle" fill="#374151" font-size="12" font-weight="bold"
        transform="rotate(-90, 25, ${margin.top + chartHeight / 2})">
    ${chart_data.y_label}
  </text>
  
  <!-- X-axis label -->
  <text x="${margin.left + chartWidth / 2}" y="${height - 15}" text-anchor="middle" fill="#374151" font-size="12" font-weight="bold">
    ${chart_data.x_label}
  </text>
  
  ${yAxisTicks}
  `
  }
  
  ${chartElements}
</svg>`;

  // Save the SVG file
  const filename = `chart_${Date.now()}.svg`;
  const buffer = Buffer.from(svg, 'utf8');

  // Create a temporary session ID for artifact storage
  const tempSessionId = `temp_${Date.now()}`;

  try {
    const fileMetadata = await storageManager.storeArtifact(
      tempSessionId,
      'chart',
      buffer,
      'svg'
    );

    console.log(`Generated SVG chart: ${fileMetadata.id} (${width}x${height})`);

    return {
      path: `/api/artifacts/${fileMetadata.id}/download`,
      width,
      height,
    };
  } catch (error) {
    console.error('Failed to store SVG chart:', error);
    // Return a placeholder path
    return { path: '/tmp/chart_error.svg', width, height };
  }
}

/**
 * Main chart generation function that falls back to SVG when canvas fails
 */
export async function generateDynamicChart(
  analysisData: AnalysisResponse
): Promise<{ path: string; width: number; height: number }> {
  try {
    console.log('Generating chart with SVG fallback...');
    return await generateSimpleSVGChart(analysisData);
  } catch (error) {
    console.error('Chart generation failed:', error);
    throw error;
  }
}
