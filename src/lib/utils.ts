/**
 * Common utility functions for the AI Data Analyst application
 * @fileoverview Provides shared utility functions for ID generation, file formatting, and date/time operations
 */

/**
 * Generates a unique identifier using random characters and timestamp
 * @returns A unique string ID combining random characters and current timestamp
 * @example
 * ```typescript
 * const id = generateId(); // "abc123def456789"
 * ```
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Formats a byte count into a human-readable file size string
 * @param bytes - The number of bytes to format
 * @returns A formatted string with appropriate unit (Bytes, KB, MB, GB)
 * @example
 * ```typescript
 * formatFileSize(1024); // "1 KB"
 * formatFileSize(1536); // "1.5 KB"
 * formatFileSize(0); // "0 Bytes"
 * ```
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formats a Date object into a localized timestamp string
 * @param date - The Date object to format
 * @returns A formatted timestamp string in US locale format
 * @example
 * ```typescript
 * formatTimestamp(new Date()); // "Sep 30, 2025, 02:30 PM"
 * ```
 */
export function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
