// Simple test script for xAI integration
require('dotenv').config();

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

if (!XAI_API_KEY) {
  console.error('❌ XAI_API_KEY not found in environment variables');
  console.log('Please add your xAI API key to .env.local:');
  console.log('XAI_API_KEY=your_xai_api_key_here');
  process.exit(1);
}

async function testXAIAPI() {
  console.log('🧪 Testing xAI API integration...');

  try {
    const response = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an X API assistant meant to fetch tweets from a given user. return the tweets in a JSON array. do not include anything else.'
          },
          {
            role: 'user',
            content: 'give me the 5 latest tweets from @trading_axe.'
          }
        ],
        search_parameters: {
          enabled: 'true'
        },
        model: 'grok-4-latest',
        stream: false,
        temperature: 0
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ xAI API call successful!');
    console.log('Response structure:', {
      id: data.id,
      model: data.model,
      choices: data.choices?.length || 0,
      usage: data.usage
    });

    if (data.choices && data.choices[0]) {
      const content = data.choices[0].message.content;
      console.log('\n📱 Raw tweet content response:');
      console.log(content);

      try {
        const tweets = JSON.parse(content);
        console.log(`\n✅ Successfully parsed ${tweets.length} tweets`);

        if (tweets.length > 0) {
          console.log('\n📊 Sample tweet:');
          console.log('- Published:', tweets[0].published);
          console.log('- Content:', tweets[0].content.substring(0, 100) + '...');
          console.log('- Views:', tweets[0].view_count);
          console.log('- Likes:', tweets[0].favorite_count);
        }
      } catch (parseError) {
        console.error('❌ Failed to parse tweets JSON:', parseError.message);
        console.log('Raw content:', content.substring(0, 200) + '...');
      }
    }

  } catch (error) {
    console.error('❌ xAI API test failed:', error.message);

    if (error.message.includes('401')) {
      console.log('\n💡 This looks like an authentication error.');
      console.log('Please check your XAI_API_KEY in .env.local');
    } else if (error.message.includes('429')) {
      console.log('\n💡 Rate limit reached. Please wait and try again.');
    } else if (error.message.includes('fetch is not defined')) {
      console.log('\n💡 This test requires Node.js 18+ with fetch support.');
      console.log('Try running: node --experimental-fetch test-xai.js');
    }
  }
}

testXAIAPI();