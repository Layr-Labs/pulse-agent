import { ethers } from 'ethers';

export interface GasConfig {
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  type?: number; // 0 for legacy, 2 for EIP-1559
}

export interface NetworkGasSettings {
  isMainnet: boolean;
  chainId: number;
  supports1559: boolean;
  baseFeeMultiplier: number; // Multiplier for base fee (e.g., 1.2 = 20% buffer)
  priorityFeeGwei: number; // Priority fee in Gwei
}

export class GasManager {
  private provider: ethers.Provider;
  private networkSettings: NetworkGasSettings;

  constructor(provider: ethers.Provider, networkSettings: NetworkGasSettings) {
    this.provider = provider;
    this.networkSettings = networkSettings;
  }

  /**
   * Get optimal gas configuration for a transaction
   */
  async getGasConfig(estimatedGas: bigint, urgency: 'standard' | 'fast' | 'rapid' = 'standard'): Promise<GasConfig> {
    console.log(`💰 [GAS] Getting gas config for ${this.networkSettings.isMainnet ? 'mainnet' : 'testnet'}`);
    console.log(`💰 [GAS] Estimated gas: ${estimatedGas.toString()}`);

    // Reasonable gas limits (not excessive)
    let gasLimit: bigint;
    if (this.networkSettings.isMainnet) {
      // For mainnet: 20% buffer, reasonable minimum
      const bufferedGas = (estimatedGas * BigInt(120)) / BigInt(100); // 20% buffer
      const minimumGas = BigInt(150000); // 150k minimum (not 300k!)
      gasLimit = bufferedGas > minimumGas ? bufferedGas : minimumGas;
    } else {
      // For testnets: 20% buffer
      const bufferedGas = (estimatedGas * BigInt(120)) / BigInt(100); // 20% buffer
      const minimumGas = BigInt(100000); // 100k minimum
      gasLimit = bufferedGas > minimumGas ? bufferedGas : minimumGas;
    }

    console.log(`💰 [GAS] Gas limit (reasonable): ${gasLimit.toString()}`);

    if (!this.networkSettings.supports1559) {
      // Legacy transaction (Type 0)
      const gasPrice = await this.getLegacyGasPrice(urgency);
      console.log(`💰 [GAS] Legacy gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);

      return {
        gasLimit,
        gasPrice,
        type: 0
      };
    }

    // EIP-1559 transaction (Type 2)
    const feeData = await this.getEIP1559FeeData(urgency);
    console.log(`💰 [GAS] EIP-1559 fees - Base: ${ethers.formatUnits(feeData.maxFeePerGas, 'gwei')} Gwei, Priority: ${ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')} Gwei`);

    return {
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      type: 2
    };
  }

  /**
   * Get gas price for legacy transactions
   */
  private async getLegacyGasPrice(urgency: 'standard' | 'fast' | 'rapid'): Promise<bigint> {
    try {
      const gasPrice = await this.provider.getFeeData();
      let basePrice = gasPrice.gasPrice || ethers.parseUnits('20', 'gwei');

      // Apply urgency multiplier
      const multiplier = this.getUrgencyMultiplier(urgency);
      const adjustedPrice = (basePrice * BigInt(Math.floor(multiplier * 100))) / BigInt(100);

      // Minimum gas price for mainnet (to prevent too-low fees)
      const minGasPrice = this.networkSettings.isMainnet
        ? ethers.parseUnits('1', 'gwei')
        : ethers.parseUnits('0.1', 'gwei');

      return adjustedPrice < minGasPrice ? minGasPrice : adjustedPrice;
    } catch (error) {
      console.warn(`💰 [GAS] Failed to get gas price, using fallback:`, error);
      // Reasonable fallback gas prices
      const fallbackGwei = this.networkSettings.isMainnet ? '10' : '2';
      return ethers.parseUnits(fallbackGwei, 'gwei');
    }
  }

  /**
   * Get EIP-1559 fee data
   */
  private async getEIP1559FeeData(urgency: 'standard' | 'fast' | 'rapid'): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    try {
      const feeData = await this.provider.getFeeData();

      // Get base fee from latest block
      const latestBlock = await this.provider.getBlock('latest');
      const baseFee = latestBlock?.baseFeePerGas || ethers.parseUnits('10', 'gwei');

      console.log(`💰 [GAS] Current base fee: ${ethers.formatUnits(baseFee, 'gwei')} Gwei`);

      // Calculate priority fee based on urgency and network
      const basePriorityFee = ethers.parseUnits(this.networkSettings.priorityFeeGwei.toString(), 'gwei');
      const urgencyMultiplier = this.getUrgencyMultiplier(urgency);
      const maxPriorityFeePerGas = (basePriorityFee * BigInt(Math.floor(urgencyMultiplier * 100))) / BigInt(100);

      // Max fee = (base fee * multiplier) + priority fee
      const maxFeePerGas = (baseFee * BigInt(Math.floor(this.networkSettings.baseFeeMultiplier * 100))) / BigInt(100) + maxPriorityFeePerGas;

      // Reasonable minimum fees for mainnet
      const minMaxFee = this.networkSettings.isMainnet
        ? ethers.parseUnits('5', 'gwei')   // Reasonable minimum (not 15!)
        : ethers.parseUnits('0.1', 'gwei');

      const minPriorityFee = this.networkSettings.isMainnet
        ? ethers.parseUnits('1', 'gwei')   // 1 Gwei priority minimum
        : ethers.parseUnits('0.01', 'gwei');

      return {
        maxFeePerGas: maxFeePerGas < minMaxFee ? minMaxFee : maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas < minPriorityFee ? minPriorityFee : maxPriorityFeePerGas
      };
    } catch (error) {
      console.warn(`💰 [GAS] Failed to get EIP-1559 fee data, using fallback:`, error);

      // Reasonable fallback fees
      const fallbackMaxFee = this.networkSettings.isMainnet
        ? ethers.parseUnits('15', 'gwei')  // Much more reasonable
        : ethers.parseUnits('3', 'gwei');

      const fallbackPriorityFee = this.networkSettings.isMainnet
        ? ethers.parseUnits('2', 'gwei')   // Reasonable priority fee
        : ethers.parseUnits('0.2', 'gwei');

      return {
        maxFeePerGas: fallbackMaxFee,
        maxPriorityFeePerGas: fallbackPriorityFee
      };
    }
  }

  /**
   * Get urgency multiplier for gas fees (more aggressive for mainnet)
   */
  private getUrgencyMultiplier(urgency: 'standard' | 'fast' | 'rapid'): number {
    if (this.networkSettings.isMainnet) {
      // More aggressive multipliers for mainnet
      switch (urgency) {
        case 'standard': return 1.2;
        case 'fast': return 2.0;
        case 'rapid': return 3.0;
        default: return 1.2;
      }
    } else {
      // Standard multipliers for testnets
      switch (urgency) {
        case 'standard': return 1.0;
        case 'fast': return 1.5;
        case 'rapid': return 2.0;
        default: return 1.0;
      }
    }
  }

  /**
   * Estimate gas with retries
   */
  async estimateGasWithRetry(
    contract: ethers.Contract,
    method: string,
    args: any[],
    overrides: any = {},
    retries: number = 3
  ): Promise<bigint> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        console.log(`💰 [GAS] Estimating gas for ${method} (attempt ${i + 1}/${retries})`);
        const gasEstimate = await contract[method].estimateGas(...args, overrides);
        console.log(`💰 [GAS] Gas estimate successful: ${gasEstimate.toString()}`);
        return gasEstimate;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`💰 [GAS] Gas estimation attempt ${i + 1} failed:`, lastError.message);

        if (i < retries - 1) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.log(`💰 [GAS] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, throw the last error
    throw new Error(`Gas estimation failed after ${retries} attempts: ${lastError?.message}`);
  }
}

/**
 * Create gas manager for different networks
 */
export function createGasManager(provider: ethers.Provider, chainId: number): GasManager {
  let networkSettings: NetworkGasSettings;

  switch (chainId) {
    case 1: // Ethereum Mainnet
      networkSettings = {
        isMainnet: true,
        chainId: 1,
        supports1559: true,
        baseFeeMultiplier: 1.2, // 20% buffer on base fee (more reasonable)
        priorityFeeGwei: 2 // 2 Gwei priority fee (normal for mainnet)
      };
      break;

    case 11155111: // Sepolia
      networkSettings = {
        isMainnet: false,
        chainId: 11155111,
        supports1559: true,
        baseFeeMultiplier: 1.2, // 20% buffer on base fee
        priorityFeeGwei: 0.1 // 0.1 Gwei priority fee for testnet
      };
      break;

    case 8453: // Base Mainnet
      networkSettings = {
        isMainnet: true,
        chainId: 8453,
        supports1559: true,
        baseFeeMultiplier: 1.2, // 20% buffer (Base is cheaper)
        priorityFeeGwei: 0.01 // Lower priority fee for Base
      };
      break;

    case 84532: // Base Sepolia
      networkSettings = {
        isMainnet: false,
        chainId: 84532,
        supports1559: true,
        baseFeeMultiplier: 1.1, // 10% buffer
        priorityFeeGwei: 0.001 // Very low for testnet
      };
      break;

    default:
      // Default settings for unknown chains
      networkSettings = {
        isMainnet: false,
        chainId: chainId,
        supports1559: true,
        baseFeeMultiplier: 1.2,
        priorityFeeGwei: 1
      };
  }

  return new GasManager(provider, networkSettings);
}