import { database } from './database';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { TRADING_CONFIG } from '@/config/trading';
import { privateKeyToAccount } from 'viem/accounts';
import type { PositionSummary } from '@/types/tradingStatus';

export class TradingScheduler {
  private priceInfoClientPromise: Promise<InfoClient> | null = null;
  private hyperliquidAddress: string | null = null;

  start() {
    console.log('Trading scheduler initialized (auto-sell disabled).');
  }

  stop() {
    console.log('Trading scheduler stopped.');
  }

  private async getPriceInfoClient() {
    if (!this.priceInfoClientPromise) {
      this.priceInfoClientPromise = (async () => {
        const transport = new HttpTransport({
          isTestnet: TRADING_CONFIG.hyperliquid.environment !== 'mainnet',
          fetchOptions: { keepalive: false }
        });
        return new InfoClient({ transport });
      })();
    }
    return this.priceInfoClientPromise;
  }

  private getHyperliquidAddress(): string | null {
    if (this.hyperliquidAddress !== null) {
      return this.hyperliquidAddress;
    }

    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      console.warn('HYPERLIQUID_PRIVATE_KEY is not set; unable to sync remote positions.');
      this.hyperliquidAddress = null;
      return null;
    }

    try {
      const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const account = privateKeyToAccount(normalized as `0x${string}`);
      this.hyperliquidAddress = account.address;
      return this.hyperliquidAddress;
    } catch (error) {
      console.error('Failed to derive Hyperliquid address from private key:', error);
      this.hyperliquidAddress = null;
      return null;
    }
  }

  private async getMarketPrices(tokens: string[]) {
    const uniqueSymbols = Array.from(new Set(tokens.map(token => token.toUpperCase())));
    if (!uniqueSymbols.length) {
      return {};
    }

    try {
      const infoClient = await this.getPriceInfoClient();
      const mids = await infoClient.allMids();

      return uniqueSymbols.reduce<Record<string, number>>((acc, symbol) => {
        const price = mids?.[symbol];
        if (price !== undefined) {
          acc[symbol] = typeof price === 'string' ? parseFloat(price) : Number(price);
        }
        return acc;
      }, {});
    } catch (error) {
      console.error('Error fetching market prices from Hyperliquid:', error);
      return {};
    }
  }

  /**
   * Fetch all positions directly from Hyperliquid API
   * Returns a map of token -> position data
   */
  private async getHyperliquidPositions(): Promise<Map<string, { size: number; entryPrice: number | null }>> {
    const address = this.getHyperliquidAddress();
    if (!address) {
      console.log('🔍 [POSITIONS] No Hyperliquid address configured');
      return new Map();
    }

    try {
      console.log('🔍 [POSITIONS] Fetching positions from Hyperliquid API...');
      const infoClient = await this.getPriceInfoClient();
      const state = await infoClient.clearinghouseState({ user: address });
      const assetPositions = state?.assetPositions ?? [];

      const positionMap = new Map<string, { size: number; entryPrice: number | null }>();

      for (const { position } of assetPositions) {
        const token = position.coin.toUpperCase();
        const size = Number(position.szi);
        
        if (!Number.isFinite(size) || size === 0) {
          continue;
        }

        const entryPrice = position.entryPx ? Number(position.entryPx) : null;
        positionMap.set(token, { size, entryPrice });
      }

      console.log(`🔍 [POSITIONS] Found ${positionMap.size} active positions on Hyperliquid:`, 
        Array.from(positionMap.keys()).join(', ') || 'none');

      return positionMap;
    } catch (error) {
      console.error('❌ [POSITIONS] Error fetching Hyperliquid positions:', error);
      return new Map();
    }
  }

  /**
   * Get positions summary - uses Hyperliquid API as source of truth
   * Also includes recently executed trades that may not yet be reflected on Hyperliquid
   */
  async getPositionsSummary() {
    try {
      // Step 1: Get actual positions from Hyperliquid (source of truth)
      const hyperliquidPositions = await this.getHyperliquidPositions();
      
      // Step 2: Get local database records for metadata (influencer, tweet, etc.)
      const dbPositions = await database.getHoldingPositions();
      const dbPositionsByToken = new Map(
        dbPositions.map(pos => [pos.token.toUpperCase(), pos])
      );

      // Step 3: Build positions list
      const positions: PositionSummary[] = [];
      const includedTokens = new Set<string>();

      // First, add all positions from Hyperliquid
      for (const [token, { size }] of hyperliquidPositions) {
        includedTokens.add(token);
        const dbRecord = dbPositionsByToken.get(token);
        
        if (dbRecord) {
          // We have local metadata for this position
          const hoursHeld = (Date.now() - dbRecord.purchaseTime.getTime()) / (60 * 60 * 1000);
          positions.push({
            id: dbRecord.id,
            token,
            influencer: dbRecord.influencer,
            purchaseTime: dbRecord.purchaseTime?.toISOString?.() ?? null,
            amount: size, // Use actual size from Hyperliquid
            hoursHeld,
            profileImageUrl: dbRecord.profileImageUrl,
            marketPriceUsd: null,
            source: 'local'
          });
        } else {
          // Position exists on Hyperliquid but not in our database (manually opened or synced)
          positions.push({
            id: `hyperliquid-${token}`,
            token,
            influencer: 'synced',
            purchaseTime: null,
            amount: size,
            hoursHeld: null,
            marketPriceUsd: null,
            source: 'synced' as const
          });
        }
      }

      // Step 4: Add recent database positions not yet on Hyperliquid (just executed)
      // This ensures newly executed trades show up immediately
      const RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();

      for (const dbPos of dbPositions) {
        const token = dbPos.token.toUpperCase();
        if (includedTokens.has(token)) continue; // Already included from Hyperliquid

        const ageMs = now - dbPos.purchaseTime.getTime();
        if (ageMs < RECENT_THRESHOLD_MS) {
          // Recent position - show it even if not yet on Hyperliquid
          const hoursHeld = ageMs / (60 * 60 * 1000);
          positions.push({
            id: dbPos.id,
            token,
            influencer: dbPos.influencer,
            purchaseTime: dbPos.purchaseTime?.toISOString?.() ?? null,
            amount: dbPos.amount,
            hoursHeld,
            profileImageUrl: dbPos.profileImageUrl,
            marketPriceUsd: null,
            source: 'pending' // Mark as pending Hyperliquid confirmation
          });
          console.log(`🔍 [POSITIONS] Including recent position ${token} (${Math.round(ageMs / 1000)}s old, pending Hyperliquid confirmation)`);
          includedTokens.add(token);
        }
      }

      // Step 5: Fetch current market prices
      const priceMap = await this.getMarketPrices(positions.map(pos => pos.token));
      const enrichedPositions = positions.map(pos => ({
        ...pos,
        marketPriceUsd: priceMap[pos.token.toUpperCase()] ?? null
      }));

      console.log(`🔍 [POSITIONS] Returning ${enrichedPositions.length} positions`);

      return {
        totalPositions: enrichedPositions.length,
        totalValue: enrichedPositions.reduce((total, pos) => total + (pos.amount || 0), 0),
        positions: enrichedPositions
      };
    } catch (error) {
      console.error('Error getting positions summary:', error);
      throw error;
    }
  }
}

export const tradingScheduler = new TradingScheduler();
