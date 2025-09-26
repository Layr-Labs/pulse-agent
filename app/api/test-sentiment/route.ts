import { NextRequest, NextResponse } from 'next/server';
import { analyzeTweetSentiment, extractTokenMentions, shouldTrade } from '@/lib/sentiment';

export async function POST(req: NextRequest) {
  try {
    const { tweet } = await req.json();

    if (!tweet || typeof tweet !== 'string') {
      return NextResponse.json({
        error: 'Please provide a tweet text to analyze'
      }, { status: 400 });
    }

    console.log(`Testing sentiment analysis for: "${tweet}"`);

    // Extract tokens first
    const tokens = extractTokenMentions(tweet);
    console.log(`Tokens found: ${tokens.join(', ')}`);

    // Analyze sentiment
    const sentimentResult = await analyzeTweetSentiment(tweet);
    console.log(`Sentiment: ${sentimentResult.sentiment} (${sentimentResult.confidence}% confidence)`);
    console.log(`Reasoning: ${sentimentResult.reasoning}`);

    // Get trade decision
    const tradeDecision = await shouldTrade(tweet, tokens);
    console.log(`Trade decision: ${tradeDecision.shouldTrade ? 'YES' : 'NO'}`);

    return NextResponse.json({
      success: true,
      tweet,
      tokens,
      sentiment: sentimentResult,
      tradeDecision: {
        shouldTrade: tradeDecision.shouldTrade,
        reason: tradeDecision.reason
      }
    });

  } catch (error) {
    console.error('Error in sentiment analysis test:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze sentiment'
    }, { status: 500 });
  }
}