/**
 * Observability Dashboard Page
 * Simple dashboard showing latency and error rate metrics
 * Implements requirement 8.2 DoD: Simple dashboard shows latency and error rate
 */

import { Metadata } from 'next';
import { ObservabilityDashboard } from '@/components/ui/ObservabilityDashboard';

export const metadata: Metadata = {
  title: 'Observability Dashboard - AI Data Analyst Demo',
  description: 'System metrics and observability dashboard',
};

export default function DashboardPage() {
  return <ObservabilityDashboard />;
}
