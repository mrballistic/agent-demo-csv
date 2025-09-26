# 🤖 AI Data Analyst Demo

> 📊 Production-ready automated data analysis powered by OpenAI's Assistants API and Code Interpreter

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![MUI](https://img.shields.io/badge/MUI-v5-007fff?logo=mui&logoColor=white)](https://mui.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-API_v4-412991?logo=openai&logoColor=white)](https://openai.com/)

## ✨ Features

### Core Analysis Engine

- 📁 **Intelligent CSV Upload** - Drag & drop with format validation, PII detection, and 50MB limit
- 🔍 **AI-Powered Data Profiling** - Automated column analysis, missing values, and data quality assessment
- 💡 **Smart Suggestions** - Context-aware analysis recommendations based on data patterns
- 📈 **Dynamic Visualizations** - Auto-generated SVG charts with professional typography, system UI fonts, and accessibility support
- 💬 **Natural Language Interface** - Chat with your data using plain English queries with intelligent follow-up question handling
- 🎨 **Enhanced Typography** - Professional chart styling with system font stack and hierarchical font weights
- 📦 **Comprehensive Export** - Individual downloads, bulk ZIP export, and versioned artifacts

### Enterprise-Grade Features

- 🔒 **Privacy & Security** - PII detection, CSP headers, rate limiting, and 24-hour data retention
- ⚡ **Real-time Processing** - Server-Sent Events with live progress tracking and cancellation
- 🎯 **Queue Management** - Request queuing with position indicators and depth limits
- 📊 **Observability Dashboard** - System metrics, performance tracking, and health monitoring
- ♿ **Accessibility Compliant** - Full ARIA support, keyboard navigation, and screen reader compatibility
- 🧪 **Comprehensive Testing** - 30+ test files covering unit, integration, E2E, and accessibility

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- OpenAI API key

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ai-data-analyst-demo
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your OpenAI API key:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   APP_URL=http://localhost:3000
   LOG_LEVEL=info
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🛠️ Development

### Available Scripts

- `npm run dev` - 🔥 Start development server with hot reload
- `npm run build` - 🏗️ Build optimized production bundle
- `npm run start` - 🚀 Start production server
- `npm run lint` - 🔍 Run ESLint with auto-fix
- `npm run format` - ✨ Format code with Prettier
- `npm run type-check` - 🔎 Check TypeScript types (strict mode)
- `npm run test` - 🧪 Run comprehensive test suite
- `npm run test:watch` - 👀 Run tests in watch mode
- `npm run test:coverage` - 📊 Generate test coverage report
- `npm run security:verify` - 🔒 Run security validation checks

### Code Quality & Testing

This project maintains enterprise-grade code quality with:

- 🔧 **TypeScript 5.3+** with strict mode and exactOptionalPropertyTypes
- 📏 **ESLint** with comprehensive rules and auto-fixing
- 💅 **Prettier** for consistent code formatting
- 🐕 **Husky** for pre-commit hooks and quality gates
- 📋 **lint-staged** for efficient staged file processing
- 🧪 **Vitest** for lightning-fast unit and integration testing
- 🎭 **Testing Library** for user-centric component testing
- ♿ **jest-axe** for automated accessibility compliance testing
- 📊 **30+ test files** covering all critical user journeys

### Architecture Overview

```
src/
├── app/              # Next.js 14 App Router pages and API routes
│   ├── api/          # Backend API endpoints
│   └── layout.tsx    # Root layout with theme provider
├── components/       # Reusable UI components
│   ├── layout/       # Layout-specific components
│   └── ui/           # Business logic components
├── hooks/            # Custom React hooks
├── lib/              # Core business logic and utilities
│   └── __tests__/    # Comprehensive test suite
└── types/            # TypeScript type definitions
```

## 📋 Usage

1. **Upload CSV File** 📤
   - Drag and drop or click to upload a CSV file (max 50MB)
   - Supported formats: Sales data, order data, funnel data

2. **Data Profiling** 🔍
   - Automatic analysis of data structure
   - Column types, missing values, and sample data
   - PII detection and flagging

3. **Analysis Suggestions** 💡
   - AI-generated analysis questions
   - Quick action buttons for common analyses
   - Custom query support

4. **View Results** 📊
   - Plain-English insights
   - Interactive charts and visualizations
   - Downloadable artifacts

5. **Export Data** 📦
   - Individual file downloads
   - Bulk export as ZIP
   - Versioned file naming

## 🏗️ Production Architecture

### Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript 5.3+, React 18, MUI v5
- **Backend**: Next.js API routes, Node.js runtime, OpenAI SDK v4.20+
- **AI Integration**: OpenAI Chat Completions API with structured outputs and streaming responses
- **Storage**: In-memory session management with TTL cleanup (production-ready)
- **Real-time**: Server-Sent Events with streaming support and cancellation
- **Testing**: Vitest, Testing Library, jest-axe for comprehensive coverage
- **Observability**: Built-in metrics dashboard and telemetry system

### Performance Specifications

- **File Support**: CSV files up to 50MB with intelligent validation
- **Processing Speed**: <15 seconds for datasets ≤100k rows
- **Timeout Protection**: 90-second hard timeout with graceful degradation
- **Session Management**: 24-hour TTL with activity-based refresh
- **Queue Management**: FIFO processing with configurable depth limits
- **Error Resilience**: Exponential backoff, retry logic, and comprehensive error taxonomy

## � Production Deployment

### Environment Configuration

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
APP_URL=https://your-domain.com

# Optional (with defaults)
LOG_LEVEL=info
SESSION_TTL_HOURS=24
MAX_FILE_SIZE_MB=50
MAX_QUEUE_DEPTH=10
REQUEST_TIMEOUT_MS=90000
```

### Monitoring & Observability

Built-in observability dashboard provides:

- 📊 **Performance Metrics**: P50/P95 latency, token usage, error rates
- 🔍 **System Health**: Queue depth, session count, memory usage
- 📈 **Cost Tracking**: OpenAI API usage and billing insights
- 🚨 **Error Monitoring**: Categorized error tracking with context
- 📋 **Audit Logs**: Comprehensive request/response logging

### Security Considerations

- Content Security Policy (CSP) headers configured
- Rate limiting with 429 responses and Retry-After headers
- PII detection with automatic flagging and user warnings
- File validation with format and size constraints
- Automatic data cleanup after 24-hour retention period

## 📊 Supported Data Types

- 🛒 **Sales Data**: Orders, revenue, products
- 📈 **Time Series**: Trends, seasonality analysis
- 🎯 **Channel Data**: Marketing attribution
- 👥 **Customer Data**: Cohorts, segmentation
- 📋 **General CSV**: Any structured data

## 🤝 Contributing

This project welcomes contributions! Before contributing:

1. **Fork the repository** and clone your fork
2. **Install dependencies** with `npm install`
3. **Run the test suite** with `npm run test` to ensure everything works
4. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
5. **Make your changes** following our code quality standards:
   - TypeScript strict mode compliance
   - ESLint and Prettier formatting
   - Test coverage for new features
   - Accessibility considerations
6. **Run quality checks**:
   ```bash
   npm run type-check  # TypeScript validation
   npm run lint        # ESLint with auto-fix
   npm run format      # Prettier formatting
   npm run test        # Full test suite
   ```
7. **Commit your changes** (`git commit -m 'Add amazing feature'`)
8. **Push to your branch** (`git push origin feature/amazing-feature`)
9. **Open a Pull Request** with a clear description

### Development Guidelines

- Follow the existing code style and patterns
- Add tests for new functionality
- Update documentation as needed
- Ensure accessibility compliance
- Consider performance implications

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Project Status

**Current Status**: Production Ready - 100% Complete

- ✅ Core functionality implemented and tested
- ✅ Comprehensive error handling and resilience
- ✅ Full accessibility compliance
- ✅ Observability and monitoring dashboard
- ✅ Enterprise-grade code quality standards
- ✅ Enhanced chart typography and follow-up question handling
- ✅ Professional SVG visualization system

## �🙏 Acknowledgments

- **OpenAI** for the powerful Assistants API and Code Interpreter
- **Vercel** and **Next.js team** for the incredible React framework
- **MUI team** for the beautiful and accessible component library
- **Microsoft** for TypeScript and VS Code development tools
- **Open source community** for the amazing ecosystem of tools and libraries

## 📞 Support & Documentation

If you need help or have questions:

- 📚 **Documentation**: Check the `/memory-bank/` folder for detailed project context
- � **Issues**: Open an issue on GitHub with detailed reproduction steps
- 💬 **Discussions**: Use GitHub Discussions for feature requests and questions
- 🔍 **Search**: Check existing issues and discussions before creating new ones

### Useful Resources

- 📋 [Project Specifications](/.kiro/specs/ai-data-analyst-demo/)
- 🧠 [Memory Bank Context](/memory-bank/)
- 🧪 [Test Examples](/src/lib/__tests__/)
- 📊 [API Documentation](/src/app/api/)

---

**Built with ❤️ and powered by AI** 🤖 | **Enterprise-ready CSV analysis at your fingertips** 📊
