import { ethers } from 'ethers';
import { createGasManager, GasManager } from './gasManager';

// Uniswap V2 Router (more reliable for simple swaps)
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// Simple Uniswap V2 Router ABI for ETH->Token swaps
const SIMPLE_ROUTER_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
      { "internalType": "address[]", "name": "path", "type": "address[]" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactETHForTokens",
    "outputs": [
      { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

export interface SimpleSwapResult {
  success: boolean;
  transactionHash?: string;
  tokenAmount?: string;
  toTokenAmount?: string;
  error?: string;
}

export class SimpleSwapper {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private router: ethers.Contract;
  private gasManager: GasManager;

  constructor(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
    this.router = new ethers.Contract(UNISWAP_V2_ROUTER, SIMPLE_ROUTER_ABI, signer);

    // Initialize gas manager with network detection
    this.gasManager = createGasManager(provider, 1); // Default to mainnet, will update in init
    this.initializeNetwork();
  }

  private async initializeNetwork(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);
      this.gasManager = createGasManager(this.provider, chainId);
      console.log(`🔄 [SIMPLE_SWAP] Initialized for chain ID: ${chainId}`);
    } catch (error) {
      console.warn(`🔄 [SIMPLE_SWAP] Failed to detect network, using mainnet defaults:`, error);
    }
  }

  /**
   * Simple ETH->Token swap using Uniswap V2 router with robust error handling
   */
  async swapEthForToken(
    tokenAddress: string,
    ethAmount: string,
    slippage: number = 3
  ): Promise<SimpleSwapResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [SIMPLE_SWAP] Starting ETH->Token swap (attempt ${attempt}/${maxRetries}): ${ethAmount} ETH -> ${tokenAddress}`);

        // Validate token address
        if (!ethers.isAddress(tokenAddress)) {
          throw new Error(`Invalid token address: ${tokenAddress}`);
        }

        const recipient = await this.signer.getAddress();
        const ethAmountWei = ethers.parseEther(ethAmount);

        // Check if the trade amount is too small (less than $5 at ~$3500 ETH)
        const minTradeAmount = ethers.parseEther('0.0015'); // ~$5 for better success rate
        if (ethAmountWei < minTradeAmount) {
          throw new Error(`Trade amount too small: ${ethAmount} ETH (minimum: 0.0015 ETH for reliable DEX swaps)`);
        }

        // Create path: WETH -> Token
        const path = [WETH_ADDRESS, tokenAddress];
        console.log(`🔄 [SIMPLE_SWAP] Path: ${path.join(' -> ')}`);

        // Remove the strict V2 liquidity check since we should prioritize V3
        // The gas estimation will fail if there's no liquidity, which is a better test
        console.log(`🔄 [SIMPLE_SWAP] Proceeding with V2 swap (V3 should be preferred, but this is fallback)`);
        console.log(`🔄 [SIMPLE_SWAP] Note: If this fails, check if token has V3 liquidity instead`);

        // Set deadline to 20 minutes from now
        const deadline = Math.floor(Date.now() / 1000) + 1200;

        // For now, set minimum amount out to 0 (will add proper slippage calculation later)
        const amountOutMin = 0;

        console.log(`🔄 [SIMPLE_SWAP] Parameters:`);
        console.log(`  - ETH Amount: ${ethAmount} (${ethAmountWei.toString()} wei)`);
        console.log(`  - Recipient: ${recipient}`);
        console.log(`  - Deadline: ${deadline}`);
        console.log(`  - Min Amount Out: ${amountOutMin}`);

        // Estimate gas with retries using gas manager
        let gasEstimate: bigint;
        try {
          gasEstimate = await this.gasManager.estimateGasWithRetry(
            this.router,
            'swapExactETHForTokens',
            [amountOutMin, path, recipient, deadline],
            { value: ethAmountWei },
            2 // 2 retries for gas estimation
          );
        } catch (gasError) {
          throw new Error(`Gas estimation failed - this usually means the swap would fail. Possible reasons: insufficient liquidity, token transfer restrictions, or amount too small. Original error: ${gasError instanceof Error ? gasError.message : String(gasError)}`);
        }

        console.log(`🔄 [SIMPLE_SWAP] Gas estimate: ${gasEstimate.toString()}`);

        // Get optimized gas configuration (use 'standard' for reasonable costs)
        const gasConfig = await this.gasManager.getGasConfig(gasEstimate, 'standard');

        console.log(`🔄 [SIMPLE_SWAP] Gas config:`, {
          gasLimit: gasConfig.gasLimit.toString(),
          type: gasConfig.type,
          maxFeePerGas: gasConfig.maxFeePerGas ? ethers.formatUnits(gasConfig.maxFeePerGas, 'gwei') + ' Gwei' : 'N/A',
          maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas ? ethers.formatUnits(gasConfig.maxPriorityFeePerGas, 'gwei') + ' Gwei' : 'N/A',
          gasPrice: gasConfig.gasPrice ? ethers.formatUnits(gasConfig.gasPrice, 'gwei') + ' Gwei' : 'N/A'
        });

        // Execute the swap with optimized gas
        const txOptions: any = {
          value: ethAmountWei,
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

        console.log(`🔄 [SIMPLE_SWAP] Submitting transaction...`);
        const tx = await this.router.swapExactETHForTokens(
          amountOutMin,
          path,
          recipient,
          deadline,
          txOptions
        );

        console.log(`🔄 [SIMPLE_SWAP] Transaction submitted: ${tx.hash}`);
        console.log(`🔄 [SIMPLE_SWAP] Waiting for confirmation...`);

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

        console.log(`✅ [SIMPLE_SWAP] Swap completed successfully!`);
        console.log(`✅ [SIMPLE_SWAP] Transaction hash: ${receipt.hash}`);
        console.log(`✅ [SIMPLE_SWAP] Gas used: ${receipt.gasUsed?.toString()}`);
        console.log(`✅ [SIMPLE_SWAP] Block number: ${receipt.blockNumber}`);
        console.log(`✅ [SIMPLE_SWAP] Effective gas price: ${receipt.gasPrice ? ethers.formatUnits(receipt.gasPrice, 'gwei') + ' Gwei' : 'N/A'}`);

        return {
          success: true,
          transactionHash: receipt.hash,
          toTokenAmount: 'unknown' // V2 router doesn't easily return exact amount without parsing logs
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ [SIMPLE_SWAP] Swap attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          // Exponential backoff for retries
          const delay = Math.pow(2, attempt - 1) * 2000; // 2s, 4s, 8s
          console.log(`🔄 [SIMPLE_SWAP] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    console.error(`❌ [SIMPLE_SWAP] All ${maxRetries} swap attempts failed`);
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
      console.error(`❌ [SIMPLE_SWAP] Failed to get ETH balance:`, error);
      return '0';
    }
  }
}

/**
 * Factory function to create SimpleSwapper
 */
export async function createSimpleSwapper(
  rpcUrl: string,
  privateKey: string
): Promise<SimpleSwapper> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  return new SimpleSwapper(provider, signer);
}