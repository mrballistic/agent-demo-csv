/**
 * Utility for cleaning up run tracking
 */

// Legacy active runs tracking for timeout management
const activeRuns = new Map<
  string,
  { threadId: string; startTime: number; timeoutId: NodeJS.Timeout }
>();

export function addActiveRun(
  runId: string,
  threadId: string,
  timeoutId: NodeJS.Timeout
) {
  activeRuns.set(runId, {
    threadId,
    startTime: Date.now(),
    timeoutId,
  });
}

export function cleanupRun(runId: string) {
  const activeRun = activeRuns.get(runId);
  if (activeRun) {
    clearTimeout(activeRun.timeoutId);
    activeRuns.delete(runId);
  }
}

export function getActiveRun(runId: string) {
  return activeRuns.get(runId);
}
