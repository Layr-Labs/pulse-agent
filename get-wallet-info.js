// Script to get wallet information
require('dotenv').config();
const fs = require('fs');

const WALLET_DATA_FILE = "wallet_data.txt";

function getWalletInfo() {
  console.log('🔍 Wallet Information');
  console.log('====================');

  // Check environment
  console.log(`Network: ${process.env.NETWORK_ID || 'base-sepolia'}`);
  console.log(`CDP API Key ID: ${process.env.CDP_API_KEY_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`CDP API Secret: ${process.env.CDP_API_KEY_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`CDP Wallet Secret: ${process.env.CDP_WALLET_SECRET ? '✅ Set' : '❌ Missing'}`);

  // Check wallet file
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      const walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, 'utf8'));

      console.log('\n💼 Wallet Addresses:');
      console.log('==================');
      console.log(`Smart Wallet (Trading): ${walletData.smartWalletAddress}`);
      console.log(`Owner (Control):        ${walletData.ownerAddress}`);

      console.log('\n💰 To fund your wallet:');
      console.log('======================');
      console.log(`Send ETH to: ${walletData.smartWalletAddress}`);
      console.log(`Network: ${process.env.NETWORK_ID || 'base-sepolia'}`);

      if (process.env.NETWORK_ID === 'base-sepolia') {
        console.log('🧪 TESTNET - Get free testnet ETH from Base Sepolia faucet');
        console.log('   Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');
      } else if (process.env.NETWORK_ID === 'base-mainnet') {
        console.log('💸 MAINNET - Send real ETH to trade');
      }

      console.log('\n🔗 View on explorer:');
      console.log('===================');
      if (process.env.NETWORK_ID === 'base-mainnet') {
        console.log(`https://basescan.org/address/${walletData.smartWalletAddress}`);
      } else {
        console.log(`https://sepolia.basescan.org/address/${walletData.smartWalletAddress}`);
      }

    } catch (error) {
      console.error('❌ Error reading wallet data:', error.message);
    }
  } else {
    console.log('\n❌ Wallet not initialized yet');
    console.log('Run your trading agent first to create the wallet');
  }
}

getWalletInfo();