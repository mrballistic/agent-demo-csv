# Requirements Document

## Introduction

The AI Data Analyst Demo is a web application that leverages OpenAI's Assistants API with Code Interpreter to provide automated data analysis capabilities. Users can upload CSV files containing sales or funnel data, receive intelligent data profiling and analysis suggestions, and generate downloadable insights including charts, cleaned data, and summaries. The system focuses on providing a streamlined experience for business users to quickly extract actionable insights from their data without requiring technical expertise.

## Requirements

### Requirement 1

**User Story:** As a business user, I want to upload a CSV file with sales data, so that I can quickly understand the structure and quality of my data.

#### Acceptance Criteria

1. WHEN a user uploads a CSV file THEN the system SHALL validate the file format is CSV and file size is under 50MB
2. WHEN a non-CSV file is uploaded (Excel, TSV, malformed CSV) THEN the system SHALL display an error message requesting CSV format
3. WHEN multiple files are uploaded simultaneously THEN the system SHALL process only the most recent file and notify the user that previous uploads were replaced
4. WHEN a valid CSV is uploaded THEN the system SHALL automatically profile the data including row count, column names, data types, missing value percentages, and sample rows
5. WHEN data profiling is complete THEN the system SHALL display a structured summary of the data characteristics
6. IF the uploaded file exceeds 1M rows THEN the system SHALL propose downsampling or date range filtering options
7. IF the uploaded file contains 100k-1M rows THEN the system SHALL warn the user that processing may take longer than 15 seconds
8. IF the file contains PII data (emails, phones) THEN the system SHALL refuse to display raw values and only show aggregated data

### Requirement 2

**User Story:** As a business user, I want to receive intelligent analysis suggestions based on my data, so that I can explore meaningful insights without knowing what questions to ask.

#### Acceptance Criteria

1. WHEN data profiling is complete THEN the system SHALL generate 3-5 analytical questions relevant to the data schema
2. WHEN the data contains sales/order information THEN the system SHALL suggest questions about revenue metrics, top products, trends, and channel performance
3. WHEN analysis suggestions are generated THEN the system SHALL present them as clickable options for easy selection
4. IF the data schema is missing required columns THEN the system SHALL ask the user to map columns using a dropdown interface
5. WHEN a user request is ambiguous THEN the system SHALL return a menu of specific analysis options

### Requirement 3

**User Story:** As a business user, I want to select an analysis question and receive automated insights, so that I can understand my data patterns without manual analysis.

#### Acceptance Criteria

1. WHEN a user selects an analysis question THEN the system SHALL execute the analysis using the Assistants API with Code Interpreter
2. WHEN analysis is complete THEN the system SHALL return a short plain-English insight summary (2-3 lines)
3. WHEN analysis generates visual data THEN the system SHALL create a readable chart with proper axis labels, titles, units, and date formatting saved as PNG format
4. WHEN charts are generated THEN the system SHALL include alt-text descriptions for accessibility
5. WHEN analysis involves data transformation THEN the system SHALL optionally provide a cleaned CSV file
6. WHEN analysis fails due to data issues THEN the system SHALL specify exactly what's missing and propose a fix with inline error messages in the chat
7. WHEN analysis is requested THEN the system SHALL target completion within 15 seconds for datasets up to 100k rows as a performance goal
8. WHEN analysis involves cross-segmentation (e.g., revenue by channel and region) THEN the system SHALL be out of scope for MVP and suggest simpler single-dimension analysis

### Requirement 4

**User Story:** As a business user, I want to export my analysis results including charts and cleaned data, so that I can share insights with my team or use them in other tools.

#### Acceptance Criteria

1. WHEN a user requests export THEN the system SHALL provide downloadable files including PNG charts, cleaned CSV data, and summary reports
2. WHEN multiple analyses have been performed THEN the system SHALL allow bulk export of all generated artifacts
3. WHEN export is requested THEN the system SHALL generate files with naming convention: analysisType_timestamp.extension (e.g., revenue_trends_20241201_143022.png)
4. WHEN files are generated THEN the system SHALL store them with message IDs for tracking and retrieval
5. WHEN the same analysis is re-run THEN the system SHALL create new versioned files rather than overwriting previous artifacts
6. IF export includes multiple files THEN the system SHALL create a ZIP archive with flat file structure for single download
7. WHEN ZIP archives are created THEN the system SHALL include a manifest.txt file listing all contents with timestamps

### Requirement 5

**User Story:** As a business user, I want to interact with the analysis through a chat interface, so that I can ask follow-up questions and refine my analysis naturally.

#### Acceptance Criteria

1. WHEN using the application THEN the system SHALL provide a chat interface for natural language interaction with keyboard navigation support
2. WHEN analysis results are generated THEN the system SHALL display them as insight cards with titles and key bullet points
3. WHEN artifacts are created THEN the system SHALL show them in a dedicated artifacts pane with download buttons
4. WHEN common analyses are needed THEN the system SHALL provide quick action buttons for Profile, Trends, Top SKUs, Channel Mix, Cohorts, and Export Report
5. WHEN users reference previous analyses THEN the system SHALL maintain context within the current session by artifact ID or explicit reference
6. WHEN a browser session is reloaded THEN the system SHALL preserve the current thread context and analysis history
7. WHEN a session exceeds 2 hours of inactivity THEN the system SHALL expire the thread and require a new upload for continued analysis

### Requirement 6

**User Story:** As a developer, I want the system to handle various data scenarios and edge cases gracefully, so that users have a reliable experience regardless of their data quality.

#### Acceptance Criteria

1. WHEN processing sales data THEN the system SHALL handle negative quantities as returns or refunds appropriately
2. WHEN calculating revenue metrics THEN the system SHALL derive net_revenue as qty\*unit_price - discount + tax - shipping_cost
3. WHEN generating time series THEN the system SHALL create proper date parsing and weekly aggregations
4. WHEN detecting outliers THEN the system SHALL identify and flag unusual patterns in discounting or pricing
5. IF required columns are missing THEN the system SHALL provide column mapping assistance before proceeding with analysis

### Requirement 7

**User Story:** As a system administrator, I want the application to integrate properly with OpenAI's Assistants API, so that the AI-powered analysis functions reliably.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL create or reuse an OpenAI Assistant configured with Code Interpreter tools
2. WHEN a user session begins THEN the system SHALL create a new thread for maintaining conversation context
3. WHEN files are uploaded THEN the system SHALL use the OpenAI Files API to make them available to the Assistant
4. WHEN analysis runs THEN the system SHALL poll or stream the run status until completion
5. WHEN artifacts are generated THEN the system SHALL retrieve and store them from the Assistant's output

##

# Requirement 8

**User Story:** As a system administrator, I want the application to meet non-functional requirements for security, performance, and reliability, so that users have a trustworthy and consistent experience.

#### Acceptance Criteria

1. WHEN files are uploaded THEN the system SHALL encrypt them at rest and implement a 24-hour retention policy for uploaded data
2. WHEN user actions occur THEN the system SHALL log upload events, analysis requests, and export actions with timestamps and user identifiers for audit purposes
3. WHEN multiple users access the system concurrently THEN the system SHALL handle up to 10 simultaneous sessions without performance degradation
4. WHEN errors occur THEN the system SHALL categorize them as user errors (invalid data), system errors (API failures), or timeout errors and display appropriate messages
5. WHEN the system processes data THEN it SHALL comply with basic accessibility standards including screen reader compatibility and keyboard navigation
6. WHEN API calls to OpenAI fail THEN the system SHALL retry up to 3 times with exponential backoff before displaying an error message
7. WHEN system resources are constrained THEN the system SHALL queue analysis requests rather than failing immediately
8. WHEN sensitive data patterns are detected THEN the system SHALL automatically redact or aggregate the data before processing or display
