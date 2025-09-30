# Pulse 

> Social Sentient Analysis Crypto Trading Agent Powered by EigenAI and AgentKit

This is an AI-powered crypto trading agent that monitors Twitter/X influencers and automatically trades tokens based on positive sentiment analysis. Built with [Next.js](https://nextjs.org), [EigenAI](https://docs.eigencloud.xyz/products/eigenai/eigenai-overview), [AgentKit](https://github.com/coinbase/agentkit) and deployable on [EigenCompute](https://docs.eigencloud.xyz/products/eigencompute/eigencompute-overview)

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
# EigenAI API Key (for AI processing)
EIGENAI_API_KEY=your_openai_api_key_here

# Perplexity API key for web-based token address verification
PERPLEXITY_API_KEY=your_perplexity_api_key_here

# Coinbase Developer Platform credentials
CDP_API_KEY_ID=your_cdp_api_key_id
CDP_API_KEY_SECRET=your_cdp_api_key_secret
CDP_WALLET_SECRET=your_cdp_wallet_secret

# Twitter API Key (Twitterapi.io service)
TWITTER_API_KEY=your_twitter_api_key_here

# RPC URLs for different networks (optional - uses CDP defaults if not set)
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_TESTNET_RPC_URL=https://sepolia.base.org
ETHEREUM_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
ETHEREUM_TESTNET_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Trading configuration
TWEET_MAX_AGE_HOURS=6
```

### 🔑 Getting Your API Keys

#### Twitter/X API Setup
Visit [twitterapi.io](https://twitterapi.io)

#### Coinbase Developer Platform
1. Visit [CDP Portal](https://portal.cdp.coinbase.com/)
2. Create a new project
3. Generate API keys
4. Fund your wallet with test/real crypto

#### EigenAI API key
1. Visit [EigenAI](https://docs.eigencloud.xyz/products/eigenai/eigenai-overview)
2. Request access

#### EigenCompute Access
1. Visit [EigenCompute](https://docs.eigencloud.xyz/products/eigencompute/eigencompute-overview)
2. Request access

#### Perplexity API key
1. Visit [perplexity.ai/account](https://www.perplexity.ai/account/api/keys)
2. Create or log in to account and create API key

## Docker

Build the image and run the dev server inside a container.

```bash
# Build
docker build -t pulse-agent:dev .

# Run (exposes http://localhost:3000)
docker run --rm -p 3000:3000 --env-file .env pulse-agent:dev

# Hot-reload (mount local code into the container)
docker run --rm -it \
  -p 3000:3000 \
  --env-file .env \
  -v "$PWD":/app \
  pulse-agent:dev
```

Notes:
- The image starts with `npm run dev` (Next.js dev server). The script removes `trading.db` on start.
- Do not bake secrets into images; pass via `--env-file` or `-e`.

## Deployment to EigenCompute (Verifiable Agent Runtime)
Make sure to:
1. have the EigenX CLI installed in order to deploy your application to EigenCompute.
2. you're logged into Docker
3. have generated and stored your private key
  - `eigenx auth generate --store`


Given you have a `.env` file and a Dockerfile, executing the following:

```bash
eigenx app deploy
```

should instruct you with building a Docker image or using a pre-existing one, then proceeding with the deployment as shown below:

```
Found Dockerfile in current directory.
? Choose deployment method:  [Use arrows to move, type to filter]
> Build and deploy from Dockerfile
  Deploy existing image from registry

? Enter image reference: [? for help] <image name>

App name selection:
? Enter app name: [? for help] (pulse-agent)

? Do you want to view your app's logs?  [Use arrows to move, type to filter]
> Yes, but only viewable by me
  Yes, publicly viewable by anyone
  No, disable logs entirely

Building base image from Dockerfile...
#0 building with "desktop-linux" instance using docker driver
...
...
Your container will deploy with the following environment variables:

No public variables found

-----------------------------------------

PRIVATE VARIABLE          VALUE
----------------          -----
TWITTER_API_KEY           <key>
BASE_TESTNET_RPC_URL      <url>
EIGENAI_API_KEY           <key>
CDP_WALLET_SECRET         <secret>
NETWORK_ENV               testnet
ETHEREUM_MAINNET_RPC_URL  <url>
PERPLEXITY_API_KEY        <key>
CDP_API_KEY_ID            <id>
CDP_API_KEY_SECRET        <secret>
ETHEREUM_TESTNET_RPC_URL  <url>
IDEMPOTENCY_KEY           your_unique_idempotency_key
BASE_MAINNET_RPC_URL      <url>
TWEET_MAX_AGE_HOURS       6

? Is this categorization correct? Public variables will be in plaintext onchain. Private variables will be encrypted onchain. (y/N) y

Deploying new app...
App saved with name: pulse-agent

App Name: pulse-agent
App ID: <id>
Latest Release Time: <time>
Status: Deploying
IP: No IP assigned
EVM Address: <address>
Solana Address: <address>

# Wait several seconds for deployment

$ eigenx app info pulse-agent

App Name: pulse-agent
App ID: <id>
Latest Release Time: <time>
Status: Running
IP: <ip>
EVM Address: <address>
Solana Address: <address>
```

**Congrats your agent is now running on EigenCompute!**



## 🚀 Usage

1. Configure your influncer list at `config/trading.ts`.

2. **Start the development server:**
```bash
npm run dev
```

3. **Open [http://localhost:3000](http://localhost:3000)** in your browser

4. **Start the trading agent** using the UI controls or manually:
```bash
curl -X POST http://localhost:3000/api/trading/start
```

5. **Monitor positions** in the dashboard or via API:
```bash
curl http://localhost:3000/api/trading/status
```

## How It Works

### 1. Influencer Monitoring
The agent monitors tweets from your custom list of top crypto traders and influencers.

### 2. Sentiment Analysis
- Analyzes tweet content for positive crypto sentiment
- Looks for keywords like "bullish", "moon", "buy", "gem", etc.
- Filters out negative signals like "sell", "dump", "scam"

### 3. Token Detection
- Extracts token mentions from tweets ($BTC, #ethereum, etc.)
- Supports major cryptocurrencies
- Maps symbols to contract addresses and networks

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
    'blknoiz06',
    'trading_axe',
    'notthreadguy'
  ]
};
```

### Adding More Influencers
1. Open `config/trading.ts`
2. Add Twitter usernames to the `influencers` array
3. Restart the agent

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
