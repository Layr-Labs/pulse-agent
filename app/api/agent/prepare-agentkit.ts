import {
  AgentKit,
  cdpApiActionProvider,
  erc20ActionProvider,
  pythActionProvider,
  CdpSmartWalletProvider,
  CdpEvmWalletProvider,
  walletActionProvider,
  WalletProvider,
  wethActionProvider,
} from "@coinbase/agentkit";
import * as fs from "fs";
import { Address, Hex, LocalAccount } from "viem";
import { networkConfig } from "@/lib/networkConfig";

/**
 * AgentKit Integration Route
 *
 * This file is your gateway to integrating AgentKit with your product.
 * It defines the core capabilities of your agent through WalletProvider
 * and ActionProvider configuration.
 *
 * Key Components:
 * 1. WalletProvider Setup:
 *    - Configures the blockchain wallet integration
 *    - Learn more: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#evm-wallet-providers
 *
 * 2. ActionProviders Setup:
 *    - Defines the specific actions your agent can perform
 *    - Choose from built-in providers or create custom ones:
 *      - Built-in: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#action-providers
 *      - Custom: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#creating-an-action-provider
 *
 * # Next Steps:
 * - Explore the AgentKit README: https://github.com/coinbase/agentkit
 * - Experiment with different LLM configurations
 * - Fine-tune agent parameters for your use case
 *
 * ## Want to contribute?
 * Join us in shaping AgentKit! Check out the contribution guide:
 * - https://github.com/coinbase/agentkit/blob/main/CONTRIBUTING.md
 * - https://discord.gg/CDP
 */

// Configure a file to persist the agent's Smart Wallet + Private Key data
const WALLET_DATA_FILE = "wallet_data.txt";

type WalletData = {
  privateKey?: Hex;
  smartWalletAddress: Address;
  ownerAddress?: Address;
};



/**
 * Prepares the AgentKit and WalletProvider.
 *
 * @function prepareAgentkitAndWalletProvider
 * @param {string} [networkId] - Optional network ID to use. If not provided, uses primary network.
 * @returns {Promise<{ agentkit: AgentKit, walletProvider: WalletProvider }>} The initialized AI agent.
 *
 * @description Handles agent setup
 *
 * @throws {Error} If the agent initialization fails.
 */
export async function prepareAgentkitAndWalletProvider(networkId?: string): Promise<{
  agentkit: AgentKit;
  walletProvider: WalletProvider;
}> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error(
      "I need both CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file to connect to the Coinbase Developer Platform.",
    );
  }

  let walletData: WalletData | null = null;
  let owner: Hex | LocalAccount | undefined = undefined;

  // Read existing wallet data if available
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")) as WalletData;
      if (walletData.ownerAddress) {
        owner = walletData.ownerAddress;
      } else {
        console.log(
          `No ownerAddress found in ${WALLET_DATA_FILE}, will use default CDP server account as owner`,
        );
      }
    } catch (error) {
      console.error("Error reading wallet data:", error);
    }
  }

  try {
    // Determine which network to use
    const targetNetworkId = networkId || networkConfig.getPrimaryNetwork().id;
    const targetNetwork = networkConfig.getNetworkById(targetNetworkId);

    if (!targetNetwork) {
      throw new Error(`Network ${targetNetworkId} not found in configuration`);
    }

    console.log(`🔍 [AGENTKIT] Initializing AgentKit for network: ${targetNetwork.name} (${targetNetworkId})`);

    let walletProvider: WalletProvider;

    // Use appropriate CDP wallet provider based on network type
    if (targetNetwork.chainType === 'base') {
      // Use CDP Smart Wallet Provider for Base networks (supports smart wallet features)
      console.log(`🔍 [AGENTKIT] Using CDP Smart Wallet Provider for ${targetNetwork.name}`);
      walletProvider = await CdpSmartWalletProvider.configureWithWallet({
        apiKeyId: process.env.CDP_API_KEY_ID,
        apiKeySecret: process.env.CDP_API_KEY_SECRET,
        walletSecret: process.env.CDP_WALLET_SECRET,
        networkId: targetNetworkId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        owner: owner as any,
        address: walletData?.smartWalletAddress,
        idempotencyKey: process.env.IDEMPOTENCY_KEY,
      });
    } else {
      // Use CDP EVM Wallet Provider for Ethereum networks (CDP v2 API)
      console.log(`🔍 [AGENTKIT] Using CDP EVM Wallet Provider for ${targetNetwork.name}`);

      // Use environment variable for custom Ethereum address if specified
      const customEthAddress = process.env.ETHEREUM_WALLET_ADDRESS;
      console.log(`🔍 [AGENTKIT] Environment ETHEREUM_WALLET_ADDRESS: ${customEthAddress || 'NOT SET'}`);
      if (customEthAddress) {
        console.log(`🔍 [AGENTKIT] Using custom Ethereum address: ${customEthAddress}`);
      } else {
        console.log(`🔍 [AGENTKIT] No custom Ethereum address set, will create new wallet`);
      }

      try {
        const walletConfig: any = {
          apiKeyId: process.env.CDP_API_KEY_ID,
          apiKeySecret: process.env.CDP_API_KEY_SECRET,
          walletSecret: process.env.CDP_WALLET_SECRET,
          networkId: targetNetworkId,
        };

        // Only add address if custom address is specified
        if (customEthAddress) {
          walletConfig.address = customEthAddress as Address;
          console.log(`🔍 [AGENTKIT] Adding address to wallet config: ${customEthAddress}`);
        }

        console.log(`🔍 [AGENTKIT] Wallet config:`, { ...walletConfig, apiKeySecret: '[HIDDEN]' });

        walletProvider = await CdpEvmWalletProvider.configureWithWallet(walletConfig);
        console.log(`🔍 [AGENTKIT] Successfully configured CDP EVM Wallet for ${targetNetwork.name}`);

        // Log the actual wallet address being used
        const actualAddress = await walletProvider.getAddress();
        console.log(`🔍 [AGENTKIT] Actual wallet address being used: ${actualAddress}`);

      } catch (error) {
        console.log(`🔍 [AGENTKIT] Failed to configure CDP EVM Wallet:`, error);
        throw error;
      }
    }

    // Initialize AgentKit: https://docs.cdp.coinbase.com/agentkit/docs/agent-actions
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
      ],
    });

    // Save wallet data for CDP wallet providers
    if (!walletData) {
      try {
        // Only save wallet data for Base networks (Smart Wallet)
        if (targetNetwork.chainType === 'base') {
          const exportedWallet = await (walletProvider as any).exportWallet();
          fs.writeFileSync(
            WALLET_DATA_FILE,
            JSON.stringify({
              ownerAddress: exportedWallet.ownerAddress,
              smartWalletAddress: exportedWallet.address,
            } as WalletData),
          );
          console.log(`🔍 [AGENTKIT] Saved wallet data for ${targetNetwork.name}`);
        } else {
          console.log(`🔍 [AGENTKIT] EVM Wallet configured - address will be different from Base Smart Wallet`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`🔍 [AGENTKIT] Could not export wallet data:`, errorMessage);
      }
    }

    return { agentkit, walletProvider };
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
