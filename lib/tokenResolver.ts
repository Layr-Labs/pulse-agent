import { eigenai } from './eigenai-provider';
import { generateText } from 'ai';
import { networkConfig, NetworkInfo } from './networkConfig';

interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  network: NetworkInfo;
  isValid: boolean;
  confidence: number;
}

interface TokenResolutionResult {
  found: boolean;
  token?: TokenInfo;
  reason: string;
  networkUsed?: NetworkInfo;
}

// Cache for token addresses to avoid repeated API calls
const tokenCache = new Map<string, TokenResolutionResult>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

export class DynamicTokenResolver {
  /**
   * Resolve token address on the best available network
   */
  async resolveTokenAddress(tokenSymbol: string): Promise<TokenResolutionResult> {
    console.log(`🔍 [TOKEN_RESOLVER] Resolving ${tokenSymbol} across multiple networks...`);

    // Get the best network for this token
    const preferredNetwork = networkConfig.getBestNetworkForToken(tokenSymbol);
    const cacheKey = `${tokenSymbol.toUpperCase()}-${preferredNetwork.id}`;

    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() - (cached as any).timestamp < CACHE_DURATION) {
      console.log(`🔍 [TOKEN_RESOLVER] Found cached result for ${tokenSymbol} on ${preferredNetwork.name}`);
      return cached;
    }

    // Try preferred network first
    console.log(`🔍 [TOKEN_RESOLVER] Trying preferred network: ${preferredNetwork.name}`);
    let result = await this.tryResolveOnNetwork(tokenSymbol, preferredNetwork);

    // If not found on preferred network, try other available networks
    if (!result.found) {
      console.log(`🔍 [TOKEN_RESOLVER] Not found on ${preferredNetwork.name}, trying other networks...`);

      const otherNetworks = networkConfig.getNetworks().filter(n => n.id !== preferredNetwork.id);

      for (const network of otherNetworks) {
        console.log(`🔍 [TOKEN_RESOLVER] Trying ${network.name}...`);
        result = await this.tryResolveOnNetwork(tokenSymbol, network);

        if (result.found) {
          console.log(`🔍 [TOKEN_RESOLVER] ✅ Found ${tokenSymbol} on ${network.name}`);
          break;
        }
      }
    }

    // Cache the result
    (result as any).timestamp = Date.now();
    tokenCache.set(cacheKey, result);

    return result;
  }

  /**
   * Try to resolve token using Perplexity web search directly
   */
  private async tryResolveOnNetwork(tokenSymbol: string, network: NetworkInfo): Promise<TokenResolutionResult> {
    console.log(`🔍 [TOKEN_RESOLVER] Resolving ${tokenSymbol} on ${network.name} using Perplexity web search...`);

    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.log(`🔍 [TOKEN_RESOLVER] ❌ PERPLEXITY_API_KEY not found`);
        return {
          found: false,
          reason: 'Perplexity API key not configured',
          networkUsed: network
        };
      }

      // Create specific search query for tradeable token addresses
      const networkName = network.id.includes('ethereum') ? 'Ethereum' : 'Base';
      const explorerName = network.id.includes('ethereum') ? 'etherscan.io' : 'basescan.org';

      const query = `${tokenSymbol} token official tradeable ERC-20 contract address on ${networkName} ${network.id} blockchain. I need the main token contract address that can be traded on DEXs like Uniswap, NOT protocol contracts, staking contracts, or other auxiliary addresses. Show me the verified contract address from ${explorerName}. Return only the official tradeable token information.`;

      console.log(`🔍 [TOKEN_RESOLVER] Perplexity search query: ${query}`);

      const response = await fetch('https://api.perplexity.ai/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          max_results: 10,
          max_tokens_per_page: 2048
        }),
      });

      if (!response.ok) {
        console.error(`🔍 [TOKEN_RESOLVER] Perplexity API error: ${response.status} ${response.statusText}`);
        return {
          found: false,
          reason: 'Perplexity API error',
          networkUsed: network
        };
      }

      const data = await response.json();
      console.log(`🔍 [TOKEN_RESOLVER] Perplexity search results:`, JSON.stringify(data, null, 2));

      // Parse the results to extract token information
      const tokenInfo = this.parsePerplexityResults(tokenSymbol, network, data.results);

      if (tokenInfo) {
        console.log(`🔍 [TOKEN_RESOLVER] ✅ Successfully resolved ${tokenSymbol} via Perplexity:`, tokenInfo);
        return {
          found: true,
          token: tokenInfo,
          reason: 'Resolved via Perplexity web search',
          networkUsed: network
        };
      } else {
        console.log(`🔍 [TOKEN_RESOLVER] ❌ Could not find ${tokenSymbol} on ${network.name}`);
        return {
          found: false,
          reason: 'Token not found on this network via web search',
          networkUsed: network
        };
      }

    } catch (error) {
      console.error(`🔍 [TOKEN_RESOLVER] Error during Perplexity resolution:`, error);
      return {
        found: false,
        reason: 'Error during web-based token resolution',
        networkUsed: network
      };
    }
  }

  /**
   * Parse Perplexity search results to extract token information
   */
  private parsePerplexityResults(tokenSymbol: string, network: NetworkInfo, results: any[]): TokenInfo | null {
    console.log(`🔍 [TOKEN_PARSER] Parsing results for ${tokenSymbol} on ${network.name}`);

    const expectedExplorer = network.id.includes('ethereum') ? 'etherscan.io' : 'basescan.org';
    const addressRegex = /0x[a-fA-F0-9]{40}/g;

    // Look for results from the correct blockchain explorer
    for (const result of results) {
      const url = result.url?.toLowerCase() || '';
      const title = result.title?.toLowerCase() || '';
      const snippet = result.snippet?.toLowerCase() || '';

      console.log(`🔍 [TOKEN_PARSER] Checking result: ${result.title}`);
      console.log(`🔍 [TOKEN_PARSER] URL: ${url}`);

      // Validate hostname instead of just checking if domain appears anywhere in URL
      let hostname = '';
      try {
        const urlObj = new URL(url);
        hostname = urlObj.hostname;
      } catch (e) {
        console.log(`🔍 [TOKEN_PARSER] Invalid URL: ${url}`);
        continue;
      }

      // Skip results from wrong network explorers - check hostname matches
      if (network.id.includes('ethereum') && hostname.includes('basescan')) {
        console.log(`🔍 [TOKEN_PARSER] Skipping Base result for Ethereum search`);
        continue;
      }
      if (network.id.includes('base') && hostname.includes('etherscan') && !hostname.includes('basescan')) {
        console.log(`🔍 [TOKEN_PARSER] Skipping Ethereum result for Base search`);
        continue;
      }

      // Check if this looks like a token tracker page for our token
      const isTokenMatch = title.includes(tokenSymbol.toLowerCase()) ||
                          snippet.includes(tokenSymbol.toLowerCase()) ||
                          url.includes(tokenSymbol.toLowerCase());

      const isTokenPage = url.includes('/token/') ||
                         url.includes('/address/') ||
                         title.includes('token tracker') ||
                         title.includes('contract');

      // Verify hostname matches expected explorer domain
      const isValidExplorer = hostname === expectedExplorer || hostname.endsWith(`.${expectedExplorer}`);

      if (isTokenMatch && isTokenPage && isValidExplorer) {
        console.log(`🔍 [TOKEN_PARSER] Found potential match: ${result.title}`);

        // Extract address from URL or content
        let contractAddress = null;

        // Try to extract from URL first (most reliable)
        const urlAddressMatch = url.match(/\/(?:token|address)\/(0x[a-fA-F0-9]{40})/);
        if (urlAddressMatch) {
          contractAddress = urlAddressMatch[1];
          console.log(`🔍 [TOKEN_PARSER] Extracted address from URL: ${contractAddress}`);
        } else {
          // Try to extract from title or snippet
          const addresses = [...(result.title?.match(addressRegex) || []), ...(result.snippet?.match(addressRegex) || [])];
          if (addresses.length > 0) {
            contractAddress = addresses[0]; // Take first found address
            console.log(`🔍 [TOKEN_PARSER] Extracted address from content: ${contractAddress}`);
          }
        }

        if (contractAddress && this.isValidAddress(contractAddress)) {
          // Try to extract token name from title
          let tokenName = tokenSymbol;
          const nameMatch = result.title?.match(new RegExp(`([^|]+)\\s*\\(${tokenSymbol}\\)`, 'i'));
          if (nameMatch) {
            tokenName = nameMatch[1].trim();
          }

          console.log(`🔍 [TOKEN_PARSER] ✅ Successfully parsed token info:`, {
            symbol: tokenSymbol.toUpperCase(),
            name: tokenName,
            address: contractAddress
          });

          return {
            symbol: tokenSymbol.toUpperCase(),
            name: tokenName,
            address: contractAddress,
            decimals: 18, // Default, could be extracted from contract if needed
            network: network,
            isValid: true,
            confidence: 95 // High confidence from web search
          };
        }
      }
    }

    console.log(`🔍 [TOKEN_PARSER] No valid token information found in search results`);
    return null;
  }


  /**
   * Validate Ethereum address format
   */
  private isValidAddress(address: string): boolean {
    if (!address) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }


  /**
   * Get multiple token addresses in batch
   */
  async resolveMultipleTokens(symbols: string[]): Promise<Map<string, TokenResolutionResult>> {
    console.log(`🔍 [TOKEN_RESOLVER] Batch resolving ${symbols.length} tokens:`, symbols);

    const results = new Map<string, TokenResolutionResult>();

    // Process in parallel for efficiency
    const promises = symbols.map(async (symbol) => {
      const result = await this.resolveTokenAddress(symbol);
      results.set(symbol.toUpperCase(), result);
    });

    await Promise.all(promises);

    console.log(`🔍 [TOKEN_RESOLVER] Batch resolution complete. Found ${Array.from(results.values()).filter(r => r.found).length}/${symbols.length} tokens`);

    return results;
  }

  /**
   * Clear the token cache
   */
  clearCache(): void {
    console.log(`🔍 [TOKEN_RESOLVER] Clearing token address cache`);
    tokenCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: tokenCache.size,
      entries: Array.from(tokenCache.keys())
    };
  }
}

// Export singleton instance
export const tokenResolver = new DynamicTokenResolver();

// Convenience function for backward compatibility
export async function getTokenAddress(tokenSymbol: string): Promise<string | null> {
  console.log(`🔍 [TOKEN_RESOLVER] Legacy getTokenAddress called for ${tokenSymbol}`);

  const result = await tokenResolver.resolveTokenAddress(tokenSymbol);

  if (result.found && result.token) {
    console.log(`🔍 [TOKEN_RESOLVER] ✅ Resolved ${tokenSymbol} -> ${result.token.address}`);
    return result.token.address;
  } else {
    console.log(`🔍 [TOKEN_RESOLVER] ❌ Could not resolve ${tokenSymbol}: ${result.reason}`);
    return null;
  }
}