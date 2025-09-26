export const TRADING_CONFIG = {
  // Influencer handles to monitor (without @ symbol)
  influencers: [
    'blknoiz06',
    'jt_rose',
    'trading_axe',
    'notthreadguy'
  ],

  // Trading parameters
  holdDurationHours: 24,
  maxTradeAmountUSD: 30, // Maximum amount to spend per trade

  // Tweet processing window (how old tweets can be to process them)
  tweetMaxAgeHours: parseInt(process.env.TWEET_MAX_AGE_HOURS || '6'), // Default 6 hours

  // OpenAI sentiment analysis settings
  minimumConfidence: 70, // Minimum confidence % for bullish sentiment
  useOpenAISentiment: true, // Uses OpenAI instead of keyword matching

  // Multi-network trading settings
  hybrid: {
    // Base networks: Use Coinbase native trading (faster, cheaper)
    base: {
      enabled: true,
      method: 'coinbase-native', // Coinbase Smart Wallet createTrade()
      minTradeAmountETH: 0.001
    },
    // Ethereum networks: Use 1inch DEX aggregator
    ethereum: {
      enabled: true,
      method: 'uniswap-v3', // Uniswap V3 direct integration
      minTradeAmountETH: 0.001, // Reasonable minimum for small trades
      maxSlippage: 3, // 3% max slippage for DEX trades
      requiresPrivateKey: true, // Needs ETHEREUM_PRIVATE_KEY env var
      requiresWalletAddress: true // Needs ETHEREUM_WALLET_ADDRESS env var
    }
  }
};

export type TradingPosition = {
  id: string;
  token: string;
  amount: number;
  purchasePrice: number;
  purchaseTime: Date;
  sellTime?: Date;
  sellPrice?: number;
  profit?: number;
  tweet: string;
  influencer: string;
  status: 'holding' | 'sold' | 'failed';
};