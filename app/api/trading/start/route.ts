import { NextResponse } from 'next/server';
import { tradingAgent } from '@/lib/tradingAgent';
import { ToastService } from '@/lib/toastService';

export async function POST() {
  try {
    await tradingAgent.start();

    // Add success toast notification
    ToastService.addSuccessToast(
      'Trading Agent Started',
      'AI agent is now monitoring influencer tweets for trading opportunities'
    );

    return NextResponse.json({
      success: true,
      message: 'Trading agent started successfully'
    });

  } catch (error) {
    console.error('Error starting trading agent:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start trading agent'
    }, { status: 500 });
  }
}