import { NextRequest, NextResponse } from 'next/server';
import { ToastService } from '@/lib/toastService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');

    const sinceTimestamp = since ? parseInt(since, 10) : undefined;
    const toasts = ToastService.getRecentToasts(sinceTimestamp);

    return NextResponse.json({
      toasts,
      timestamp: Date.now() // Current server time for next poll
    });
  } catch (error) {
    console.error('Error fetching toasts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch toasts' },
      { status: 500 }
    );
  }
}