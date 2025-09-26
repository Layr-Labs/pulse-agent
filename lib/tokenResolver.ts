import { openai } from '@ai-sdk/openai';
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
   * Try to resolve token on a specific network
   */
  private async tryResolveOnNetwork(tokenSymbol: string, network: NetworkInfo): Promise<TokenResolutionResult> {
    const cacheKey = `${tokenSymbol.toUpperCase()}-${network.id}`;

    try {
      console.log(`🔍 [TOKEN_RESOLVER] Calling OpenAI for token resolution on ${network.name}...`);

      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        messages: [
          {
            role: 'system',
            content: `You are a cryptocurrency token address resolver. Your job is to find the correct contract address for tokens on specific blockchain networks.

IMPORTANT RULES:
1. Only provide addresses for tokens that ACTUALLY exist on the specified network
2. Use ONLY official, verified contract addresses
3. For Base network, prefer native tokens over bridged versions when available
4. If a token doesn't exist on the network or you're unsure, return "not_found"
5. Always double-check your knowledge - incorrect addresses can cause fund loss

KNOWN OFFICIAL ADDRESSES:
- EIGEN on Ethereum: 0xec53bf9167f50cdeb3ae105f56099aaab9061f83
- EIGEN is NOT officially available on Base network (as of 2024)
- USDC (Native Base): 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (base-mainnet)
- WETH (Base): 0x4200000000000000000000000000000000000006 (base-mainnet)
- UNI on Ethereum: 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
- LINK on Ethereum: 0x514910771AF9Ca656af840dff83E8264EcF986CA

Response format (JSON only):
{
  "found": true|false,
  "symbol": "TOKEN",
  "name": "Full Token Name",
  "address": "0x...",
  "decimals": 18,
  "network": "base-mainnet",
  "confidence": 85,
  "reason": "explanation"
}

For "not_found" responses:
{
  "found": false,
  "reason": "Token does not exist on this network / No reliable address found"
}`
          },
          {
            role: 'user',
            content: `Find the contract address for token "${tokenSymbol}" on network "${network.id}".

Network details:
- base-mainnet: Base Layer 2 network
- base-sepolia: Base testnet
- ethereum-mainnet: Ethereum mainnet
- ethereum-sepolia: Ethereum testnet

Requirements:
- Must be the official, verified contract address
- Must exist on the specified network
- Provide confidence level (0-100)
- If unsure or token doesn't exist on network, return found: false`
          }
        ],
        maxTokens: 300,
        temperature: 0.1
      });

      console.log(`🔍 [TOKEN_RESOLVER] OpenAI response:`, text);

      // Parse the JSON response
      let result: TokenResolutionResult;
      try {
        const parsed = JSON.parse(text);

        if (parsed.found) {
          result = {
            found: true,
            token: {
              symbol: parsed.symbol || tokenSymbol.toUpperCase(),
              name: parsed.name || '',
              address: parsed.address,
              decimals: parsed.decimals || 18,
              network: network,
              isValid: this.isValidAddress(parsed.address),
              confidence: parsed.confidence || 0
            },
            reason: parsed.reason || 'Token found via OpenAI',
            networkUsed: network
          };

          // Additional validation
          if (!result.token?.isValid || result.token.confidence < 70) {
            result = {
              found: false,
              reason: `Low confidence (${result.token?.confidence}%) or invalid address format`,
              networkUsed: network
            };
          }
        } else {
          result = {
            found: false,
            reason: parsed.reason || 'Token not found on this network',
            networkUsed: network
          };
        }

      } catch (parseError) {
        console.error(`🔍 [TOKEN_RESOLVER] Failed to parse OpenAI response:`, parseError);
        result = {
          found: false,
          reason: 'Failed to parse token information',
          networkUsed: network
        };
      }

      console.log(`🔍 [TOKEN_RESOLVER] Final result for ${tokenSymbol} on ${network.name}:`, {
        found: result.found,
        address: result.token?.address,
        confidence: result.token?.confidence,
        reason: result.reason
      });

      return result;

    } catch (error) {
      console.error(`🔍 [TOKEN_RESOLVER] Error resolving token ${tokenSymbol} on ${network.name}:`, error);

      const fallbackResult = {
        found: false,
        reason: 'API error during token resolution',
        networkUsed: network
      };

      return fallbackResult;
    }
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