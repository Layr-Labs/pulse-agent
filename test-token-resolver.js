// Test script for dynamic token resolution
require('dotenv').config();

const { DynamicTokenResolver } = require('./dist/lib/tokenResolver.js');

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  console.log('Please add your OpenAI API key to .env.local');
  process.exit(1);
}

async function testTokenResolver() {
  console.log('🧪 Testing Dynamic Token Resolver...\n');

  const resolver = new DynamicTokenResolver('base-mainnet');

  // Test popular tokens that should exist on Base
  const testTokens = ['USDC', 'WETH', 'ETH', 'EIGEN', 'UNI', 'LINK'];

  console.log('🔍 Testing individual token resolution:');
  console.log('==========================================');

  for (const token of testTokens) {
    try {
      console.log(`\n📍 Testing ${token}...`);
      const result = await resolver.resolveTokenAddress(token);

      if (result.found && result.token) {
        console.log(`✅ ${token}: ${result.token.address}`);
        console.log(`   Name: ${result.token.name}`);
        console.log(`   Decimals: ${result.token.decimals}`);
        console.log(`   Confidence: ${result.token.confidence}%`);
        console.log(`   Valid: ${result.token.isValid}`);
      } else {
        console.log(`❌ ${token}: ${result.reason}`);
      }

    } catch (error) {
      console.error(`🚨 Error testing ${token}:`, error.message);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🔍 Testing batch resolution:');
  console.log('=============================');

  try {
    const batchResults = await resolver.resolveMultipleTokens(['USDC', 'WETH', 'NONEXISTENT']);

    for (const [symbol, result] of batchResults.entries()) {
      if (result.found) {
        console.log(`✅ ${symbol}: ${result.token?.address} (${result.token?.confidence}%)`);
      } else {
        console.log(`❌ ${symbol}: ${result.reason}`);
      }
    }

  } catch (error) {
    console.error('🚨 Batch test error:', error.message);
  }

  console.log('\n📊 Cache statistics:');
  console.log('====================');
  const stats = resolver.getCacheStats();
  console.log(`Cache size: ${stats.size} entries`);
  console.log(`Cached tokens: ${stats.entries.join(', ')}`);

  console.log('\n✅ Token resolver test complete!');
}

testTokenResolver().catch(console.error);