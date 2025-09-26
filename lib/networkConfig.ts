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

    // Token-to-network preferences
    const tokenPreferences: Record<string, 'base' | 'ethereum'> = {
      // Ethereum native tokens
      'EIGEN': 'ethereum',
      'UNI': 'ethereum',
      'LINK': 'ethereum',
      'AAVE': 'ethereum',

      // Base native tokens
      'USDC': 'base', // Native USDC on Base
      'WETH': 'base', // Wrapped ETH
      'ETH': 'base',  // Use Base for ETH (lower fees)

      // Multi-chain tokens - prefer Base for lower fees
      'USDT': 'base',
      'DAI': 'base'
    };

    const preferredChain = tokenPreferences[token] || 'base'; // Default to Base
    const network = this.getNetworkByChainType(preferredChain);

    if (!network) {
      console.log(`🔍 [NETWORK] Preferred chain ${preferredChain} not available, using first network`);
      return this.config.networks[0];
    }

    console.log(`🔍 [NETWORK] Selected ${network.name} for token ${token}`);
    return network;
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