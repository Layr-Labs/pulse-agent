import * as cron from 'node-cron';
import { database } from './database';
import { executeSell } from './trading';
import { TRADING_CONFIG } from '@/config/trading';

export class TradingScheduler {
  private sellCheckJob: cron.ScheduledTask | null = null;

  start() {
    console.log('Starting trading scheduler...');

    // Check for positions to sell every 5 minutes
    this.sellCheckJob = cron.schedule('*/5 * * * *', async () => {
      await this.checkPositionsToSell();
    });

    console.log('Trading scheduler started - checking for positions to sell every 5 minutes');
  }

  stop() {
    if (this.sellCheckJob) {
      this.sellCheckJob.stop();
      this.sellCheckJob = null;
      console.log('Trading scheduler stopped');
    }
  }

  private async checkPositionsToSell() {
    try {
      const holdingPositions = await database.getHoldingPositions();

      if (holdingPositions.length === 0) {
        return; // No positions to check
      }

      console.log(`Checking ${holdingPositions.length} positions for sell conditions`);

      for (const position of holdingPositions) {
        const holdDurationMs = TRADING_CONFIG.holdDurationHours * 60 * 60 * 1000;
        const timeSincePurchase = Date.now() - position.purchaseTime.getTime();

        if (timeSincePurchase >= holdDurationMs) {
          console.log(`Position ${position.id} (${position.token}) has reached ${TRADING_CONFIG.holdDurationHours}h hold time, executing sell`);

          try {
            await executeSell(position);
            console.log(`Successfully sold position ${position.id}`);
          } catch (error) {
            console.error(`Failed to sell position ${position.id}:`, error);
          }
        } else {
          const remainingHours = (holdDurationMs - timeSincePurchase) / (60 * 60 * 1000);
          console.log(`Position ${position.id} (${position.token}) has ${remainingHours.toFixed(1)}h remaining before sell`);
        }
      }
    } catch (error) {
      console.error('Error checking positions to sell:', error);
    }
  }

  // Method to manually trigger position checks (useful for testing)
  async manualCheck() {
    console.log('Running manual position check...');
    await this.checkPositionsToSell();
  }

  // Get status of current positions
  async getPositionsSummary() {
    try {
      const positions = await database.getHoldingPositions();

      const summary = {
        totalPositions: positions.length,
        totalValue: 0,
        positions: positions.map(pos => ({
          id: pos.id,
          token: pos.token,
          influencer: pos.influencer,
          purchaseTime: pos.purchaseTime,
          amount: pos.amount,
          hoursHeld: (Date.now() - pos.purchaseTime.getTime()) / (60 * 60 * 1000),
          hoursRemaining: Math.max(0, TRADING_CONFIG.holdDurationHours - (Date.now() - pos.purchaseTime.getTime()) / (60 * 60 * 1000))
        }))
      };

      summary.totalValue = summary.positions.reduce((total, pos) => total + (pos.amount || 0), 0);

      return summary;
    } catch (error) {
      console.error('Error getting positions summary:', error);
      throw error;
    }
  }
}

export const tradingScheduler = new TradingScheduler();