// Test script for Twitter API integration
require('dotenv').config();

const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_ENDPOINT = 'https://api.twitterapi.io/twitter/user/last_tweets';

if (!TWITTER_API_KEY) {
  console.error('❌ TWITTER_API_KEY not found in environment variables');
  console.log('Please add your Twitter API key to .env.local:');
  console.log('TWITTER_API_KEY=your_twitter_api_key_here');
  process.exit(1);
}

async function testTwitterAPI() {
  console.log('🧪 Testing Twitter API integration...');

  const testUsers = ['crypto_rand', 'trading_axe'];

  for (const username of testUsers) {
    try {
      console.log(`\n🔍 Testing @${username}...`);

      const url = `${TWITTER_API_ENDPOINT}?userName=${username}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': TWITTER_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ API call successful for @' + username);

      console.log('Response structure:', {
        status: data.status,
        code: data.code,
        msg: data.msg,
        tweetsCount: data.data?.tweets?.length || 0
      });

      if (data.status === 'success' && data.data?.tweets?.length > 0) {
        const tweets = data.data.tweets;
        console.log(`\n📱 Found ${tweets.length} tweets for @${username}`);

        // Show first 3 tweets
        tweets.slice(0, 3).forEach((tweet, index) => {
          const ageHours = ((Date.now() - new Date(tweet.createdAt).getTime()) / (60 * 60 * 1000)).toFixed(1);

          console.log(`\n${index + 1}. Tweet (${ageHours}h ago):`);
          console.log(`   ID: ${tweet.id}`);
          console.log(`   Text: ${tweet.text.substring(0, 150)}${tweet.text.length > 150 ? '...' : ''}`);
          console.log(`   Created: ${tweet.createdAt}`);
          console.log(`   Stats: ${tweet.likeCount} likes, ${tweet.retweetCount} retweets, ${tweet.viewCount} views`);
          console.log(`   Is Reply: ${tweet.isReply}`);

          // Check for crypto mentions
          const cryptoPatterns = [/\$[A-Z]{2,10}/g, /bitcoin/i, /ethereum/i, /crypto/i, /defi/i, /eigen/i];
          const hasCrypto = cryptoPatterns.some(pattern => pattern.test(tweet.text));
          if (hasCrypto) {
            console.log(`   🚀 Contains crypto content!`);
          }
        });
      } else {
        console.log(`❌ No tweets found or API error for @${username}`);
        console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
      }

    } catch (error) {
      console.error(`❌ Error testing @${username}:`, error.message);

      if (error.message.includes('401')) {
        console.log('\n💡 This looks like an authentication error.');
        console.log('Please check your TWITTER_API_KEY in .env.local');
      } else if (error.message.includes('429')) {
        console.log('\n💡 Rate limit reached. Please wait and try again.');
      } else if (error.message.includes('fetch is not defined')) {
        console.log('\n💡 This test requires Node.js 18+ with fetch support.');
      }
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ Twitter API test complete!');
  console.log('\n💡 If successful, your trading agent should now be able to:');
  console.log('   - Fetch real-time tweets from influencers');
  console.log('   - Process only the 5 most recent tweets per user');
  console.log('   - Extract crypto tokens and analyze sentiment');
  console.log('   - Execute trades based on bullish signals');
}

testTwitterAPI().catch(console.error);