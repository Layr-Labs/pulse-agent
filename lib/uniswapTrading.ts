import { ethers } from 'ethers';
import { createGasManager, GasManager } from './gasManager';

// Uniswap V3 Router contract address
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNISWAP_V3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// Uniswap V3 Router ABI (minimal for exactInputSingle)
const ROUTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
          { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
        ],
        "internalType": "struct ISwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Uniswap V3 Quoter ABI
const QUOTER_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "tokenIn", "type": "address" },
      { "internalType": "address", "name": "tokenOut", "type": "address" },
      { "internalType": "uint24", "name": "fee", "type": "uint24" },
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
    ],
    "name": "quoteExactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export interface UniswapTradeParams {
  fromToken: string;
  toToken: string;
  amount: string; // Amount in wei
  recipient: string;
  slippage: number; // Slippage percentage (1-50)
}

export interface UniswapTradeResult {
  success: boolean;
  transactionHash?: string;
  tokenAmount?: string;
  toTokenAmount?: string;
  error?: string;
}

export class UniswapTrader {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private router: ethers.Contract;
  private quoter: ethers.Contract;
  private gasManager: GasManager;

  constructor(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
    this.router = new ethers.Contract(UNISWAP_V3_ROUTER, ROUTER_ABI, signer);
    this.quoter = new ethers.Contract(UNISWAP_V3_QUOTER, QUOTER_ABI, provider);

    // Initialize gas manager with network detection
    this.gasManager = createGasManager(provider, 1); // Default to mainnet, will update in init
    this.initializeNetwork();
  }

  private async initializeNetwork(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);
      this.gasManager = createGasManager(this.provider, chainId);
      console.log(`🔄 [UNISWAP] Initialized for chain ID: ${chainId}`);
    } catch (error) {
      console.warn(`🔄 [UNISWAP] Failed to detect network, using mainnet defaults:`, error);
    }
  }

  /**
   * Get quote from Uniswap V3 Quoter
   */
  private async getQuote(tokenIn: string, tokenOut: string, fee: number, amountIn: bigint): Promise<bigint> {
    try {
      console.log(`🔄 [UNISWAP] Getting quote: ${ethers.formatEther(amountIn)} ETH -> ${tokenOut} (fee: ${fee / 10000}%)`);

      const amountOut = await this.quoter.quoteExactInputSingle.staticCall(
        tokenIn,
        tokenOut,
        fee,
        amountIn,
        0 // sqrtPriceLimitX96 (0 = no limit)
      );

      console.log(`🔄 [UNISWAP] Quote result: ${amountOut.toString()}`);
      return amountOut;
    } catch (error) {
      console.log(`🔄 [UNISWAP] Quote failed for fee ${fee}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Find the best fee tier with liquidity and get quote
   */
  private async findBestFeeAndQuote(tokenAddress: string, ethAmountWei: bigint): Promise<{ fee: number; quote: bigint; amountOutMin: bigint }> {
    const feeTiers = [3000, 500, 10000]; // 0.3%, 0.05%, 1%

    for (const fee of feeTiers) {
      try {
        const quote = await this.getQuote(WETH_ADDRESS, tokenAddress, fee, ethAmountWei);

        // Calculate minimum amount out with 5% slippage (more conservative)
        const slippagePercent = 5;
        const amountOutMin = (quote * BigInt(100 - slippagePercent)) / BigInt(100);

        console.log(`🔄 [UNISWAP] Found working pool: ${fee / 10000}% fee`);
        console.log(`🔄 [UNISWAP] Expected output: ${quote.toString()}`);
        console.log(`🔄 [UNISWAP] Min output (${slippagePercent}% slippage): ${amountOutMin.toString()}`);

        return { fee, quote, amountOutMin };
      } catch (error) {
        console.log(`🔄 [UNISWAP] Fee tier ${fee / 10000}% not available`);
        continue;
      }
    }

    throw new Error(`No liquidity found for WETH -> ${tokenAddress} on any fee tier`);
  }

  /**
   * Calculate exact ETH needed for a target token amount (reverse quote)
   */
  private async calculateEthForTokenAmount(tokenAddress: string, targetTokenAmount: bigint): Promise<{ ethNeeded: bigint; fee: number }> {
    const feeTiers = [3000, 500, 10000];

    for (const fee of feeTiers) {
      try {
        console.log(`🔄 [UNISWAP] Calculating ETH needed for ${targetTokenAmount.toString()} tokens (fee: ${fee / 10000}%)`);

        // Use binary search to find the ETH amount needed
        let low = ethers.parseEther('0.001'); // 0.001 ETH
        let high = ethers.parseEther('0.1');   // 0.1 ETH
        let bestEthAmount = high;

        for (let i = 0; i < 20; i++) { // 20 iterations should be enough precision
          const mid = (low + high) / BigInt(2);

          try {
            const quote = await this.getQuote(WETH_ADDRESS, tokenAddress, fee, mid);

            if (quote >= targetTokenAmount) {
              bestEthAmount = mid;
              high = mid - BigInt(1);
            } else {
              low = mid + BigInt(1);
            }
          } catch (error) {
            low = mid + BigInt(1);
          }
        }

        console.log(`🔄 [UNISWAP] ETH needed: ${ethers.formatEther(bestEthAmount)} (fee: ${fee / 10000}%)`);
        return { ethNeeded: bestEthAmount, fee };

      } catch (error) {
        console.log(`🔄 [UNISWAP] Fee tier ${fee / 10000}% failed for reverse calculation`);
        continue;
      }
    }

    throw new Error(`Could not calculate ETH needed for ${targetTokenAmount.toString()} tokens`);
  }

  /**
   * Calculate safe trade amount considering gas costs
   */
  private async calculateSafeTradeAmount(
    tokenAddress: string,
    availableETH: bigint,
    targetTokenAmount?: bigint
  ): Promise<{ tradeAmount: bigint; fee: number; gasReserve: bigint }> {

    // Reasonable gas estimate for Uniswap V3 swap (typically 150k-200k)
    const estimatedGas = BigInt(200000); // Realistic gas estimate
    const gasConfig = await this.gasManager.getGasConfig(estimatedGas, 'standard'); // Use standard, not rapid
    const maxGasCost = gasConfig.gasLimit * (gasConfig.maxFeePerGas || gasConfig.gasPrice || BigInt(0));

    console.log(`🔄 [UNISWAP] Available ETH: ${ethers.formatEther(availableETH)}`);
    console.log(`🔄 [UNISWAP] Estimated gas cost: ${ethers.formatEther(maxGasCost)} (${ethers.formatUnits(gasConfig.maxFeePerGas || gasConfig.gasPrice || BigInt(0), 'gwei')} Gwei)`);

    const safeBuffer = ethers.parseEther('0.0002'); // Small 0.0002 ETH buffer (~$0.70)
    const totalReserve = maxGasCost + safeBuffer;

    if (availableETH <= totalReserve) {
      throw new Error(`Insufficient ETH. Need at least ${ethers.formatEther(totalReserve)} for gas + buffer`);
    }

    const maxTradeAmount = availableETH - totalReserve;

    if (targetTokenAmount) {
      // Calculate exact ETH needed for target token amount
      const { ethNeeded, fee } = await this.calculateEthForTokenAmount(tokenAddress, targetTokenAmount);

      if (ethNeeded > maxTradeAmount) {
        console.log(`⚠️ [UNISWAP] Need ${ethers.formatEther(ethNeeded)} ETH but only ${ethers.formatEther(maxTradeAmount)} available for trading`);
        console.log(`🔄 [UNISWAP] Using maximum available trade amount instead`);
        return { tradeAmount: maxTradeAmount, fee, gasReserve: totalReserve };
      }

      console.log(`✅ [UNISWAP] Can afford target amount: ${ethers.formatEther(ethNeeded)} ETH`);
      return { tradeAmount: ethNeeded, fee, gasReserve: totalReserve };
    }

    // No target specified, use maximum safe amount
    const { fee } = await this.findBestFeeAndQuote(tokenAddress, maxTradeAmount);
    return { tradeAmount: maxTradeAmount, fee, gasReserve: totalReserve };
  }

  /**
   * Swap ETH for exact amount of tokens (e.g., "1" for 1 EIGEN)
   */
  async swapEthForExactTokens(
    tokenAddress: string,
    targetTokenAmount: string,
    slippage: number = 5
  ): Promise<UniswapTradeResult> {
    const targetTokenAmountWei = ethers.parseUnits(targetTokenAmount, 18); // Assuming 18 decimals
    return this.swapEthForTokenInternal(tokenAddress, undefined, targetTokenAmountWei, slippage);
  }

  /**
   * Swap ETH for tokens using Uniswap V3 exactInputSingle with proper quotes
   */
  async swapEthForToken(
    tokenAddress: string,
    ethAmount: string,
    slippage: number = 5
  ): Promise<UniswapTradeResult> {
    // For now, use simple approach without complex balance management
    return this.swapEthForTokenSimple(tokenAddress, ethAmount, slippage);
  }

  /**
   * Simple swap without complex balance calculations
   */
  private async swapEthForTokenSimple(
    tokenAddress: string,
    ethAmount: string,
    slippage: number = 5
  ): Promise<UniswapTradeResult> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [UNISWAP] Simple swap attempt ${attempt}/${maxRetries}: ${ethAmount} ETH -> ${tokenAddress}`);

        if (!ethers.isAddress(tokenAddress)) {
          throw new Error(`Invalid token address: ${tokenAddress}`);
        }

        const recipient = await this.signer.getAddress();
        const ethAmountWei = ethers.parseEther(ethAmount);

        // Check balance first
        const balance = await this.provider.getBalance(recipient);
        console.log(`🔄 [UNISWAP] Balance: ${ethers.formatEther(balance)} ETH, Need: ${ethAmount} ETH`);

        if (balance < ethAmountWei + ethers.parseEther('0.0008')) { // Need reasonable amount for gas (~$2.80)
          throw new Error(`Insufficient balance: ${ethers.formatEther(balance)} ETH available, need ${ethAmount} ETH + gas (${ethers.formatEther(ethAmountWei + ethers.parseEther('0.0008'))} total)`);
        }

        // Set reasonable deadline
        const deadline = Math.floor(Date.now() / 1000) + 600;

        // Find best fee tier and get quote
        const { fee, quote, amountOutMin } = await this.findBestFeeAndQuote(tokenAddress, ethAmountWei);

        const swapParams = {
          tokenIn: WETH_ADDRESS,
          tokenOut: tokenAddress,
          fee: fee,
          recipient: recipient,
          deadline: deadline,
          amountIn: ethAmountWei,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };

        console.log(`🔄 [UNISWAP] Simple swap params:`, {
          amountIn: ethers.formatEther(swapParams.amountIn),
          fee: fee,
          deadline: new Date(deadline * 1000).toISOString()
        });

        // Use standard gas setting (not 'rapid')
        const gasEstimate = await this.gasManager.estimateGasWithRetry(
          this.router,
          'exactInputSingle',
          [swapParams],
          { value: ethAmountWei },
          1
        );

        const gasConfig = await this.gasManager.getGasConfig(gasEstimate, 'standard');

        console.log(`🔄 [UNISWAP] Gas: ${gasConfig.gasLimit.toString()} limit, ${gasConfig.maxFeePerGas ? ethers.formatUnits(gasConfig.maxFeePerGas, 'gwei') : 'N/A'} Gwei`);

        const txOptions: any = {
          value: ethAmountWei,
          gasLimit: gasConfig.gasLimit
        };

        if (gasConfig.type === 2) {
          txOptions.maxFeePerGas = gasConfig.maxFeePerGas;
          txOptions.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
        } else {
          txOptions.gasPrice = gasConfig.gasPrice;
        }

        console.log(`🔄 [UNISWAP] Submitting simple swap...`);
        const tx = await this.router.exactInputSingle(swapParams, txOptions);

        console.log(`🔄 [UNISWAP] Transaction: ${tx.hash}`);
        const receipt = await tx.wait();

        if (!receipt || receipt.status === 0) {
          throw new Error(`Transaction failed: ${tx.hash}`);
        }

        console.log(`✅ [UNISWAP] Success! Hash: ${receipt.hash}`);
        return {
          success: true,
          transactionHash: receipt.hash,
          toTokenAmount: quote.toString()
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ [UNISWAP] Simple swap attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError ? `After ${maxRetries} attempts: ${lastError.message}` : 'Unknown error'
    };
  }

  /**
   * Internal swap function with proper balance management
   */
  private async swapEthForTokenInternal(
    tokenAddress: string,
    ethAmount?: string,
    targetTokenAmount?: bigint,
    slippage: number = 5
  ): Promise<UniswapTradeResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const actionType = targetTokenAmount ? `buy ${ethers.formatUnits(targetTokenAmount, 18)} tokens` : `swap ${ethAmount} ETH`;
        console.log(`🔄 [UNISWAP] Starting ${actionType} (attempt ${attempt}/${maxRetries}) -> ${tokenAddress}`);

        // Validate token address format
        if (!ethers.isAddress(tokenAddress)) {
          throw new Error(`Invalid token address: ${tokenAddress}`);
        }

        const recipient = await this.signer.getAddress();

        // Get current ETH balance
        const balance = await this.provider.getBalance(recipient);
        console.log(`🔄 [UNISWAP] Current ETH balance: ${ethers.formatEther(balance)}`);

        // Calculate safe trade amount considering gas costs and target
        const safeCalc = await this.calculateSafeTradeAmount(tokenAddress, balance, targetTokenAmount);
        const actualEthAmount = safeCalc.tradeAmount;
        const fee = safeCalc.fee;

        console.log(`🔄 [UNISWAP] Safe trade calculation:`);
        console.log(`  - Trade amount: ${ethers.formatEther(actualEthAmount)} ETH`);
        console.log(`  - Gas reserve: ${ethers.formatEther(safeCalc.gasReserve)} ETH`);
        console.log(`  - Fee tier: ${fee / 10000}%`);

        // Set deadline to 10 minutes from now (not 20 minutes)
        const deadline = Math.floor(Date.now() / 1000) + 600;
        console.log(`🔄 [UNISWAP] Deadline: ${new Date(deadline * 1000).toISOString()}`);

        // Get quote and calculate slippage
        const { quote, amountOutMin } = await this.findBestFeeAndQuote(tokenAddress, actualEthAmount);

        if (targetTokenAmount && quote < targetTokenAmount) {
          console.log(`⚠️ [UNISWAP] Warning: Expected ${ethers.formatUnits(quote, 18)} tokens but target is ${ethers.formatUnits(targetTokenAmount, 18)}`);
        }

        // Construct exactInputSingle parameters
        const swapParams = {
          tokenIn: WETH_ADDRESS,
          tokenOut: tokenAddress,
          fee: fee, // This is already numeric (3000, 500, 10000)
          recipient: recipient,
          deadline: deadline,
          amountIn: actualEthAmount, // Use calculated safe amount
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0 // No price limit
        };

        console.log(`🔄 [UNISWAP] Swap parameters:`, {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: fee, // Show numeric fee (not percentage string)
          recipient: swapParams.recipient,
          deadline: swapParams.deadline,
          amountIn: ethers.formatEther(swapParams.amountIn),
          amountOutMinimum: swapParams.amountOutMinimum.toString(),
          sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96
        });

        // Estimate gas with retry
        const gasEstimate = await this.gasManager.estimateGasWithRetry(
          this.router,
          'exactInputSingle',
          [swapParams],
          { value: actualEthAmount }, // Use actual trade amount for value
          2
        );

        console.log(`🔄 [UNISWAP] Gas estimate: ${gasEstimate.toString()}`);

        // Get optimized gas configuration (use 'standard' for reasonable costs)
        const gasConfig = await this.gasManager.getGasConfig(gasEstimate, 'standard');

        console.log(`🔄 [UNISWAP] Gas config:`, {
          gasLimit: gasConfig.gasLimit.toString(),
          type: gasConfig.type,
          maxFeePerGas: gasConfig.maxFeePerGas ? ethers.formatUnits(gasConfig.maxFeePerGas, 'gwei') + ' Gwei' : 'N/A',
          maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas ? ethers.formatUnits(gasConfig.maxPriorityFeePerGas, 'gwei') + ' Gwei' : 'N/A',
          gasPrice: gasConfig.gasPrice ? ethers.formatUnits(gasConfig.gasPrice, 'gwei') + ' Gwei' : 'N/A'
        });

        // Execute the swap with optimized gas
        const txOptions: any = {
          value: actualEthAmount, // CRITICAL: Use actual trade amount, not original input
          gasLimit: gasConfig.gasLimit
        };

        if (gasConfig.type === 2) {
          // EIP-1559 transaction
          txOptions.maxFeePerGas = gasConfig.maxFeePerGas;
          txOptions.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
        } else {
          // Legacy transaction
          txOptions.gasPrice = gasConfig.gasPrice;
        }

        console.log(`🔄 [UNISWAP] Submitting exactInputSingle transaction...`);
        const tx = await this.router.exactInputSingle(swapParams, txOptions);

        console.log(`🔄 [UNISWAP] Transaction submitted: ${tx.hash}`);
        console.log(`🔄 [UNISWAP] Waiting for confirmation...`);

        // Wait for confirmation with timeout
        const receipt = await Promise.race([
          tx.wait(),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Transaction confirmation timeout (5 minutes)')), 5 * 60 * 1000)
          )
        ]);

        if (!receipt) {
          throw new Error('Transaction receipt not received');
        }

        if (receipt.status === 0) {
          throw new Error(`Transaction failed on-chain. Hash: ${tx.hash}`);
        }

        console.log(`✅ [UNISWAP] Swap completed successfully!`);
        console.log(`✅ [UNISWAP] Transaction hash: ${receipt.hash}`);
        console.log(`✅ [UNISWAP] Gas used: ${receipt.gasUsed?.toString()}`);
        console.log(`✅ [UNISWAP] Block number: ${receipt.blockNumber}`);
        console.log(`✅ [UNISWAP] Effective gas price: ${receipt.gasPrice ? ethers.formatUnits(receipt.gasPrice, 'gwei') + ' Gwei' : 'N/A'}`);
        console.log(`✅ [UNISWAP] Expected tokens received: ~${quote.toString()}`);

        return {
          success: true,
          transactionHash: receipt.hash,
          toTokenAmount: quote.toString()
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ [UNISWAP] Swap attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          // Exponential backoff for retries
          const delay = Math.pow(2, attempt - 1) * 2000; // 2s, 4s, 8s
          console.log(`🔄 [UNISWAP] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    console.error(`❌ [UNISWAP] All ${maxRetries} swap attempts failed`);
    return {
      success: false,
      error: lastError ? `After ${maxRetries} attempts: ${lastError.message}` : 'Unknown error after retries'
    };
  }

  /**
   * Get ETH balance
   */
  async getEthBalance(): Promise<string> {
    try {
      const address = await this.signer.getAddress();
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error(`❌ [UNISWAP] Failed to get ETH balance:`, error);
      return '0';
    }
  }
}

/**
 * Factory function to create UniswapTrader
 */
export async function createUniswapTrader(
  rpcUrl: string,
  privateKey: string
): Promise<UniswapTrader> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  return new UniswapTrader(provider, signer);
}