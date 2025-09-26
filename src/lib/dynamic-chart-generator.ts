import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import {
  Chart,
  ChartConfiguration,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { AnalysisResponse } from './openai-responses';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Configure Chart.js canvas for server-side rendering
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 600,
  backgroundColour: 'white',
});

/**
 * Generate a dynamic chart based on AI analysis data using Chart.js
 */
export async function generateDynamicChart(
  analysisData: AnalysisResponse,
  sessionId: string
): Promise<Buffer | null> {
  try {
    const { chart_data } = analysisData;

    if (
      !chart_data ||
      !chart_data.data_points ||
      chart_data.data_points.length === 0
    ) {
      console.warn('No chart data provided for chart generation');
      return null;
    }

    console.log('Generating dynamic chart:', {
      type: chart_data.chart_type,
      title: chart_data.title,
      dataPoints: chart_data.data_points.length,
    });

    let chartConfig: ChartConfiguration;

    switch (chart_data.chart_type) {
      case 'bar':
        chartConfig = createBarChartConfig(chart_data);
        break;
      case 'line':
        chartConfig = createLineChartConfig(chart_data);
        break;
      case 'pie':
        chartConfig = createPieChartConfig(chart_data);
        break;
      case 'scatter':
        chartConfig = createScatterChartConfig(chart_data);
        break;
      case 'histogram':
        chartConfig = createHistogramConfig(chart_data);
        break;
      default:
        console.warn(
          `Unsupported chart type: ${chart_data.chart_type}, falling back to bar chart`
        );
        chartConfig = createBarChartConfig(chart_data);
    }

    // Generate chart as PNG buffer
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfig);

    console.log('Successfully generated dynamic chart:', {
      bufferSize: imageBuffer.length,
      type: chart_data.chart_type,
    });

    return imageBuffer;
  } catch (error) {
    console.error('Failed to generate dynamic chart:', error);
    return null;
  }
}

/**
 * Create bar chart configuration
 */
function createBarChartConfig(
  chartData: AnalysisResponse['chart_data']
): ChartConfiguration {
  const colors = generateColors(chartData.data_points.length);

  return {
    type: 'bar',
    data: {
      labels: chartData.data_points.map(point => point.label),
      datasets: [
        {
          label: chartData.y_label || 'Value',
          data: chartData.data_points.map(point => point.value),
          backgroundColor: chartData.data_points.map(
            (point, index) => point.color || colors[index % colors.length]
          ),
          borderColor: chartData.data_points.map((point, index) => {
            const baseColor =
              point.color || colors[index % colors.length] || '#3B82F6';
            return darkenColor(baseColor);
          }),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartData.title,
          font: {
            size: 18,
            weight: 'bold',
          },
        },
        legend: {
          display: false, // Hide legend for bar charts
        },
      },
      scales: {
        x: {
          title: {
            display: !!chartData.x_label,
            text: chartData.x_label || '',
          },
        },
        y: {
          title: {
            display: !!chartData.y_label,
            text: chartData.y_label || '',
          },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Create line chart configuration
 */
function createLineChartConfig(
  chartData: AnalysisResponse['chart_data']
): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: chartData.data_points.map(point => point.label),
      datasets: [
        {
          label: chartData.y_label || 'Value',
          data: chartData.data_points.map(point => point.value),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.1,
          pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartData.title,
          font: {
            size: 18,
            weight: 'bold',
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          title: {
            display: !!chartData.x_label,
            text: chartData.x_label || '',
          },
        },
        y: {
          title: {
            display: !!chartData.y_label,
            text: chartData.y_label || '',
          },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Create pie chart configuration
 */
function createPieChartConfig(
  chartData: AnalysisResponse['chart_data']
): ChartConfiguration {
  const colors = generateColors(chartData.data_points.length);

  return {
    type: 'pie',
    data: {
      labels: chartData.data_points.map(point => point.label),
      datasets: [
        {
          data: chartData.data_points.map(point => point.value),
          backgroundColor: chartData.data_points.map(
            (point, index) => point.color || colors[index % colors.length]
          ),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartData.title,
          font: {
            size: 18,
            weight: 'bold',
          },
        },
        legend: {
          display: true,
          position: 'right',
        },
      },
    },
  };
}

/**
 * Create scatter chart configuration
 */
function createScatterChartConfig(
  chartData: AnalysisResponse['chart_data']
): ChartConfiguration {
  return {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: chartData.title,
          data: chartData.data_points.map((point, index) => ({
            x: index + 1, // Use index as x-value, could be enhanced with actual x-data
            y: point.value,
          })),
          backgroundColor: '#10B981',
          borderColor: '#059669',
          borderWidth: 2,
          pointRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartData.title,
          font: {
            size: 18,
            weight: 'bold',
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          title: {
            display: !!chartData.x_label,
            text: chartData.x_label || '',
          },
        },
        y: {
          title: {
            display: !!chartData.y_label,
            text: chartData.y_label || '',
          },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Create histogram configuration (using bar chart)
 */
function createHistogramConfig(
  chartData: AnalysisResponse['chart_data']
): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: chartData.data_points.map(point => point.label),
      datasets: [
        {
          label: 'Frequency',
          data: chartData.data_points.map(point => point.value),
          backgroundColor: '#8B5CF6',
          borderColor: '#7C3AED',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartData.title,
          font: {
            size: 18,
            weight: 'bold',
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          title: {
            display: !!chartData.x_label,
            text: chartData.x_label || '',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Frequency',
          },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Generate a color palette for charts
 */
function generateColors(count: number): string[] {
  const baseColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#F97316', // Orange
    '#EC4899', // Pink
    '#6B7280', // Gray
  ];

  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }

  // Generate additional colors if needed
  const colors = [...baseColors];
  while (colors.length < count) {
    const hue = ((colors.length * 360) / count) % 360;
    colors.push(`hsl(${hue}, 70%, 50%)`);
  }

  return colors;
}

/**
 * Darken a color for borders
 */
function darkenColor(color: string): string {
  if (color.startsWith('#')) {
    // Convert hex to RGB, then darken
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const darkenedR = Math.max(0, r - 50);
    const darkenedG = Math.max(0, g - 50);
    const darkenedB = Math.max(0, b - 50);

    return `rgb(${darkenedR}, ${darkenedG}, ${darkenedB})`;
  }

  return color; // Return original if not hex
}
