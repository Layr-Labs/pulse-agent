export interface NetworkInfo {
  id: string;
  name: string;
  rpcUrl?: string;
  blockExplorerUrl: string;
  nativeCurrency: string;
  chainType: 'base' | 'ethereum';
}

export interface MultiNetworkConfig {
  networks: NetworkInfo[];
  environment: 'mainnet' | 'testnet';
}

export class NetworkConfigManager {
  private config: MultiNetworkConfig;

  constructor() {
    const environment = (process.env.NETWORK_ENV || 'testnet') as 'mainnet' | 'testnet';

    this.config = {
      environment,
      networks: this.getNetworksForEnvironment(environment)
    };

    console.log(`🔍 [NETWORK] Initialized multi-network config for ${environment}`);
    console.log(`🔍 [NETWORK] Available networks:`, this.config.networks.map(n => n.name));
  }

  private getNetworksForEnvironment(environment: 'mainnet' | 'testnet'): NetworkInfo[] {
    if (environment === 'mainnet') {
      return [
        {
          id: 'base-mainnet',
          name: 'Base Mainnet',
          rpcUrl: process.env.BASE_MAINNET_RPC_URL,
          blockExplorerUrl: 'https://basescan.org',
          nativeCurrency: 'ETH',
          chainType: 'base'
        },
        {
          id: 'ethereum-mainnet',
          name: 'Ethereum Mainnet',
          rpcUrl: process.env.ETHEREUM_MAINNET_RPC_URL,
          blockExplorerUrl: 'https://etherscan.io',
          nativeCurrency: 'ETH',
          chainType: 'ethereum'
        }
      ];
    } else {
      return [
        {
          id: 'base-sepolia',
          name: 'Base Sepolia',
          rpcUrl: process.env.BASE_TESTNET_RPC_URL,
          blockExplorerUrl: 'https://sepolia.basescan.org',
          nativeCurrency: 'ETH',
          chainType: 'base'
        },
        {
          id: 'ethereum-sepolia',
          name: 'Ethereum Sepolia',
          rpcUrl: process.env.ETHEREUM_TESTNET_RPC_URL,
          blockExplorerUrl: 'https://sepolia.etherscan.io',
          nativeCurrency: 'ETH',
          chainType: 'ethereum'
        }
      ];
    }
  }

  getNetworks(): NetworkInfo[] {
    return this.config.networks;
  }

  getEnvironment(): 'mainnet' | 'testnet' {
    return this.config.environment;
  }

  getNetworkById(networkId: string): NetworkInfo | undefined {
    return this.config.networks.find(n => n.id === networkId);
  }

  getNetworkByChainType(chainType: 'base' | 'ethereum'): NetworkInfo | undefined {
    return this.config.networks.find(n => n.chainType === chainType);
  }

  // Get the best network for a specific token
  getBestNetworkForToken(tokenSymbol: string): NetworkInfo {
    const token = tokenSymbol.toUpperCase();

    // Token-to-network preferences based on known ecosystem patterns
    const tokenPreferences: Record<string, 'base' | 'ethereum'> = {
      // Major Ethereum-native DeFi tokens (typically originate on Ethereum)
      'EIGEN': 'ethereum', // EigenLayer - only on Ethereum mainnet
      'UNI': 'ethereum',
      'LINK': 'ethereum',
      'AAVE': 'ethereum',
      'COMP': 'ethereum',
      'MKR': 'ethereum',
      'SNX': 'ethereum',
      'CRV': 'ethereum',
      'LDO': 'ethereum',

      // Base-native or Base-preferred tokens (lower fees, native implementations)
      'USDC': 'base', // Native USDC on Base
      'WETH': 'base', // Wrapped ETH, cheaper on Base
      'ETH': 'base',  // Use Base for ETH (lower fees)
      'CBETH': 'base', // Coinbase staked ETH

      // Multi-chain tokens - prefer Base for lower fees
      'USDT': 'base',
      'DAI': 'base'
    };

    let preferredChain = tokenPreferences[token];

    // Smart fallback for unknown tokens
    if (!preferredChain) {
      // For newer/DeFi tokens, try Ethereum first (most comprehensive ecosystem)
      // For mainstream tokens, prefer Base (lower fees)
      if (this.isLikelyDefiToken(token)) {
        preferredChain = 'ethereum';
        console.log(`🔍 [NETWORK] Unknown token ${token} - trying Ethereum first (DeFi ecosystem)`);
      } else {
        preferredChain = 'base';
        console.log(`🔍 [NETWORK] Unknown token ${token} - trying Base first (lower fees)`);
      }
    }

    const network = this.getNetworkByChainType(preferredChain);

    if (!network) {
      console.log(`🔍 [NETWORK] Preferred chain ${preferredChain} not available, using first network`);
      return this.config.networks[0];
    }

    console.log(`🔍 [NETWORK] Selected ${network.name} for token ${token}`);
    return network;
  }

  // Helper to identify likely DeFi tokens that might be Ethereum-native
  private isLikelyDefiToken(tokenSymbol: string): boolean {
    const token = tokenSymbol.toUpperCase();

    // Patterns that suggest DeFi/Ethereum-native tokens
    const defiPatterns = [
      // Protocol names
      /^(EIGEN|ONDO|PENDLE|ENA|ETHFI|REZ|RENZO|SWELL|LIDO|ROCKET)/,
      // Common DeFi suffixes
      /^.*FI$/, // DeFi protocols ending in FI
      /^.*DAO$/, // DAO tokens
      /^ST.*/, // Staking tokens (stETH, stMATIC, etc.)
      /^R.*/, // Reward/restaking tokens (rETH, etc.)
      /^W.*/, // Wrapped tokens (if not in our known list)
    ];

    // Known stablecoin/mainstream patterns (prefer Base)
    const mainstreamPatterns = [
      /^USD[TCR]$/, // USDT, USDC, USDR
      /^[A-Z]{3,4}$/ // Simple 3-4 letter tokens
    ];

    // Check if it matches DeFi patterns
    for (const pattern of defiPatterns) {
      if (pattern.test(token)) {
        return true;
      }
    }

    // If it's very short and simple, probably mainstream
    if (token.length <= 4 && mainstreamPatterns.some(p => p.test(token))) {
      return false;
    }

    // Longer, complex tokens likely DeFi
    return token.length > 4;
  }

  // Get only Base networks (for AgentKit trading)
  getBaseNetworksOnly(): NetworkInfo[] {
    return this.config.networks.filter(n => n.chainType === 'base');
  }

  // Get the best Base network for trading (AgentKit compatible)
  getBestBaseNetworkForToken(tokenSymbol: string): NetworkInfo | null {
    const baseNetworks = this.getBaseNetworksOnly();
    if (baseNetworks.length === 0) {
      console.log(`🔍 [NETWORK] No Base networks available for trading`);
      return null;
    }

    // For AgentKit trading, always use the first Base network
    const network = baseNetworks[0];
    console.log(`🔍 [NETWORK] Selected ${network.name} for AgentKit trading of ${tokenSymbol}`);
    return network;
  }

  // Get primary network (first in list)
  getPrimaryNetwork(): NetworkInfo {
    return this.config.networks[0];
  }

  // For backward compatibility with existing AgentKit code
  getLegacyNetworkId(): string {
    return this.getPrimaryNetwork().id;
  }

  // Get all supported networks as a formatted string
  getNetworkSummary(): string {
    return this.config.networks
      .map(n => `${n.name} (${n.id})`)
      .join(', ');
  }
}

// Export singleton instance
export const networkConfig = new NetworkConfigManager();