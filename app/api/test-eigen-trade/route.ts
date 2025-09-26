import { NextRequest, NextResponse } from 'next/server';
import { executeTrade, TradeRequest } from '@/lib/trading';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing EIGEN trade execution...');

    const tradeRequest: TradeRequest = {
      token: 'EIGEN',
      influencer: 'test_user',
      tweetId: `test-eigen-trade-${Date.now()}`,
      tweet: 'Test tweet: EIGEN is looking bullish! Great fundamentals and strong community support. $EIGEN to the moon! 🚀 #cryptocurrency #trading'
    };

    console.log('🔍 [TEST] Starting EIGEN trade test with request:', {
      token: tradeRequest.token,
      influencer: tradeRequest.influencer,
      tweetId: tradeRequest.tweetId
    });

    await executeTrade(tradeRequest);

    console.log('✅ [TEST] EIGEN trade test completed successfully');

    return NextResponse.json({
      success: true,
      message: 'EIGEN trade executed successfully',
      tradeRequest: {
        token: tradeRequest.token,
        influencer: tradeRequest.influencer,
        tweetId: tradeRequest.tweetId
      }
    });

  } catch (error) {
    console.error('❌ [TEST] EIGEN trade test failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Check server logs for more information'
    }, { status: 500 });
  }
}