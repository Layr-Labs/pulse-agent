"use client";

import TradingControls from "./components/TradingControls";
import InfluencerList from "./components/InfluencerList";

/**
 * Trading Agent Dashboard
 *
 * @returns {React.ReactNode} The trading agent interface
 */
export default function Home() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Hero Section */}
      {/* <div className="text-center space-y-6 mb-12">
        <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Advanced on-chain trading powered by real-time sentiment analysis.
        </p>
      </div> */}

      {/* Influencer Monitoring Section */}
      <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
        <InfluencerList />
      </div>

      {/* Main Trading Interface */}
      <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <TradingControls />
      </div>
    </div>
  );
}
