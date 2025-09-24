import { NextResponse } from 'next/server';
import { storageManager } from '@/lib/storage-manager';

export async function POST() {
  try {
    const result = await storageManager.cleanup();

    return NextResponse.json({
      success: true,
      data: {
        sessionsDeleted: result.sessionsDeleted,
        filesDeleted: result.filesDeleted,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to cleanup storage:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup storage',
      },
      { status: 500 }
    );
  }
}
