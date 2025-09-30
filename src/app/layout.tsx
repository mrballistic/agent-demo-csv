/**
 * @fileoverview Root Layout - Next.js root layout component
 *
 * Defines the base HTML structure and global providers for the entire application.
 * Wraps all pages with theme provider for consistent styling.
 */

import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/layout';

/**
 * Metadata configuration for the application
 */
export const metadata: Metadata = {
  title: 'AI Data Analyst Demo',
  description: 'Automated data analysis with OpenAI',
};

/**
 * Root layout component for the Next.js application
 *
 * Provides the base HTML structure and wraps all pages with global providers.
 * Sets up theme provider for consistent Material-UI theming across the app.
 *
 * @param props - Component props
 * @param props.children - Page components to render
 * @returns Complete HTML document structure
 *
 * @example
 * ```tsx
 * // This layout automatically wraps all pages
 * // No manual usage required
 * ```
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
