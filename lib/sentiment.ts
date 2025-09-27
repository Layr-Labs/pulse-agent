import { eigenai } from './eigenai-provider';
import { generateText } from 'ai';
import { TRADING_CONFIG } from '@/config/trading';

export interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  isPositive: boolean;
  tokens: string[];
}

export async function analyzeTweetSentiment(tweetText: string): Promise<SentimentResult> {
  console.log('🔍 [SENTIMENT] Starting sentiment analysis...');
  console.log('🔍 [SENTIMENT] Tweet text:', `"${tweetText}"`);

  try {
    console.log('🔍 [SENTIMENT] Calling Eigen AI API for sentiment analysis...');
    const { text } = await generateText({
      model: eigenai('gemma-3-27b-it-q4'),
      messages: [
        {
          role: 'system',
          content: `You are a cryptocurrency sentiment analysis expert. Analyze tweets for their sentiment regarding cryptocurrencies and trading opportunities.

Rules:
1. Classify sentiment as: "bullish", "bearish", or "neutral"
2. Provide confidence score (0-100)
3. Give brief reasoning (1-2 sentences)
4. Focus on trading implications, not general crypto discussion

Response format (JSON):
{
  "sentiment": "bullish|bearish|neutral",
  "confidence": 85,
  "reasoning": "Brief explanation of why this sentiment was chosen"
}`
        },
        {
          role: 'user',
          content: `Analyze this tweet for crypto trading sentiment:\n\n"${tweetText}"`
        }
      ],
      maxTokens: 200,
      temperature: 0.1
    });

    console.log('🔍 [SENTIMENT] Eigen AI response:', text);

    // Clean up the response - remove markdown formatting if present
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/```json\s*/, '').replace(/```$/, '').trim();
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```\s*/, '').replace(/```$/, '').trim();
    }

    console.log('🔍 [SENTIMENT] Cleaned response:', cleanedText);

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(cleanedText);
      console.log('🔍 [SENTIMENT] Parsed analysis:', analysis);
    } catch (parseError) {
      console.error('🔍 [SENTIMENT] Failed to parse JSON response:', parseError);
      console.log('🔍 [SENTIMENT] Raw response was:', text);
      console.log('🔍 [SENTIMENT] Cleaned response was:', cleanedText);
      throw parseError;
    }

    // Extract tokens from the tweet
    const tokens = await extractTokenMentions(tweetText);

    const isPositive = analysis.sentiment === 'bullish' && analysis.confidence >= TRADING_CONFIG.minimumConfidence;
    console.log('🔍 [SENTIMENT] Final result:');
    console.log(`   - Sentiment: ${analysis.sentiment}`);
    console.log(`   - Confidence: ${analysis.confidence}%`);
    console.log(`   - Reasoning: ${analysis.reasoning}`);
    console.log(`   - Minimum confidence threshold: ${TRADING_CONFIG.minimumConfidence}%`);
    console.log(`   - Is positive: ${isPositive}`);
    console.log(`   - Tokens found: ${tokens.join(', ')}`);

    return {
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      isPositive,
      tokens
    };

  } catch (error) {
    console.error('❌ [SENTIMENT] Error in Eigen AI sentiment analysis:', error);

    // Fallback to simple analysis if Eigen AI fails
    console.log('🔍 [SENTIMENT] Using fallback analysis...');
    const tokens = await extractTokenMentions(tweetText);
    console.log('🔍 [SENTIMENT] Fallback result: neutral sentiment, no trading');
    return {
      sentiment: 'neutral',
      confidence: 0,
      reasoning: 'Failed to analyze sentiment',
      isPositive: false,
      tokens
    };
  }
}

/**
 * Extract crypto protocols/projects from text using LLM analysis
 */
async function extractCryptoProjects(tweetText: string): Promise<string[]> {
  console.log('🔍 [PROJECTS] Starting crypto project extraction...');
  console.log('🔍 [PROJECTS] Text to analyze:', `"${tweetText}"`);

  try {
    console.log('🔍 [PROJECTS] Calling Eigen AI to extract crypto projects...');
    const { text } = await generateText({
      model: eigenai('gemma-3-27b-it-q4'),
      messages: [
        {
          role: 'system',
          content: `You are a cryptocurrency and DeFi expert. Extract all cryptocurrency protocols, projects, tokens, and chains mentioned in text.

Rules:
1. Include any crypto-related projects (DeFi, Layer 1s, Layer 2s, tokens, protocols, etc.)
2. Include company names building crypto products (e.g., Coinbase, Circle, etc.)
3. Use the actual project names as mentioned in the text
4. Don't include generic terms like "crypto", "blockchain", "DeFi"
5. Be comprehensive - include lesser-known projects too

Response format (JSON array of strings):
["ProjectName1", "ProjectName2", ...]

Examples:
- "EigenCloud" -> ["EigenCloud"]
- "Bitcoin and Ethereum" -> ["Bitcoin", "Ethereum"]
- "Uniswap V3 on Arbitrum" -> ["Uniswap", "Arbitrum"]
- "AAVE lending protocol" -> ["AAVE"]`
        },
        {
          role: 'user',
          content: `Extract crypto projects from: "${tweetText}"`
        }
      ],
      maxTokens: 300,
      temperature: 0.1
    });

    console.log('🔍 [PROJECTS] Raw Eigen AI response:', text);

    // Clean up the response - remove markdown formatting if present
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/```json\s*/, '').replace(/```$/, '').trim();
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```\s*/, '').replace(/```$/, '').trim();
    }

    console.log('🔍 [PROJECTS] Cleaned response:', cleanedText);

    const projects = JSON.parse(cleanedText) as string[];
    const validProjects = Array.isArray(projects) ? projects : [];

    console.log('🔍 [PROJECTS] Extracted projects:', validProjects);
    console.log('🔍 [PROJECTS] Number of projects found:', validProjects.length);

    return validProjects;

  } catch (error) {
    console.error('❌ [PROJECTS] Error extracting crypto projects:', error);
    console.log('🔍 [PROJECTS] Returning empty array due to error');
    return [];
  }
}

/**
 * Map project names to their trading tickers using LLM
 */
async function mapProjectsToTickers(projects: string[]): Promise<string[]> {
  console.log('🔍 [TICKERS] Starting project-to-ticker mapping...');
  console.log('🔍 [TICKERS] Projects to map:', projects);

  if (projects.length === 0) {
    console.log('🔍 [TICKERS] No projects to map, returning empty array');
    return [];
  }

  try {
    console.log('🔍 [TICKERS] Calling Eigen AI to map projects to tickers...');
    const { text } = await generateText({
      model: eigenai('gemma-3-27b-it-q4'),
      messages: [
        {
          role: 'system',
          content: `You are a cryptocurrency expert. Map project names to their primary trading ticker symbols.

Rules:
1. Return only ticker symbols that are actively traded on major exchanges
2. Use the most common/primary ticker (e.g., WETH -> ETH, USDC -> USDC)
3. Skip projects without tradeable tokens
4. Use uppercase ticker symbols
5. For projects with multiple tokens, return the main one

Response format (JSON array of strings):
["ETH", "SOL", "EIGEN"]

Common mappings:
- Ethereum -> ETH
- EigenLayer -> EIGEN
- Uniswap -> UNI
- Chainlink -> LINK
- Solana -> SOL
- etc.

IMPORTANT: Do NOT return BTC or Bitcoin - skip Bitcoin-related projects.`
        },
        {
          role: 'user',
          content: `Map these projects to tickers: ${JSON.stringify(projects)}`
        }
      ],
      maxTokens: 200,
      temperature: 0.1
    });

    console.log('🔍 [TICKERS] Raw Eigen AI response:', text);

    // Clean up the response - remove markdown formatting if present
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/```json\s*/, '').replace(/```$/, '').trim();
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```\s*/, '').replace(/```$/, '').trim();
    }

    console.log('🔍 [TICKERS] Cleaned response:', cleanedText);

    const tickers = JSON.parse(cleanedText) as string[];
    const validTickers = Array.isArray(tickers) ? tickers.filter(t => t && t.length > 0) : [];

    console.log('🔍 [TICKERS] Final mapped tickers:', validTickers);
    console.log('🔍 [TICKERS] Number of tickers mapped:', validTickers.length);

    return validTickers;

  } catch (error) {
    console.error('❌ [TICKERS] Error mapping projects to tickers:', error);
    console.log('🔍 [TICKERS] Returning empty array due to error');
    return [];
  }
}

/**
 * Enhanced token extraction using LLM analysis
 */
export async function extractTokenMentions(tweetText: string): Promise<string[]> {
  console.log('🔍 [TOKENS] ===== STARTING TOKEN EXTRACTION =====');
  console.log('🔍 [TOKENS] Input text:', `"${tweetText}"`);

  try {
    // Step 1: Extract cashtags first (fast, reliable)
    console.log('🔍 [TOKENS] Step 1: Extracting cashtags...');
    const cashtags: string[] = [];
    const cashtagPattern = /\$([A-Z]{2,10})\b/g;
    let match;
    while ((match = cashtagPattern.exec(tweetText)) !== null) {
      cashtags.push(match[1]);
    }
    console.log('🔍 [TOKENS] Cashtags found:', cashtags.length > 0 ? cashtags : 'none');

    // Step 2: Use LLM to extract crypto projects
    console.log('🔍 [TOKENS] Step 2: Analyzing text for crypto projects...');
    const projects = await extractCryptoProjects(tweetText);
    console.log(`🔍 [TOKENS] Projects found: ${projects.length > 0 ? projects.join(', ') : 'none'}`);

    // Step 3: Map projects to tickers
    let tickers: string[] = [];
    if (projects.length > 0) {
      console.log('🔍 [TOKENS] Step 3: Mapping projects to tickers...');
      tickers = await mapProjectsToTickers(projects);
      console.log(`🔍 [TOKENS] Tickers mapped: ${tickers.length > 0 ? tickers.join(', ') : 'none'}`);
    } else {
      console.log('🔍 [TOKENS] Step 3: Skipping ticker mapping (no projects found)');
    }

    // Combine cashtags and LLM-derived tickers
    const allTokens = [...new Set([...cashtags, ...tickers])];
    console.log('🔍 [TOKENS] Final combined tokens:', allTokens.length > 0 ? allTokens : 'none');
    console.log('🔍 [TOKENS] ===== TOKEN EXTRACTION COMPLETE =====');

    return allTokens;

  } catch (error) {
    console.error('❌ [TOKENS] Error in enhanced token extraction:', error);

    // Fallback to simple cashtag extraction
    console.log('🔍 [TOKENS] Using fallback cashtag extraction...');
    const tokens: string[] = [];
    const cashtagPattern = /\$([A-Z]{2,10})\b/g;
    let match;
    while ((match = cashtagPattern.exec(tweetText)) !== null) {
      tokens.push(match[1]);
    }
    console.log('🔍 [TOKENS] Fallback tokens found:', tokens.length > 0 ? tokens : 'none');
    console.log('🔍 [TOKENS] ===== TOKEN EXTRACTION COMPLETE (FALLBACK) =====');
    return tokens;
  }
}

export async function shouldTrade(tweetText: string, tokens: string[]): Promise<{ shouldTrade: boolean; reason: string; tokens: string[]; sentimentData?: SentimentResult }> {
  console.log('🔍 [TRADE_DECISION] ===== STARTING TRADE DECISION =====');
  console.log('🔍 [TRADE_DECISION] Input tokens:', tokens);

  const sentimentResult = await analyzeTweetSentiment(tweetText);

  console.log('🔍 [TRADE_DECISION] Sentiment analysis complete, checking trading criteria...');

  if (tokens.length === 0) {
    console.log('🔍 [TRADE_DECISION] ❌ No tradeable tokens mentioned - NO TRADE');
    return {
      shouldTrade: false,
      reason: 'No tradeable tokens mentioned',
      tokens: [],
      sentimentData: sentimentResult
    };
  }

  console.log('🔍 [TRADE_DECISION] ✅ Tokens found, checking sentiment...');

  if (!sentimentResult.isPositive) {
    console.log(`🔍 [TRADE_DECISION] ❌ Sentiment not positive - NO TRADE`);
    console.log(`🔍 [TRADE_DECISION]    Sentiment: ${sentimentResult.sentiment}`);
    console.log(`🔍 [TRADE_DECISION]    Confidence: ${sentimentResult.confidence}%`);
    console.log(`🔍 [TRADE_DECISION]    Required: bullish with ≥${TRADING_CONFIG.minimumConfidence}% confidence`);
    return {
      shouldTrade: false,
      reason: `${sentimentResult.sentiment.toUpperCase()} sentiment (${sentimentResult.confidence}% confidence): ${sentimentResult.reasoning}`,
      tokens,
      sentimentData: sentimentResult
    };
  }

  // Additional safety check for clearly bearish signals
  if (sentimentResult.sentiment === 'bearish') {
    console.log('🔍 [TRADE_DECISION] ❌ Bearish sentiment detected - NO TRADE');
    return {
      shouldTrade: false,
      reason: `Bearish sentiment detected: ${sentimentResult.reasoning}`,
      tokens,
      sentimentData: sentimentResult
    };
  }

  console.log('🔍 [TRADE_DECISION] ✅ All criteria met - TRADE APPROVED');
  console.log('🔍 [TRADE_DECISION] ===== TRADE DECISION COMPLETE =====');

  return {
    shouldTrade: true,
    reason: `BULLISH sentiment (${sentimentResult.confidence}% confidence): ${sentimentResult.reasoning}`,
    tokens,
    sentimentData: sentimentResult
  };
}