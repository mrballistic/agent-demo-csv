# AI Data Analyst Demo Guide

## Overview

The AI Data Analyst Demo is a web application that showcases automated data analysis capabilities using OpenAI's Assistants API with Code Interpreter. This demo allows users to upload CSV files and receive intelligent insights, visualizations, and analysis suggestions.

## Quick Start

### 1. Sample Data Files

The demo includes three sample CSV files to demonstrate different scenarios:

#### Valid Sales Data (`valid-sales-data.csv`)

- **Purpose**: Clean, well-structured sales data
- **Rows**: 20 records
- **Columns**: order_id, order_date, customer_id, channel, region, sku, category, qty, unit_price, discount, tax, shipping_cost
- **Use Case**: Perfect for demonstrating standard analysis features like trends, top products, and channel performance

#### PII Sales Data (`pii-sales-data.csv`)

- **Purpose**: Demonstrates PII detection and privacy protection
- **Rows**: 15 records
- **Columns**: Includes customer_email and customer_phone columns
- **Use Case**: Shows how the system automatically detects and protects personally identifiable information

#### Outliers Sales Data (`outliers-sales-data.csv`)

- **Purpose**: Contains unusual patterns and data quality issues
- **Rows**: 20 records
- **Features**: Negative quantities (returns), extreme pricing, zero quantities
- **Use Case**: Demonstrates error handling and outlier detection capabilities

### 2. Demo Flow

1. **Upload Data**
   - Download one of the sample files or use your own CSV
   - Drag and drop or click to upload
   - System validates file format and size (max 50MB)

2. **Data Profiling**
   - Click "Profile" or the system will automatically profile the data
   - View data structure, column types, missing values, and sample rows
   - PII columns are automatically flagged

3. **Analysis**
   - Use Quick Actions for common analyses:
     - **Trends**: Revenue trends over time
     - **Top Products**: Best performing SKUs
     - **Channel Mix**: Performance by sales channel
     - **Customer Analysis**: Customer behavior patterns
   - Or ask custom questions in the chat

4. **Export Results**
   - Download individual charts (PNG) and data files (CSV)
   - Use "Export All" for a complete ZIP archive
   - All files include timestamps and version numbers

5. **Data Management**
   - Data is automatically deleted after 24 hours
   - Use "Delete All My Data" for immediate removal
   - All actions are logged for audit purposes

## Features Demonstrated

### Core Functionality

- ✅ CSV file upload and validation
- ✅ Automatic data profiling
- ✅ AI-powered analysis suggestions
- ✅ Real-time streaming responses
- ✅ Interactive chat interface
- ✅ Artifact generation and download
- ✅ Bulk export functionality

### Data Privacy & Security

- ✅ PII detection and protection
- ✅ Automatic data retention (24h)
- ✅ Manual data deletion
- ✅ Audit logging
- ✅ Secure file handling

### User Experience

- ✅ Loading shimmers and progress indicators
- ✅ Error recovery and user guidance
- ✅ Accessibility compliance (WCAG 2.1)
- ✅ Responsive design
- ✅ Keyboard navigation
- ✅ Screen reader support

### Technical Features

- ✅ Server-sent events for real-time updates
- ✅ Run cancellation and queue management
- ✅ Idempotency for API calls
- ✅ Rate limiting and error handling
- ✅ Comprehensive test coverage

## Error Scenarios to Test

### File Upload Errors

- Upload non-CSV files (Excel, TXT, etc.)
- Upload files over 50MB
- Upload empty files
- Upload malformed CSV files

### Data Quality Issues

- Missing required columns
- Invalid date formats
- Extreme outliers
- PII data handling

### System Errors

- Network connectivity issues
- API rate limiting
- Analysis timeouts
- Concurrent user limits

## Accessibility Features

The demo is fully accessible and includes:

- **Keyboard Navigation**: All functionality accessible via keyboard
- **Screen Reader Support**: Proper ARIA labels and announcements
- **High Contrast**: Supports system dark/light mode preferences
- **Focus Management**: Clear focus indicators and logical tab order
- **Alt Text**: All charts include descriptive alt text
- **Error Announcements**: Screen reader announcements for errors and status changes

## Performance Characteristics

- **File Upload**: < 5 seconds for 50MB files
- **Data Profiling**: < 10 seconds for 100k rows
- **Simple Analysis**: < 15 seconds for 100k rows
- **Complex Analysis**: < 30 seconds for 100k rows
- **Export Generation**: < 5 seconds for typical artifacts
- **Concurrent Users**: Supports 10 simultaneous sessions

## Technical Architecture

### Frontend (Next.js 14)

- React with TypeScript
- Material-UI (MUI) components
- Server-sent events for real-time updates
- Responsive design with accessibility

### Backend (Node.js)

- Next.js API routes
- OpenAI Assistants API integration
- In-memory session management
- File storage with automatic cleanup

### AI Integration

- OpenAI GPT-4 with Code Interpreter
- Custom system prompts for data analysis
- Manifest-based artifact extraction
- Streaming response handling

## Environment Setup

### Required Environment Variables

```bash
OPENAI_API_KEY=your_openai_api_key
APP_URL=http://localhost:3000
NODE_OPTIONS=--max-old-space-size=4096
LOG_LEVEL=info
```

### Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run accessibility tests
npm run test:a11y

# Build for production
npm run build
```

## Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file format (must be CSV)
   - Verify file size (max 50MB)
   - Ensure required columns are present

2. **Analysis Timeout**
   - Try with smaller dataset
   - Simplify the analysis query
   - Check network connectivity

3. **PII Detection Issues**
   - System automatically detects email/phone patterns
   - PII data is aggregated, not displayed raw
   - Use sample PII file to test detection

4. **Export Problems**
   - Ensure analysis completed successfully
   - Check browser download settings
   - Try individual file downloads first

### Support

For technical issues or questions:

1. Check the browser console for error messages
2. Review the help text in the application
3. Try the sample data files first
4. Use the "Delete All My Data" feature to reset

## Demo Script

### 5-Minute Demo

1. **Introduction** (30s): Explain the AI Data Analyst concept
2. **Upload Sample Data** (1m): Show file upload with valid-sales-data.csv
3. **Data Profiling** (1m): Demonstrate automatic profiling and insights
4. **Quick Analysis** (2m): Use Quick Actions for trends and top products
5. **Export Results** (30s): Download charts and data files

### 10-Minute Demo

- Include PII detection demo with pii-sales-data.csv
- Show custom chat queries and follow-up questions
- Demonstrate error handling with outliers-sales-data.csv
- Show data deletion and privacy features
- Highlight accessibility features

### Full Feature Demo (20 minutes)

- Cover all three sample datasets
- Demonstrate all Quick Actions
- Show advanced chat interactions
- Test error scenarios and recovery
- Demonstrate accessibility with keyboard navigation
- Show observability dashboard and metrics

## Success Metrics

The demo successfully showcases:

- ✅ End-to-end data analysis workflow
- ✅ AI-powered insights generation
- ✅ User-friendly interface with guidance
- ✅ Data privacy and security measures
- ✅ Accessibility compliance
- ✅ Error handling and recovery
- ✅ Professional polish and UX

This demo represents a production-ready foundation for an AI-powered data analysis platform.
