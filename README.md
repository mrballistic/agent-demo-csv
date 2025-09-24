# 🤖 AI Data Analyst Demo

> 📊 Automated data analysis with OpenAI's Assistants API and Code Interpreter

## ✨ Features

- 📁 **CSV Upload & Validation** - Drag & drop CSV files with intelligent validation
- 🔍 **Automatic Data Profiling** - Get instant insights about your data structure
- 💡 **Smart Analysis Suggestions** - AI-powered recommendations based on your data
- 📈 **Interactive Charts** - Beautiful visualizations generated automatically
- 💬 **Chat Interface** - Natural language interaction with your data
- 📦 **Export & Download** - Save charts, cleaned data, and analysis reports
- 🔒 **Privacy First** - PII detection and automatic data redaction
- ⚡ **Real-time Updates** - Live progress tracking with Server-Sent Events

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

- `npm run dev` - 🔥 Start development server
- `npm run build` - 🏗️ Build for production
- `npm run start` - 🚀 Start production server
- `npm run lint` - 🔍 Run ESLint
- `npm run format` - ✨ Format code with Prettier
- `npm run type-check` - 🔎 Check TypeScript types

### Code Quality

This project uses:

- 🔧 **TypeScript** with strict mode
- 📏 **ESLint** for code linting
- 💅 **Prettier** for code formatting
- 🐕 **Husky** for pre-commit hooks
- 📋 **lint-staged** for staged file linting

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

## 🏗️ Architecture

- **Frontend**: Next.js 14 with App Router, MUI components
- **Backend**: Next.js API routes with Node.js runtime
- **AI Integration**: OpenAI Assistants API with Code Interpreter
- **Storage**: In-memory session management (MVP)
- **Real-time**: Server-Sent Events for live updates

## 🔒 Security Features

- Content Security Policy (CSP) headers
- PII detection and automatic redaction
- File validation and size limits
- Rate limiting and request queuing
- 24-hour data retention policy

## 📊 Supported Data Types

- 🛒 **Sales Data**: Orders, revenue, products
- 📈 **Time Series**: Trends, seasonality analysis
- 🎯 **Channel Data**: Marketing attribution
- 👥 **Customer Data**: Cohorts, segmentation
- 📋 **General CSV**: Any structured data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for the Assistants API and Code Interpreter
- Next.js team for the amazing framework
- MUI for the beautiful components
- All contributors and users of this project

## 📞 Support

If you have any questions or need help:

- 📧 Open an issue on GitHub
- 💬 Check the documentation
- 🔍 Search existing issues

---

Made with ❤️ and powered by AI 🤖
