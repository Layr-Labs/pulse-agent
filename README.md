# 🤖 Crypto Trading Agent Powered by AgentKit

This is an AI-powered cryptocurrency trading agent that monitors Twitter/X influencers and automatically trades tokens based on positive sentiment analysis. Built with [Next.js](https://nextjs.org) and [AgentKit](https://github.com/coinbase/agentkit).

## 🚀 Features

- **🐦 Twitter Monitoring**: Real-time monitoring of 10 hardcoded crypto influencers
- **🧠 Sentiment Analysis**: Advanced sentiment analysis to detect positive token mentions
- **⚡ Automated Trading**: Automatically buys tokens when positive sentiment is detected
- **⏰ 24-Hour Hold Strategy**: Holds positions for exactly 24 hours before selling
- **📊 Position Tracking**: Real-time dashboard showing current positions and performance
- **🔒 Secure Wallet Integration**: Uses Coinbase Developer Platform for secure transactions

## 📦 Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
```

3. **Configure your credentials in `.env`:**

### Required Environment Variables

```env
# OpenAI API Key (for AI processing)
OPENAI_API_KEY=your_openai_api_key_here

# Coinbase Developer Platform credentials
CDP_API_KEY_ID=your_cdp_api_key_id
CDP_API_KEY_SECRET=your_cdp_api_key_secret
CDP_WALLET_SECRET=your_cdp_wallet_secret

# Twitter/X API credentials (Bearer Token)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token_here

# Network configuration
NETWORK_ID=base-sepolia  # or base-mainnet for production
```

### 🔑 Getting Your API Keys

#### Twitter/X API Setup
1. Visit [developer.x.com](https://developer.x.com)
2. Apply for a Developer account
3. Create a new App in a Project
4. Generate a Bearer Token
5. **Note**: You need at least Basic tier access for streaming (not free)

#### Coinbase Developer Platform
1. Visit [CDP Portal](https://portal.cdp.coinbase.com/)
2. Create a new project
3. Generate API keys
4. Fund your wallet with test/real crypto

#### OpenAI API
1. Visit [platform.openai.com](https://platform.openai.com)
2. Create an API key

## 🚀 Usage

1. **Start the development server:**
```bash
npm run dev
```

2. **Open [http://localhost:3000](http://localhost:3000)** in your browser

3. **Start the trading agent** using the UI controls or manually:
```bash
curl -X POST http://localhost:3000/api/trading/start
```

4. **Monitor positions** in the dashboard or via API:
```bash
curl http://localhost:3000/api/trading/status
```

## 🎯 How It Works

### 1. Influencer Monitoring
The agent monitors tweets from these 10 crypto influencers:
- @VitalikButerin (Ethereum founder)
- @elonmusk (Tesla/SpaceX CEO)
- @aantonop (Bitcoin educator)
- @novogratz (Galaxy Digital CEO)
- @APompliano (Crypto investor)
- And 5 more...

### 2. Sentiment Analysis
- Analyzes tweet content for positive crypto sentiment
- Looks for keywords like "bullish", "moon", "buy", "gem", etc.
- Filters out negative signals like "sell", "dump", "scam"

### 3. Token Detection
- Extracts token mentions from tweets ($BTC, #ethereum, etc.)
- Supports major cryptocurrencies
- Maps symbols to contract addresses

### 4. Automated Trading
- Executes buy orders when positive sentiment + token mention is detected
- Uses a percentage of wallet balance (max $100 per trade)
- Records all positions in SQLite database

### 5. 24-Hour Hold Strategy
- Automatically sells positions after exactly 24 hours
- Calculates profit/loss
- Updates position status in database


## ⚙️ Configuration

### Trading Parameters
Edit `config/trading.ts` to customize:

```typescript
export const TRADING_CONFIG = {
  // Maximum USD amount per trade
  maxTradeAmountUSD: 100,

  // Hold duration before selling
  holdDurationHours: 24,

  // Sentiment analysis threshold
  positiveThreshold: 0.1,

  // Influencers to monitor (add/remove as needed)
  influencers: [
    'VitalikButerin',
    'elonmusk',
    // ... add more
  ]
};
```

### Adding More Influencers
1. Open `config/trading.ts`
2. Add Twitter usernames to the `influencers` array
3. Restart the agent

### Customizing Token Detection
Edit `lib/sentiment.ts` to add support for new tokens:

```typescript
// Add to token mapping in lib/trading.ts
const addresses: Record<string, string> = {
  'NEWTOKEN': '0x...',  // Add contract address
  // ...
};
```

## 🛠️ API Endpoints

- `POST /api/trading/start` - Start the trading agent
- `POST /api/trading/stop` - Stop the trading agent
- `GET /api/trading/status` - Get current status and positions
- `POST /api/agent` - Chat with the AgentKit (original functionality)

## 🗃️ Database Schema

The agent uses SQLite to track:

### Positions Table
- `id` - Unique position identifier
- `token` - Token symbol (BTC, ETH, etc.)
- `amount` - Amount traded in ETH
- `purchase_price` - Price when bought
- `purchase_time` - Timestamp of purchase
- `sell_time` - Timestamp of sale (if sold)
- `sell_price` - Price when sold
- `profit` - Calculated profit/loss
- `tweet` - Original tweet content
- `influencer` - Influencer who posted
- `status` - holding/sold/failed

### Processed Tweets Table
- `tweet_id` - Twitter tweet ID
- `processed_at` - Timestamp processed

## ⚠️ Important Warnings

### Financial Risk
- **This is experimental software for educational purposes**
- **Never use with more money than you can afford to lose**
- **Cryptocurrency trading is extremely risky**
- **Past performance does not guarantee future results**
- **The bot may make losses**

### API Costs
- Twitter API Basic tier costs money (not free)
- OpenAI API usage incurs costs
- Gas fees for blockchain transactions

### Testing
- **Always test on testnets first (base-sepolia)**
- **Use small amounts initially**
- **Monitor the bot closely when running**

## 🐛 Troubleshooting

### Common Issues

**"Twitter stream error"**
- Check your Bearer Token is valid
- Ensure you have proper API access level
- Twitter API has rate limits

**"Failed to initialize agent"**
- Verify all environment variables are set
- Check CDP API credentials are correct
- Ensure wallet has sufficient balance

**"Token address not found"**
- Token may not be supported yet
- Add token address mapping in `lib/trading.ts`

### Debug Mode
Enable detailed logging by adding to `.env`:
```
NODE_ENV=development
```

## 📊 Monitoring

### Logs
- All trades are logged to console
- Database stores all positions
- Check browser console for errors

### Files Created
- `trading.db` - SQLite database
- `wallet_data.txt` - Wallet information (keep secure!)

## 🚀 Deployment

For production deployment:

1. Use `base-mainnet` network
2. Set strong environment variables
3. Use production API keys
4. Monitor resource usage
5. Set up proper logging
6. Consider using PostgreSQL instead of SQLite

---

## 📚 Learn More

- [AgentKit Documentation](https://docs.cdp.coinbase.com/agentkit/docs/welcome)
- [Coinbase Developer Platform](https://docs.cdp.coinbase.com/)
- [Twitter API v2 Docs](https://developer.x.com/en/docs/twitter-api)
- [Next.js Documentation](https://nextjs.org/docs)

## 🤝 Contributing

This project is built on top of AgentKit. For contributions:

- Fork this repository
- Make your changes
- Test thoroughly
- Submit a pull request

For AgentKit contributions:
- [AgentKit Contributing Guide](https://github.com/coinbase/agentkit/blob/main/CONTRIBUTING.md)
- [Join Discord](https://discord.gg/CDP)

## 📄 License

This project is for educational purposes. Please ensure you comply with:
- Twitter API Terms of Service
- OpenAI API Terms
- Coinbase Developer Platform Terms
- Local financial regulations
