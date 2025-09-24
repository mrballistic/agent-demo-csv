import { NextResponse } from 'next/server';
import { storageManager } from '@/lib/storage-manager';

export async function GET() {
  try {
    const stats = storageManager.getStorageStats();

    return NextResponse.json({
      success: true,
      data: {
        sessions: stats.sessions,
        files: stats.files,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to get storage stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve storage statistics',
      },
      { status: 500 }
    );
  }
}
