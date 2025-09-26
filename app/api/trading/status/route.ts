import { NextResponse } from 'next/server';
import { tradingAgent } from '@/lib/tradingAgent';

export async function GET() {
  try {
    const status = await tradingAgent.getStatus();

    return NextResponse.json(status);

  } catch (error) {
    console.error('Error getting trading agent status:', error);

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get status'
    }, { status: 500 });
  }
}