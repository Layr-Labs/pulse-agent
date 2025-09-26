import { NextResponse } from 'next/server';
import { tradingAgent } from '@/lib/tradingAgent';
import { ToastService } from '@/lib/toastService';

export async function POST() {
  try {
    await tradingAgent.stop();

    // Add info toast notification
    ToastService.addInfoToast(
      'Trading Agent Stopped',
      'AI agent has stopped monitoring and will not execute new trades'
    );

    return NextResponse.json({
      success: true,
      message: 'Trading agent stopped successfully'
    });

  } catch (error) {
    console.error('Error stopping trading agent:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop trading agent'
    }, { status: 500 });
  }
}