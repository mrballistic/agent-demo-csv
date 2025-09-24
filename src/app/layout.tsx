import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/layout';

export const metadata: Metadata = {
  title: 'AI Data Analyst Demo',
  description: 'Automated data analysis with OpenAI',
};

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
