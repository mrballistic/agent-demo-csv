import { NextResponse } from 'next/server';
import { assistantManager } from '@/lib/openai';

/**
 * Debug endpoint to reset the assistant (force recreation with new config)
 */
export async function POST() {
  try {
    // Reset the cached assistant
    assistantManager.resetAssistant();

    return NextResponse.json({
      success: true,
      message:
        'Assistant reset successfully. Next request will create new assistant with current config.',
    });
  } catch (error) {
    console.error('Failed to reset assistant:', error);
    return NextResponse.json(
      { error: 'Failed to reset assistant' },
      { status: 500 }
    );
  }
}
