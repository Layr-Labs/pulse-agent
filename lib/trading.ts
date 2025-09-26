import { database } from './database';
import { TradingPosition, TRADING_CONFIG } from '@/config/trading';
import { prepareAgentkitAndWalletProvider } from '@/app/api/agent/prepare-agentkit';
import { generateId } from 'ai';
import { tokenResolver } from './tokenResolver';
import { createUniswapTrader } from './uniswapTrading';
import { createSimpleSwapper } from './simpleSwap';
import { ToastService } from './toastService';

// Helper function to generate Etherscan/block explorer URLs
function getBlockExplorerUrl(txHash: string, networkId: string): string {
  const explorers: Record<string, string> = {
    'ethereum': 'https://etherscan.io/tx/',
    'base': 'https://basescan.org/tx/',
    'base-sepolia': 'https://sepolia.basescan.org/tx/',
    'sepolia': 'https://sepolia.etherscan.io/tx/',
    'mainnet': 'https://etherscan.io/tx/'
  };

  const baseUrl = explorers[networkId] || explorers['ethereum'];
  return `${baseUrl}${txHash}`;
}

// Helper function to map token symbols to Coinbase asset IDs
function getAssetIdForToken(tokenSymbol: string, tokenAddress: string): string {
  const symbolToAssetId: Record<string, string> = {
    'USDC': 'usdc',
    'ETH': 'eth',
    'WETH': 'weth',
    'DAI': 'dai',
    'USDT': 'usdt',
    'BTC': 'btc',
    'WBTC': 'wbtc',
    'UNI': 'uni',
    'LINK': 'link',
    'MATIC': 'matic',
    'AAVE': 'aave',
    'SOL': 'sol',
    'ADA': 'ada',
    'DOT': 'dot',
    'AVAX': 'avax',
    'EIGEN': 'eigen'
  };

  const assetId = symbolToAssetId[tokenSymbol.toUpperCase()];

  if (assetId) {
    return assetId;
  }

  // If no predefined mapping, use the token address
  // Coinbase SDK may accept contract addresses directly for less common tokens
  console.log(`🔍 [TRADE_EXEC] No predefined asset ID for ${tokenSymbol}, using address: ${tokenAddress}`);
  return tokenAddress.toLowerCase();
}

export interface TradeRequest {
  token: string;
  tweet: string;
  influencer: string;
  tweetId: string;
}

export async function executeTrade(request: TradeRequest): Promise<void> {
  console.log('🔍 [TRADE_EXEC] ===== STARTING TRADE EXECUTION =====');
  console.log('🔍 [TRADE_EXEC] Trade request:', {
    token: request.token,
    influencer: request.influencer,
    tweetId: request.tweetId,
    tweet: request.tweet.substring(0, 100) + '...'
  });

  try {
    console.log(`🔍 [TRADE_EXEC] Executing trade for ${request.token} based on tweet from ${request.influencer}`);

    // In testing mode, use 1 USDC equivalent trade
    if (process.env.TESTING === 'true') {
      console.log('🔍 [TRADE_EXEC] 🧪 TESTING MODE: Simulating trade');
      console.log('🔍 [TRADE_EXEC] Calling executeTestTrade...');
      await executeTestTrade(request);
      console.log('🔍 [TRADE_EXEC] ✅ Test trade completed');
      console.log('🔍 [TRADE_EXEC] ===== TRADE EXECUTION COMPLETE =====');
      return;
    }

    // Resolve token address dynamically across multiple networks
    console.log(`🔍 [TRADE_EXEC] Resolving token address for ${request.token} across available networks...`);
    const tokenResult = await tokenResolver.resolveTokenAddress(request.token);
    if (!tokenResult.found || !tokenResult.token) {
      console.log(`🔍 [TRADE_EXEC] ❌ Token ${request.token} not available on any configured network`);
      console.log(`🔍 [TRADE_EXEC] ❌ Reason: ${tokenResult.reason}`);
      console.log(`🔍 [TRADE_EXEC] ⏭️ Skipping trade - token not supported`);

      // Mark as processed but don't fail - just skip
      await database.markTweetAsProcessed(request.tweetId);
      return;
    }
    console.log(`🔍 [TRADE_EXEC] ✅ Resolved ${request.token} -> ${tokenResult.token.address} on ${tokenResult.token.network.name}`);

    // Initialize AgentKit for the specific network where the token was found
    console.log(`🔍 [TRADE_EXEC] Configuring AgentKit for ${tokenResult.token.network.name}...`);
    const { walletProvider } = await prepareAgentkitAndWalletProvider(tokenResult.token.network.id);

    // Get current wallet balance to determine trade amount
    const balance = await walletProvider.getBalance();

    // Handle both BigInt (wei) and decimal string formats
    let balanceETH: number;
    if (typeof balance === 'bigint') {
      // Balance is in wei, convert to ETH
      const { ethers } = await import('ethers');
      balanceETH = parseFloat(ethers.formatEther(balance));
    } else {
      // Balance is already in ETH decimal format
      balanceETH = parseFloat(balance.toString());
    }

    console.log(`🔍 [TRADE_EXEC] Current wallet balance: ${balance} -> ${balanceETH} ETH`);

    // Get wallet address for debugging
    try {
      const walletAddress = await walletProvider.getAddress();
      console.log(`🔍 [TRADE_EXEC] Wallet address: ${walletAddress}`);
      console.log(`🔍 [TRADE_EXEC] Network: ${tokenResult.token.network.name} (${tokenResult.token.network.chainType})`);

      // Show if this is different from Base wallet
      if (tokenResult.token.network.chainType === 'ethereum') {
        console.log(`🔍 [TRADE_EXEC] Note: This is a different wallet from your Base Smart Wallet for Ethereum trading`);
      }
    } catch (error) {
      console.log(`🔍 [TRADE_EXEC] Could not get wallet address:`, error instanceof Error ? error.message : String(error));
    }

    // Get network-specific configuration
    const networkType = tokenResult.token.network.chainType;
    const networkConfig = TRADING_CONFIG.hybrid[networkType as 'base' | 'ethereum'];

    if (!networkConfig || !networkConfig.enabled) {
      console.log(`🔍 [TRADE_EXEC] ❌ Trading disabled for ${networkType} networks`);
      await database.markTweetAsProcessed(request.tweetId);
      return;
    }

    // Calculate trade amount (use 10% of available balance, but respect minimum requirements)
    const preferredTradeAmountETH = balanceETH * 0.10; // 10% of balance
    const minRequired = networkConfig.minTradeAmountETH;

    console.log(`🔍 [TRADE_EXEC] Preferred trade amount (10% of ${balanceETH} ETH): ${preferredTradeAmountETH} ETH`);
    console.log(`🔍 [TRADE_EXEC] Minimum required for ${networkType}: ${minRequired} ETH`);
    console.log(`🔍 [TRADE_EXEC] Trading method: ${networkConfig.method}`);

    // Check if we have enough balance for the minimum trade
    if (balanceETH < minRequired) {
      console.log(`🔍 [TRADE_EXEC] ❌ Insufficient balance: ${balanceETH} ETH available, need at least ${minRequired} ETH for ${networkType} trade`);
      console.log(`🔍 [TRADE_EXEC] ❌ Network: ${tokenResult.token.network.name} (${tokenResult.token.network.id})`);

      // Mark as processed but don't fail - just skip
      await database.markTweetAsProcessed(request.tweetId);
      console.log(`🔍 [TRADE_EXEC] ⏭️ Skipping trade due to insufficient balance, marked tweet as processed`);
      return;
    }

    // Additional check for DEX trades - need minimum $5 worth for liquidity
    if (networkType === 'ethereum') {
      const dexMinimum = 0.0015; // ~$5 at $3500 ETH - higher minimum for better success rate
      if (balanceETH < dexMinimum) {
        console.log(`🔍 [TRADE_EXEC] ❌ Balance too low for DEX trade: ${balanceETH} ETH available, need at least ${dexMinimum} ETH for reliable Uniswap swaps`);
        await database.markTweetAsProcessed(request.tweetId);
        console.log(`🔍 [TRADE_EXEC] ⏭️ Skipping DEX trade due to minimum liquidity requirements`);
        return;
      }
    }

    // Use the larger of 10% of balance or minimum required
    let tradeAmountETH = Math.max(preferredTradeAmountETH, minRequired);

    // For DEX trades, ensure we meet the minimum liquidity requirement
    if (networkType === 'ethereum') {
      const dexMinimum = 0.0015; // ~$5 at $3500 ETH - higher minimum for better success rate
      tradeAmountETH = Math.max(tradeAmountETH, dexMinimum);
    }

    console.log(`🔍 [TRADE_EXEC] Final trade amount: ${tradeAmountETH} ETH (${networkType === 'ethereum' && tradeAmountETH === 0.0015 ? 'using DEX minimum' : tradeAmountETH === minRequired ? 'using minimum' : 'using 10% of balance'})`);

    // Create trade position record
    const position: TradingPosition = {
      id: generateId(),
      token: request.token,
      amount: tradeAmountETH,
      purchasePrice: 0, // Will be updated after trade
      purchaseTime: new Date(),
      tweet: request.tweet,
      influencer: request.influencer,
      status: 'holding'
    };

    try {
      console.log(`🔍 [TRADE_EXEC] Executing real trade: ${request.token} with ${tradeAmountETH} ETH`);

      // Get current token price
      const tokenPrice = await getTokenPrice(request.token);
      position.purchasePrice = tokenPrice;

      console.log(`🔍 [TRADE_EXEC] Token price: $${tokenPrice}`);

      // Execute real trade using AgentKit
      // For ETH -> Token swap, we'll use AgentKit's trading capabilities
      console.log(`🔍 [TRADE_EXEC] Initiating swap via AgentKit...`);

      // Add toast notification for trade initiation
      ToastService.addInfoToast(
        `Executing Trade`,
        `Buying ${request.token} with ${tradeAmountETH.toFixed(4)} ETH...`,
        {
          token: request.token,
          amount: tradeAmountETH.toFixed(4),
          influencer: request.influencer,
          price: tokenPrice.toString()
        }
      );

      // Use hybrid trading approach based on network type
      if (tokenResult.token.network.chainType === 'base') {
        // Base networks: Use Coinbase native trading
        await executeBaseNetworkTrade(walletProvider, request, tokenResult, tradeAmountETH, position);
      } else if (tokenResult.token.network.chainType === 'ethereum') {
        // Ethereum networks: Use AgentKit CDP API swap
        await executeEthereumNetworkTrade(walletProvider, request, tokenResult, tradeAmountETH, position);
      } else {
        throw new Error(`Unsupported network type: ${tokenResult.token.network.chainType}`);
      }

    } catch (tradeError) {
      console.error('Trade execution failed:', tradeError);
      position.status = 'failed';
      await database.savePosition(position);

      // Add error toast notification
      ToastService.addErrorToast(
        `Trade Failed`,
        `Failed to buy ${request.token}: ${tradeError instanceof Error ? tradeError.message : 'Unknown error'}`,
        {
          token: request.token,
          influencer: request.influencer
        }
      );

      throw tradeError;
    }

  } catch (error) {
    console.error('Error in executeTrade:', error);
    throw error;
  }
}

export async function executeSell(position: TradingPosition): Promise<void> {
  try {
    console.log(`Executing sell for position ${position.id} (${position.token})`);

    // Get current token price
    const currentPrice = await getTokenPrice(position.token);
    const profit = (currentPrice - position.purchasePrice) * position.amount;

    console.log(`Selling ${position.token}: Buy: $${position.purchasePrice}, Sell: $${currentPrice}, Profit: $${profit.toFixed(2)}`);

    // Add toast notification for sell
    ToastService.addTradeSellToast({
      token: position.token,
      amount: position.amount.toFixed(4),
      profit: profit.toFixed(2),
      price: currentPrice.toString()
    });

    // In a real implementation, execute the sell order here
    // For now, we'll simulate it

    // Update position in database
    await database.updatePosition(position.id, {
      sellTime: new Date(),
      sellPrice: currentPrice,
      profit: profit,
      status: 'sold'
    });

    console.log(`Sell executed successfully for position ${position.id}`);

  } catch (error) {
    console.error('Error in executeSell:', error);
    // Mark position as failed
    await database.updatePosition(position.id, {
      status: 'failed'
    });
    throw error;
  }
}


// Execute a test trade with 1 USDC equivalent
async function executeTestTrade(request: TradeRequest): Promise<void> {
  console.log('🔍 [TEST_TRADE] ===== STARTING TEST TRADE =====');
  console.log('🔍 [TEST_TRADE] Request details:', {
    token: request.token,
    influencer: request.influencer,
    tweetId: request.tweetId
  });

  try {
    console.log(`🔍 [TEST_TRADE] 🧪 Simulating purchase of ${request.token} with 1 USDC`);

    // Get simulated token price
    console.log('🔍 [TEST_TRADE] Getting token price...');
    const tokenPrice = await getTokenPrice(request.token);
    console.log(`🔍 [TEST_TRADE] Token price: $${tokenPrice}`);

    const usdcAmount = 1; // 1 USDC
    const tokenAmount = usdcAmount / tokenPrice; // Calculate how many tokens we get
    console.log(`🔍 [TEST_TRADE] Calculated token amount: ${tokenAmount.toFixed(6)} ${request.token}`);

    // Create test position
    const testPosition: TradingPosition = {
      id: generateId(),
      token: request.token,
      amount: tokenAmount,
      purchasePrice: tokenPrice,
      purchaseTime: new Date(),
      tweet: request.tweet,
      influencer: request.influencer,
      status: 'holding'
    };

    console.log('🔍 [TEST_TRADE] Created position:', {
      id: testPosition.id,
      token: testPosition.token,
      amount: testPosition.amount,
      price: testPosition.purchasePrice,
      status: testPosition.status
    });

    // Save position to database
    console.log('🔍 [TEST_TRADE] Saving position to database...');
    await database.savePosition(testPosition);
    console.log('🔍 [TEST_TRADE] Position saved successfully');

    // Generate a mock transaction hash for test trades
    const mockTxHash = `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`;
    const explorerUrl = getBlockExplorerUrl(mockTxHash, 'base'); // Default to base for test trades

    console.log(`🔍 [TEST_TRADE] ✅ Test trade executed successfully: ${testPosition.id}`);
    console.log(`🔍 [TEST_TRADE]    Bought: ${tokenAmount.toFixed(6)} ${request.token}`);
    console.log(`🔍 [TEST_TRADE]    Price: $${tokenPrice} per ${request.token}`);
    console.log(`🔍 [TEST_TRADE]    Total cost: $${usdcAmount} USDC`);
    console.log(`🔍 [TEST_TRADE]    Status: ${testPosition.status}`);
    console.log(`🔍 [TEST_TRADE]    Transaction: ${mockTxHash}`);
    console.log(`🔍 [TEST_TRADE]    View on BaseScan: ${explorerUrl}`);

    // Add toast notification for test trade
    ToastService.addTradeBuyToast({
      token: request.token,
      amount: `${tokenAmount.toFixed(6)} (test)`,
      influencer: request.influencer,
      price: tokenPrice.toString(),
      txHash: mockTxHash,
      explorerUrl: explorerUrl
    });

    console.log('🔍 [TEST_TRADE] ===== TEST TRADE COMPLETE =====');

  } catch (error) {
    console.error('❌ [TEST_TRADE] Error executing test trade:', error);
    console.log('🔍 [TEST_TRADE] ===== TEST TRADE FAILED =====');
    throw error;
  }
}

// Execute trade on Base networks using Coinbase native trading
async function executeBaseNetworkTrade(walletProvider: any, request: TradeRequest, tokenResult: any, tradeAmountETH: number, position: any): Promise<void> {
  try {
    console.log(`🔍 [TRADE_EXEC] Executing Base network trade: ${tradeAmountETH} ETH -> ${request.token}`);
    console.log(`🔍 [TRADE_EXEC] Target token: ${tokenResult.token.address} on ${tokenResult.token.network.name}`);

    // Check if we're on a Base network
    if (!tokenResult.token.network.id.includes('base')) {
      throw new Error(`Expected Base network, got: ${tokenResult.token.network.name}`);
    }

    // Map token symbol to Coinbase asset ID
    const toAssetId = getAssetIdForToken(request.token, tokenResult.token.address);

    console.log(`🔍 [TRADE_EXEC] Creating Coinbase trade: ${tradeAmountETH} ETH -> ${request.token} (${toAssetId})`);

    // Access the underlying Coinbase wallet through AgentKit's wallet provider
    const wallet = (walletProvider as any).wallet || walletProvider;

    if (!wallet.createTrade) {
      throw new Error('Coinbase wallet trading functionality not available. Ensure you are using CdpSmartWalletProvider on Base network.');
    }

    // Create the trade using Coinbase's native trading
    const trade = await wallet.createTrade({
      amount: tradeAmountETH,
      fromAssetId: 'eth', // ETH asset ID
      toAssetId: toAssetId
    });

    console.log(`🔍 [TRADE_EXEC] Trade created: ${trade.getId()}`);
    console.log(`🔍 [TRADE_EXEC] Waiting for trade to settle...`);

    // Wait for the trade to complete
    await trade.wait();

    // Get transaction details
    const txHash = trade.getTransaction()?.transactionHash;
    const explorerUrl = txHash ? getBlockExplorerUrl(txHash, tokenResult.token.network.id) : null;

    console.log(`🔍 [TRADE_EXEC] ✅ Base trade executed successfully: ${position.id}`);
    if (txHash) {
      console.log(`🔍 [TRADE_EXEC] Transaction hash: ${txHash}`);
      console.log(`🔍 [TRADE_EXEC] View on explorer: ${explorerUrl}`);
    }

    // Add success toast notification
    ToastService.addTradeBuyToast({
      token: request.token,
      amount: tradeAmountETH.toFixed(4),
      influencer: request.influencer,
      price: position.purchasePrice.toString(),
      txHash: txHash || undefined,
      explorerUrl: explorerUrl || undefined
    });

    // Save position to database
    await database.savePosition(position);

  } catch (error) {
    console.error(`🔍 [TRADE_EXEC] ❌ Base network trade failed:`, error);
    throw error;
  }
}

// Execute trade on Ethereum networks using Uniswap DEX
async function executeEthereumNetworkTrade(walletProvider: any, request: TradeRequest, tokenResult: any, tradeAmountETH: number, position: any): Promise<void> {
  try {
    console.log(`🔍 [TRADE_EXEC] Executing Ethereum DEX trade: ${tradeAmountETH} ETH -> ${request.token}`);
    console.log(`🔍 [TRADE_EXEC] Target token: ${tokenResult.token.address} on ${tokenResult.token.network.name}`);

    // Check if we're on an Ethereum network
    if (tokenResult.token.network.chainType !== 'ethereum') {
      throw new Error(`Expected Ethereum network, got: ${tokenResult.token.network.chainType}`);
    }

    // Get network configuration
    const networkConfig = TRADING_CONFIG.hybrid.ethereum;
    if (!networkConfig.enabled) {
      throw new Error('Ethereum trading is disabled in configuration');
    }

    // Validate we have required environment variables for Ethereum trading
    const rpcUrl = tokenResult.token.network.id === 'ethereum-mainnet'
      ? process.env.ETHEREUM_MAINNET_RPC_URL
      : process.env.ETHEREUM_TESTNET_RPC_URL;

    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for ${tokenResult.token.network.id}`);
    }

    // Get private key for Ethereum wallet (different from Coinbase wallet)
    const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETHEREUM_PRIVATE_KEY environment variable required for DEX trading');
    }

    console.log(`🔍 [TRADE_EXEC] Initializing Uniswap V3 trader for ${tokenResult.token.network.name}...`);

    // Create Uniswap trader instance
    const uniswapTrader = await createUniswapTrader(rpcUrl, privateKey);

    // Get wallet address
    const walletAddress = process.env.ETHEREUM_WALLET_ADDRESS;
    if (!walletAddress) {
      throw new Error('ETHEREUM_WALLET_ADDRESS environment variable required for DEX trading');
    }

    console.log(`🔍 [TRADE_EXEC] Trading on ${tokenResult.token.network.name}`);
    console.log(`🔍 [TRADE_EXEC] Wallet: ${walletAddress}`);
    console.log(`🔍 [TRADE_EXEC] Amount: ${tradeAmountETH} ETH`);
    console.log(`🔍 [TRADE_EXEC] Target: ${request.token} (${tokenResult.token.address})`);

    // Check ETH balance
    const ethBalance = await uniswapTrader.getEthBalance();
    console.log(`🔍 [TRADE_EXEC] Current ETH balance: ${ethBalance} ETH`);

    if (parseFloat(ethBalance) < tradeAmountETH) {
      throw new Error(`Insufficient ETH balance: ${ethBalance} ETH available, need ${tradeAmountETH} ETH`);
    }

    // Use the calculated trade amount (10% of balance)
    console.log(`🔍 [TRADE_EXEC] Executing dynamic trade: ${tradeAmountETH} ETH -> ${request.token}`);
    let swapResult = await uniswapTrader.swapEthForToken(
      tokenResult.token.address,
      tradeAmountETH.toString(),
      networkConfig.maxSlippage
    );

    // If V3 fails, try V2 router as fallback
    if (!swapResult.success) {
      console.log(`🔍 [TRADE_EXEC] Uniswap V3 failed: ${swapResult.error}`);
      console.log(`🔍 [TRADE_EXEC] Trying Uniswap V2 router as fallback...`);

      const v3Error = swapResult.error;

      try {
        const simpleSwapper = await createSimpleSwapper(rpcUrl, privateKey);
        swapResult = await simpleSwapper.swapEthForToken(
          tokenResult.token.address,
          tradeAmountETH.toString(),
          networkConfig.maxSlippage
        );

        if (swapResult.success) {
          console.log(`🔍 [TRADE_EXEC] ✅ Uniswap V2 fallback succeeded!`);
        } else {
          console.log(`🔍 [TRADE_EXEC] ❌ Both V3 and V2 failed:`);
          console.log(`🔍 [TRADE_EXEC]   V3 Error: ${v3Error}`);
          console.log(`🔍 [TRADE_EXEC]   V2 Error: ${swapResult.error}`);
        }
      } catch (fallbackError) {
        console.log(`🔍 [TRADE_EXEC] ❌ Uniswap V2 fallback also failed:`, fallbackError);
        console.log(`🔍 [TRADE_EXEC] ❌ V3 Error was: ${v3Error}`);
        console.log(`🔍 [TRADE_EXEC] ❌ V2 Error was: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }

    if (!swapResult.success) {
      throw new Error(`DEX swap failed: ${swapResult.error}`);
    }

    console.log(`🔍 [TRADE_EXEC] ✅ Ethereum DEX trade executed successfully!`);
    console.log(`🔍 [TRADE_EXEC] Transaction hash: ${swapResult.transactionHash}`);

    if (swapResult.toTokenAmount) {
      console.log(`🔍 [TRADE_EXEC] Amount received: ${swapResult.toTokenAmount} ${request.token}`);
    }

    const explorerUrl = swapResult.transactionHash
      ? getBlockExplorerUrl(swapResult.transactionHash, tokenResult.token.network.id)
      : null;

    if (explorerUrl) {
      console.log(`🔍 [TRADE_EXEC] View on explorer: ${explorerUrl}`);
    }

    // Add success toast notification
    ToastService.addTradeBuyToast({
      token: request.token,
      amount: tradeAmountETH.toFixed(4),
      influencer: request.influencer,
      price: position.purchasePrice.toString(),
      txHash: swapResult.transactionHash || undefined,
      explorerUrl: explorerUrl || undefined
    });

    // Save position to database
    await database.savePosition(position);

  } catch (error) {
    console.error(`🔍 [TRADE_EXEC] ❌ Ethereum DEX trade failed:`, error);

    // Log detailed error information
    console.log(`🔍 [TRADE_EXEC] Error details:`, {
      errorMessage: error instanceof Error ? error.message : String(error),
      tokenSymbol: request.token,
      tokenAddress: tokenResult.token.address,
      networkId: tokenResult.token.network.id,
      tradeAmount: tradeAmountETH
    });

    throw error;
  }
}

// Simulated token price function (replace with real price feed)
async function getTokenPrice(tokenSymbol: string): Promise<number> {
  console.log(`🔍 [PRICE] Getting price for ${tokenSymbol}...`);

  // In a real implementation, you would fetch from a price API like CoinGecko
  const mockPrices: Record<string, number> = {
    'ETH': 2500,
    'SOL': 100,
    'ADA': 0.45,
    'DOT': 7.2,
    'LINK': 15,
    'UNI': 6.5,
    'AAVE': 95,
    'MATIC': 0.85,
    'AVAX': 37,
    'EIGEN': 3.85
  };

  const price = mockPrices[tokenSymbol.toUpperCase()] || 1;
  console.log(`🔍 [PRICE] Price for ${tokenSymbol}: $${price}`);

  return price;
}