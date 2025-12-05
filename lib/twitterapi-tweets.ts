import { TRADING_CONFIG } from '@/config/trading';
import { analyzeTweetSentiment, extractTokenMentions, shouldTrade } from './sentiment';
import { database } from './database';
import { executeTrade } from './trading';
import { TweetStream } from './tweetStream';

interface TwitterApiTweet {
  type: string;
  id: string;
  url: string;
  twitterUrl: string;
  text: string;
  source: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
  createdAt: string;
  lang: string;
  bookmarkCount: number;
  isReply: boolean;
  inReplyToId: string | null;
  conversationId: string;
  displayTextRange: number[];
  inReplyToUserId: string | null;
  inReplyToUsername: string | null;
  author: {
    type: string;
    userName: string;
    url: string;
    twitterUrl: string;
    id: string;
    name: string;
    isVerified: boolean;
    isBlueVerified: boolean;
    verifiedType: string;
    profilePicture: string;
    coverPicture: string;
    description: string;
    location: string;
    followers: number;
    following: number;
    status: string;
    canDm: boolean;
    canMediaTag: boolean;
    createdAt: string;
  };
}

interface TwitterApiResponse {
  status: string;
  code: number;
  msg: string;
  data: {
    pin_tweet: any | null;
    tweets: TwitterApiTweet[];
  };
}

export class TwitterApiMonitoringService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private apiKey: string;
  private endpoint: string = 'https://api.twitterapi.io/twitter/user/last_tweets';

  constructor() {
    if (!process.env.TWITTER_API_KEY) {
      throw new Error('TWITTER_API_KEY is required in environment variables');
    }

    this.apiKey = process.env.TWITTER_API_KEY;
  }

  async startPolling() {
    if (this.isRunning) {
      console.log('Twitter API monitoring is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Twitter API monitoring mode...');

    // Check tweets every 5 minutes
    this.intervalId = setInterval(async () => {
      try {
        await this.checkRecentTweets();
      } catch (error) {
        console.error('🔍 [TWITTER_API] ❌ Critical error in polling interval:', error);
        console.log('🔍 [TWITTER_API] 🔄 Continuing to poll despite error...');
      }
    }, 5 * 60 * 1000);

    console.log('Twitter API monitoring started - checking every 5 minutes');

    // Do initial check in background to avoid blocking startup
    setTimeout(async () => {
      try {
        console.log('🔍 [TWITTER_API] Running initial tweet check...');
        await this.checkRecentTweets();
        console.log('🔍 [TWITTER_API] Initial tweet check completed');
      } catch (error) {
        console.error('🔍 [TWITTER_API] ❌ Initial tweet check failed:', error);
        console.log('🔍 [TWITTER_API] 🔄 Will continue with scheduled polling...');
      }
    }, 2000); // 2 second delay
  }

  async startMonitoring() {
    // Alias for compatibility with existing code
    return this.startPolling();
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Twitter API monitoring stopped');
  }

  async stopMonitoring() {
    // Alias for compatibility with existing code
    this.stopPolling();
  }

  async initialize() {
    console.log('Twitter API service initialized for influencers:', TRADING_CONFIG.influencers);
    return Promise.resolve();
  }

  async checkRecentTweets() {
    if (!this.isRunning) {
      console.log('🔍 [TWITTER_API] Not running, skipping tweet check');
      return;
    }

    console.log('🔍 [TWITTER_API] ===== STARTING RECENT TWEETS CHECK =====');
    console.log(`🔍 [TWITTER_API] Monitoring ${TRADING_CONFIG.influencers.length} influencers: ${TRADING_CONFIG.influencers.join(', ')}`);

    // Phase 1: Fetch tweets in batches to avoid rate limits
    const startFetch = Date.now();
    const FETCH_BATCH_SIZE = 3;
    const FETCH_BATCH_DELAY = 300; // 300ms between batches
    const fetchResults: PromiseSettledResult<{ username: string; tweets: TwitterApiTweet[] }>[] = [];

    for (let i = 0; i < TRADING_CONFIG.influencers.length; i += FETCH_BATCH_SIZE) {
      const batch = TRADING_CONFIG.influencers.slice(i, i + FETCH_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(username => 
          this.fetchUserTweets(username).then(tweets => ({ username, tweets }))
        )
      );
      fetchResults.push(...batchResults);
      
      // Small delay between batches
      if (i + FETCH_BATCH_SIZE < TRADING_CONFIG.influencers.length) {
        await new Promise(resolve => setTimeout(resolve, FETCH_BATCH_DELAY));
      }
    }
    console.log(`🔍 [TWITTER_API] ⚡ Fetched all influencers in ${Date.now() - startFetch}ms`);

    // Phase 2: Collect and filter all tweets
    const allTweets: Array<{ tweet: TwitterApiTweet; username: string }> = [];
    const maxAgeMs = TRADING_CONFIG.tweetMaxAgeHours * 60 * 60 * 1000;

    for (const result of fetchResults) {
      if (result.status === 'rejected') {
        console.error('🔍 [TWITTER_API] ❌ Fetch failed:', result.reason);
        continue;
      }

      const { username, tweets } = result.value;
      if (!tweets || tweets.length === 0) {
        console.log(`🔍 [TWITTER_API] No tweets for @${username}`);
        continue;
      }

      console.log(`🔍 [TWITTER_API] Found ${tweets.length} tweets for @${username}`);

      for (const tweet of tweets) {
        // Add to stream for UI display
        TweetStream.add({
          id: tweet.id,
          influencer: username,
          tweet: tweet.text,
          createdAt: tweet.createdAt
        });

        const tweetAge = Date.now() - new Date(tweet.createdAt).getTime();
        const ageHours = (tweetAge / (60 * 60 * 1000)).toFixed(1);

        // Quick filters (no async/LLM needed)
        if (tweetAge > maxAgeMs) {
          console.log(`🔍 [TWITTER_API] ⏰ @${username} tweet too old (${ageHours}h)`);
          continue;
        }

        if (this.isPhotoOnlyTweet(tweet.text)) {
          await database.markTweetAsProcessed(tweet.id);
          continue;
        }

        if (tweet.isReply) {
          continue;
        }

        allTweets.push({ tweet, username });
      }
    }

    // Phase 3: Batch check which tweets are already processed
    const tweetIds = allTweets.map(t => t.tweet.id);
    const processedSet = await database.getProcessedTweetIds(tweetIds);
    const newTweets = allTweets.filter(t => !processedSet.has(t.tweet.id));

    console.log(`🔍 [TWITTER_API] 📊 ${newTweets.length} new tweets to process (filtered ${allTweets.length - newTweets.length} already processed)`);

    // Phase 4: Process new tweets in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    for (let i = 0; i < newTweets.length; i += CONCURRENCY_LIMIT) {
      const batch = newTweets.slice(i, i + CONCURRENCY_LIMIT);
      const startBatch = Date.now();
      
      await Promise.allSettled(
        batch.map(({ tweet, username }) => {
          console.log(`🔍 [TWITTER_API] 🆕 Processing @${username}: "${tweet.text.substring(0, 60)}..."`);
          return this.processTweet(tweet, username);
        })
      );
      
      console.log(`🔍 [TWITTER_API] ⚡ Batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1} completed in ${Date.now() - startBatch}ms`);
    }

    console.log('🔍 [TWITTER_API] ===== RECENT TWEETS CHECK COMPLETE =====');
  }

  private isPhotoOnlyTweet(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    const replaced = trimmed.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, '');
    return replaced.length === 0;
  }

  private async fetchUserTweets(username: string): Promise<TwitterApiTweet[]> {
    try {
      console.log(`🔍 [TWITTER_API] Calling Twitter API for @${username}...`);

      const url = `${this.endpoint}?userName=${username}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
      }

      const data: TwitterApiResponse = await response.json();
      console.log(`🔍 [TWITTER_API] API response status for @${username}:`, data.status, data.msg);

      if (data.status !== 'success' || data.code !== 0) {
        console.log('🔍 [TWITTER_API] API returned unsuccessful status:', data);
        return [];
      }

      if (!data.data || !data.data.tweets || !Array.isArray(data.data.tweets)) {
        console.log('🔍 [TWITTER_API] No tweets in response data');
        return [];
      }

      const tweets = data.data.tweets.filter(tweet => {
        const isRetweet = tweet.type?.toLowerCase?.() === 'retweet' || tweet.text.trim().startsWith('RT ');
        return !isRetweet;
      });
      console.log(`🔍 [TWITTER_API] Successfully fetched ${tweets.length} original tweets for @${username}`);

      // Log first tweet for debugging
      if (tweets.length > 0) {
        console.log(`🔍 [TWITTER_API] Sample tweet:`, {
          id: tweets[0].id,
          text: tweets[0].text.substring(0, 100) + '...',
          createdAt: tweets[0].createdAt,
          isReply: tweets[0].isReply
        });
      }

      return tweets;

    } catch (error) {
      console.error(`🔍 [TWITTER_API] Error fetching tweets for @${username}:`, error);
      return [];
    }
  }

  private async processTweet(tweet: TwitterApiTweet, username: string) {
    console.log('🔍 [TWEET_PROC] ===== STARTING TWEET PROCESSING =====');
    console.log('🔍 [TWEET_PROC] Tweet details:', {
      id: tweet.id,
      author: username,
      text: tweet.text.substring(0, 200) + '...',
      views: tweet.viewCount,
      likes: tweet.likeCount,
      retweets: tweet.retweetCount,
      isReply: tweet.isReply
    });

    try {
      // Fast cashtag extraction (synchronous) - LLM will find additional tokens
      console.log('🔍 [TWEET_PROC] Extracting cashtags...');
      const seedTokens = extractTokenMentions(tweet.text);
      console.log(`🔍 [TWEET_PROC] Seed cashtags: ${seedTokens.length > 0 ? seedTokens.join(', ') : 'none (LLM will analyze)'}`);

      // Single unified LLM call for sentiment + token analysis
      console.log(`🔍 [TWEET_PROC] Starting unified analysis...`);
      const tradeDecision = await shouldTrade(tweet.text, seedTokens);

      console.log(`🔍 [TWEET_PROC] 📊 Analysis: ${tradeDecision.sentimentData?.sentiment.toUpperCase()} (${tradeDecision.sentimentData?.confidence}% confidence)`);
      console.log(`🔍 [TWEET_PROC] 📝 Reasoning: ${tradeDecision.sentimentData?.reasoning}`);
      console.log(`🔍 [TWEET_PROC] 🚀 Trade decision: ${tradeDecision.shouldTrade ? 'YES' : 'NO'} - ${tradeDecision.reason}`);

      if (tradeDecision.shouldTrade) {
        console.log(`🔍 [TWEET_PROC] ✅ EXECUTING TRADES for ${tradeDecision.tokens.length} tokens...`);

        // Execute trades for each token
        for (const token of tradeDecision.tokens) {
          try {
            console.log(`🔍 [TWEET_PROC] 🚀 Executing trade for ${token} based on @${username}'s tweet`);

            await executeTrade({
              token,
              tweet: tweet.text,
              influencer: username,
              tweetId: tweet.id,
              profileImageUrl: tweet.author?.profilePicture
            });

            console.log(`🔍 [TWEET_PROC] ✅ Trade executed successfully for ${token}`);
          } catch (error) {
            console.error(`🔍 [TWEET_PROC] ❌ Error executing trade for ${token}:`, error);
          }
        }
        console.log(`🔍 [TWEET_PROC] All trades completed`);
      } else {
        console.log(`🔍 [TWEET_PROC] ❌ No trades executed - ${tradeDecision.reason}`);
      }

      // Mark tweet as processed
      console.log('🔍 [TWEET_PROC] Marking tweet as processed...');
      await database.markTweetAsProcessed(tweet.id);
      console.log('🔍 [TWEET_PROC] Tweet marked as processed successfully');
      console.log('🔍 [TWEET_PROC] ===== TWEET PROCESSING COMPLETE =====');

    } catch (error) {
      console.error('🔍 [TWEET_PROC] ❌ Error processing tweet:', error);
      console.log('🔍 [TWEET_PROC] ===== TWEET PROCESSING FAILED =====');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: 'polling',
      checkInterval: '5 minutes',
      service: 'TwitterAPI.io'
    };
  }

  // Manual trigger for testing
  async manualCheck() {
    console.log('Running manual tweet check via Twitter API...');
    await this.checkRecentTweets();
  }
}

export const twitterApiService = new TwitterApiMonitoringService();
