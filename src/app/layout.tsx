import type { Metadata } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
