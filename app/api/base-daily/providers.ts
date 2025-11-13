// app/api/base-daily/providers.ts

export type DataProvider = "basescan" | "defillama" | "reservoir" | "alchemy" | "none";

// BaseScan API response item type
type BaseScanResponseItem = Record<string, unknown>;

export interface ProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: DataProvider;
}

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";

// Alchemy Provider for Base metrics
export class AlchemyProvider {
  private apiKey: string;
  private rpcUrl: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("ALCHEMY_API_KEY not configured");
    }
    this.apiKey = apiKey;
    // Use Base Mainnet for daily metrics
    this.rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
  }

  private async rpcCall(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Alchemy RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Alchemy RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  /**
   * Get block numbers for a date range by binary searching blocks
   * Returns the first block at or after startTimestamp and last block before endTimestamp
   */
  async getBlockRangeForDate(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<ProviderResult<{ startBlock: number; endBlock: number }>> {
    try {
      // Get latest block
      const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
      const latestBlock = parseInt(latestBlockHex, 16);
      
      // Get latest block timestamp to check if date is in the future
      const latestBlockData = await this.rpcCall("eth_getBlockByNumber", [
        `0x${latestBlock.toString(16)}`,
        false,
      ]) as { timestamp?: string };
      
      const latestTimestamp = latestBlockData.timestamp 
        ? parseInt(latestBlockData.timestamp, 16) 
        : Math.floor(Date.now() / 1000);
      
      if (startTimestamp > latestTimestamp) {
        return { 
          success: false, 
          error: "Date is in the future", 
          source: "alchemy" 
        };
      }

      // Binary search for start block (first block >= startTimestamp)
      // Calculate a wider search range based on how far back the date is
      const daysAgo = Math.floor((latestTimestamp - startTimestamp) / 86400);
      const blocksPerDay = 43200; // Base has ~2 second blocks
      const estimatedBlocksAgo = daysAgo * blocksPerDay;
      // Search range: from estimated position ±2 days worth of blocks for safety
      const searchRange = Math.max(100000, estimatedBlocksAgo + (2 * blocksPerDay));
      let low = Math.max(0, latestBlock - searchRange);
      let high = latestBlock;
      let startBlock = latestBlock;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const blockData = await this.rpcCall("eth_getBlockByNumber", [
          `0x${mid.toString(16)}`,
          false,
        ]) as { timestamp?: string };
        
        const blockTime = blockData.timestamp ? parseInt(blockData.timestamp, 16) : 0;
        
        if (blockTime >= startTimestamp) {
          startBlock = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      // Binary search for end block (last block < endTimestamp)
      low = startBlock;
      high = latestBlock;
      let endBlock = startBlock;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const blockData = await this.rpcCall("eth_getBlockByNumber", [
          `0x${mid.toString(16)}`,
          false,
        ]) as { timestamp?: string };
        
        const blockTime = blockData.timestamp ? parseInt(blockData.timestamp, 16) : 0;
        
        if (blockTime < endTimestamp) {
          endBlock = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return { 
        success: true, 
        data: { startBlock, endBlock }, 
        source: "alchemy" 
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "alchemy" };
    }
  }

  async getDailyTransactionCount(
    dateStr: string,
    startBlock?: number | null,
    endBlock?: number | null
  ): Promise<ProviderResult<number>> {
    try {
      // Parse date
      const date = new Date(`${dateStr}T00:00:00Z`);
      const startTimestamp = Math.floor(date.getTime() / 1000);
      const endTimestamp = startTimestamp + 86400; // 24 hours

      // Use provided block numbers if available, otherwise estimate
      let useStartBlock: number;
      let useEndBlock: number;
      
      if (startBlock != null && endBlock != null) {
        // Use saved block numbers (most accurate)
        useStartBlock = startBlock;
        useEndBlock = endBlock;
      } else {
        // Fallback to estimation
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const daysSinceDate = Math.floor((Date.now() / 1000 - startTimestamp) / 86400);
        useStartBlock = Math.max(0, latestBlock - (daysSinceDate * blocksPerDay) - blocksPerDay);
        useEndBlock = useStartBlock + blocksPerDay;
      }

      // Get latest block for bounds checking
      const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
      const latestBlock = parseInt(latestBlockHex, 16);

      // Sample blocks across the day to estimate transaction count
      const sampleCount = 30;
      const blockStep = Math.max(1, Math.floor((useEndBlock - useStartBlock) / sampleCount));
      let totalTxCount = 0;
      let validSamples = 0;

      for (let i = 0; i < sampleCount; i++) {
        const blockNum = useStartBlock + (i * blockStep);
        if (blockNum > latestBlock) break;

        try {
          const block = await this.rpcCall("eth_getBlockByNumber", [
            `0x${blockNum.toString(16)}`,
            false, // Don't include full transaction details
          ]) as { transactions?: string[]; timestamp?: string };

          if (block?.transactions) {
            const blockTime = block.timestamp ? parseInt(block.timestamp, 16) : null;
            // Only count if block is within our date range
            if (!blockTime || (blockTime >= startTimestamp && blockTime < endTimestamp)) {
              totalTxCount += block.transactions.length;
              validSamples++;
            }
          }
        } catch (e) {
          console.warn(`[Alchemy] Failed to fetch block ${blockNum}:`, e);
        }
      }

      if (validSamples === 0) {
        return { success: false, error: "No valid blocks found for date", source: "alchemy" };
      }

      // Extrapolate from sample to full day
      const avgTxPerBlock = totalTxCount / validSamples;
      const blocksPerDay = useEndBlock - useStartBlock;
      const estimatedDailyTx = Math.floor(avgTxPerBlock * blocksPerDay);

      return { success: true, data: estimatedDailyTx, source: "alchemy" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "alchemy" };
    }
  }

  async getDailyNewAddresses(
    dateStr: string,
    startBlock?: number | null,
    endBlock?: number | null
  ): Promise<ProviderResult<number>> {
    try {
      // Use Alchemy's getAssetTransfers to count unique addresses
      const date = new Date(`${dateStr}T00:00:00Z`);
      const startTimestamp = Math.floor(date.getTime() / 1000);
      const endTimestamp = startTimestamp + 86400;

      // Use provided block numbers if available, otherwise estimate
      let useStartBlock: string;
      let useEndBlock: string;
      
      if (startBlock != null && endBlock != null) {
        // Use saved block numbers (most accurate)
        useStartBlock = `0x${startBlock.toString(16)}`;
        useEndBlock = `0x${endBlock.toString(16)}`;
      } else {
        // Fallback to estimation
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const daysSinceDate = Math.floor((Date.now() / 1000 - startTimestamp) / 86400);
        const estimatedStartBlock = Math.max(0, latestBlock - (daysSinceDate * blocksPerDay) - blocksPerDay);
        const estimatedEndBlock = estimatedStartBlock + blocksPerDay;
        useStartBlock = `0x${estimatedStartBlock.toString(16)}`;
        useEndBlock = `0x${estimatedEndBlock.toString(16)}`;
      }

      // Get transfers for the day with pagination
      // If we have saved block numbers, use them directly (no expansion needed)
      // Otherwise, expand the range for safety
      const now = Math.floor(Date.now() / 1000);
      const isTodayOrFuture = startTimestamp >= now - 86400; // Within last 24 hours
      
      let finalStartBlock: string;
      let finalEndBlock: string;
      
      if (startBlock != null && endBlock != null) {
        // Use saved blocks directly - they're already accurate
        finalStartBlock = useStartBlock;
        finalEndBlock = useEndBlock;
      } else if (isTodayOrFuture) {
        // For today/future, use latest
        finalStartBlock = "0x0";
        finalEndBlock = "latest";
      } else {
        // For past dates without saved blocks, expand range slightly for safety
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const parsedStart = parseInt(useStartBlock, 16);
        const parsedEnd = parseInt(useEndBlock, 16);
        finalStartBlock = `0x${Math.max(0, parsedStart - blocksPerDay).toString(16)}`;
        finalEndBlock = `0x${Math.min(latestBlock, parsedEnd + blocksPerDay).toString(16)}`;
      }
      
      const uniqueAddresses = new Set<string>();
      let pageKey: string | undefined = undefined;
      let maxPages = 50; // Increased limit for more complete data
      let totalTransfers = 0;
      let transfersInRange = 0;

      do {
        const params: Record<string, unknown> = {
          fromBlock: finalStartBlock,
          toBlock: finalEndBlock,
          category: ["external", "erc20", "erc721", "erc1155"],
          withMetadata: true,
          maxCount: "0x3e8", // 1000 transfers per page
        };
        if (pageKey) params.pageKey = pageKey;

        const result = await this.rpcCall("alchemy_getAssetTransfers", [params]) as {
          transfers?: Array<{ from?: string; to?: string; metadata?: { blockTimestamp?: string } }>;
          pageKey?: string;
        };

        if (result?.transfers) {
          totalTransfers += result.transfers.length;
          const sampleTimestamps: number[] = [];
          for (const transfer of result.transfers) {
            const blockTime = transfer.metadata?.blockTimestamp 
              ? Math.floor(new Date(transfer.metadata.blockTimestamp).getTime() / 1000)
              : null;
            
            // Collect sample timestamps for debugging (first 5)
            if (blockTime && sampleTimestamps.length < 5) {
              sampleTimestamps.push(blockTime);
            }
            
            // Only count addresses within the target date range
            if (blockTime && blockTime >= startTimestamp && blockTime < endTimestamp) {
              transfersInRange++;
              if (transfer.from && transfer.from !== "0x0000000000000000000000000000000000000000") {
                uniqueAddresses.add(transfer.from.toLowerCase());
              }
              if (transfer.to && transfer.to !== "0x0000000000000000000000000000000000000000") {
                uniqueAddresses.add(transfer.to.toLowerCase());
              }
            }
          }
          
          // Log sample timestamps on first page to debug date range issues
          if (totalTransfers === result.transfers.length && sampleTimestamps.length > 0) {
            console.log(`[Alchemy] Sample timestamps from transfers: ${sampleTimestamps.join(', ')} (target range: ${startTimestamp}-${endTimestamp})`);
            console.log(`[Alchemy] Sample dates: ${sampleTimestamps.map(ts => new Date(ts * 1000).toISOString().split('T')[0]).join(', ')} (target: ${dateStr})`);
          }
        }

        pageKey = result?.pageKey;
        maxPages--;
      } while (pageKey && maxPages > 0);

      // If we got transfers but none in range, the date might be too far in the past
      // or the block range estimation is significantly off
      if (totalTransfers > 0 && transfersInRange === 0) {
        console.warn(`[Alchemy] Found ${totalTransfers} transfers but none in date range ${dateStr} (${startTimestamp}-${endTimestamp})`);
      }

      return { success: true, data: uniqueAddresses.size, source: "alchemy" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "alchemy" };
    }
  }

  async getDailyNewContracts(
    dateStr: string,
    startBlock?: number | null,
    endBlock?: number | null
  ): Promise<ProviderResult<number>> {
    try {
      // Count contract creations (transactions with to=null)
      const date = new Date(`${dateStr}T00:00:00Z`);
      const startTimestamp = Math.floor(date.getTime() / 1000);
      const endTimestamp = startTimestamp + 86400;

      // Use provided block numbers if available, otherwise estimate
      let useStartBlock: string;
      let useEndBlock: string;
      
      if (startBlock != null && endBlock != null) {
        // Use saved block numbers (most accurate)
        useStartBlock = `0x${startBlock.toString(16)}`;
        useEndBlock = `0x${endBlock.toString(16)}`;
      } else {
        // Fallback to estimation
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const daysSinceDate = Math.floor((Date.now() / 1000 - startTimestamp) / 86400);
        const estimatedStartBlock = Math.max(0, latestBlock - (daysSinceDate * blocksPerDay) - blocksPerDay);
        const estimatedEndBlock = estimatedStartBlock + blocksPerDay;
        useStartBlock = `0x${estimatedStartBlock.toString(16)}`;
        useEndBlock = `0x${estimatedEndBlock.toString(16)}`;
      }

      // Get transfers with pagination
      // If we have saved block numbers, use them directly
      const now = Math.floor(Date.now() / 1000);
      const isTodayOrFuture = startTimestamp >= now - 86400; // Within last 24 hours
      
      let finalStartBlock: string;
      let finalEndBlock: string;
      
      if (startBlock != null && endBlock != null) {
        // Use saved blocks directly - they're already accurate
        finalStartBlock = useStartBlock;
        finalEndBlock = useEndBlock;
      } else if (isTodayOrFuture) {
        // For today/future, use latest
        finalStartBlock = "0x0";
        finalEndBlock = "latest";
      } else {
        // For past dates without saved blocks, expand range slightly for safety
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const parsedStart = parseInt(useStartBlock, 16);
        const parsedEnd = parseInt(useEndBlock, 16);
        finalStartBlock = `0x${Math.max(0, parsedStart - blocksPerDay).toString(16)}`;
        finalEndBlock = `0x${Math.min(latestBlock, parsedEnd + blocksPerDay).toString(16)}`;
      }
      
      const uniqueContracts = new Set<string>();
      let pageKey: string | undefined = undefined;
      let maxPages = 50; // Increased limit for more complete data
      let totalTransfers = 0;
      let contractsInRange = 0;

      do {
        const params: Record<string, unknown> = {
          fromBlock: finalStartBlock,
          toBlock: finalEndBlock,
          category: ["external"],
          withMetadata: true,
          maxCount: "0x3e8",
        };
        if (pageKey) params.pageKey = pageKey;

        const result = await this.rpcCall("alchemy_getAssetTransfers", [params]) as {
          transfers?: Array<{ to?: string | null; hash?: string; metadata?: { blockTimestamp?: string } }>;
          pageKey?: string;
        };

        if (result?.transfers) {
          totalTransfers += result.transfers.length;
          for (const transfer of result.transfers) {
            const blockTime = transfer.metadata?.blockTimestamp 
              ? Math.floor(new Date(transfer.metadata.blockTimestamp).getTime() / 1000)
              : null;
            
            // Only count contracts within the target date range
            if (blockTime && blockTime >= startTimestamp && blockTime < endTimestamp) {
              // Contract creation: to is null or zero address
              // Use hash as unique identifier if available, otherwise use a combination
              if (!transfer.to || transfer.to === "0x0000000000000000000000000000000000000000") {
                contractsInRange++;
                const identifier = transfer.hash || `${blockTime}-${transfer.to || 'null'}`;
                uniqueContracts.add(identifier);
              }
            }
          }
        }

        pageKey = result?.pageKey;
        maxPages--;
      } while (pageKey && maxPages > 0);

      // If we got transfers but none in range, log a warning
      if (totalTransfers > 0 && contractsInRange === 0) {
        console.warn(`[Alchemy] Found ${totalTransfers} transfers but no contracts in date range ${dateStr}`);
      }

      return { success: true, data: uniqueContracts.size, source: "alchemy" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "alchemy" };
    }
  }

  async getDailyAvgGasPrice(
    dateStr: string,
    startBlock?: number | null,
    endBlock?: number | null
  ): Promise<ProviderResult<number>> {
    try {
      // Parse date
      const date = new Date(`${dateStr}T00:00:00Z`);
      const startTimestamp = Math.floor(date.getTime() / 1000);
      const endTimestamp = startTimestamp + 86400;

      // Use provided block numbers if available, otherwise estimate
      let useStartBlock: number;
      let useEndBlock: number;
      
      if (startBlock != null && endBlock != null) {
        // Use saved block numbers (most accurate)
        useStartBlock = startBlock;
        useEndBlock = endBlock;
      } else {
        // Fallback to estimation
        const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
        const latestBlock = parseInt(latestBlockHex, 16);
        const blocksPerDay = 43200;
        const daysSinceDate = Math.floor((Date.now() / 1000 - startTimestamp) / 86400);
        useStartBlock = Math.max(0, latestBlock - (daysSinceDate * blocksPerDay) - blocksPerDay);
        useEndBlock = useStartBlock + blocksPerDay;
      }

      // Get latest block for bounds checking
      const latestBlockHex = await this.rpcCall("eth_blockNumber", []) as string;
      const latestBlock = parseInt(latestBlockHex, 16);

      // Sample blocks across the day to get average gas price
      const sampleCount = 20;
      const blockStep = Math.max(1, Math.floor((useEndBlock - useStartBlock) / sampleCount));
      let totalGasPrice = 0;
      let validSamples = 0;

      for (let i = 0; i < sampleCount; i++) {
        const blockNum = useStartBlock + (i * blockStep);
        if (blockNum > latestBlock) break;

        try {
          const block = await this.rpcCall("eth_getBlockByNumber", [
            `0x${blockNum.toString(16)}`,
            false,
          ]) as { baseFeePerGas?: string; timestamp?: string };

          if (block?.baseFeePerGas) {
            const blockTime = block.timestamp ? parseInt(block.timestamp, 16) : null;
            // Only count if block is within our date range
            if (!blockTime || (blockTime >= startTimestamp && blockTime < endTimestamp)) {
              const gasPriceGwei = parseInt(block.baseFeePerGas, 16) / 1e9;
              totalGasPrice += gasPriceGwei;
              validSamples++;
            }
          }
        } catch (e) {
          console.warn(`[Alchemy] Failed to fetch gas price for block ${blockNum}:`, e);
        }
      }

      if (validSamples === 0) {
        return { success: false, error: "No valid gas price samples found", source: "alchemy" };
      }

      const avgGasPrice = totalGasPrice / validSamples;
      return { success: true, data: avgGasPrice, source: "alchemy" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "alchemy" };
    }
  }
}

// Single shared instance
const alchemy = ALCHEMY_API_KEY ? new AlchemyProvider(ALCHEMY_API_KEY) : null;

export class BaseScanProvider {
  private apiKey: string;
  private baseUrl = "https://api.basescan.org/api";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("BASESCAN_API_KEY not configured");
    }
    this.apiKey = apiKey;
  }

  private async call(
    action: string,
    params: Record<string, string>
  ): Promise<unknown> {
    const url = new URL(this.baseUrl);

    url.searchParams.set("module", params.module);
    url.searchParams.set("action", action);
    url.searchParams.set("apikey", this.apiKey);

    Object.entries(params).forEach(([key, value]) => {
      if (key !== "module" && value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`BaseScan API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.status !== "1") {
      const errorMsg = data.message || data.result || "Unknown error";
      console.error(`[BaseScan] API error for action ${action}:`, {
        status: data.status,
        message: errorMsg,
        params: params,
        fullResponse: data
      });
      throw new Error(`BaseScan API error: ${errorMsg}`);
    }

    return data.result;
  }

  // IMPORTANT: Confirm result field names with actual BaseScan docs / responses.
  async getDailyTransactionCount(dateStr: string): Promise<ProviderResult<number>> {
    try {
      const result = await this.call("dailytx", {
        module: "stats",
        startdate: dateStr,
        enddate: dateStr,
        sort: "asc",
      });

      let txCount = 0;

      if (Array.isArray(result)) {
        txCount = result.reduce((sum: number, item: BaseScanResponseItem) => {
          const raw = item.txCount ?? item.transactionCount;
          const count = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
          return sum + count;
        }, 0);
      } else if (result && typeof result === "object") {
        const resultObj = result as BaseScanResponseItem;
        const raw = resultObj.txCount ?? resultObj.transactionCount;
        txCount = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
      }

      return { success: true, data: txCount, source: "basescan" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "basescan" };
    }
  }

  async getDailyNewAddresses(dateStr: string): Promise<ProviderResult<number>> {
    try {
      const result = await this.call("dailynewaddress", {
        module: "stats",
        startdate: dateStr,
        enddate: dateStr,
        sort: "asc",
      });

      let addressCount = 0;

      if (Array.isArray(result)) {
        addressCount = result.reduce((sum: number, item: BaseScanResponseItem) => {
          const raw = item.newAddressCount ?? item.newAddress;
          const count = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
          return sum + count;
        }, 0);
      } else if (result && typeof result === "object") {
        const resultObj = result as BaseScanResponseItem;
        const raw = resultObj.newAddressCount ?? resultObj.newAddress;
        addressCount = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
      }

      return { success: true, data: addressCount, source: "basescan" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "basescan" };
    }
  }

  async getDailyNewContracts(dateStr: string): Promise<ProviderResult<number>> {
    try {
      const result = await this.call("dailynewcontracts", {
        module: "stats",
        startdate: dateStr,
        enddate: dateStr,
        sort: "asc",
      });

      let contractCount = 0;

      if (Array.isArray(result)) {
        contractCount = result.reduce((sum: number, item: BaseScanResponseItem) => {
          const raw = item.newContractCount ?? item.newContracts;
          const count = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
          return sum + count;
        }, 0);
      } else if (result && typeof result === "object") {
        const resultObj = result as BaseScanResponseItem;
        const raw = resultObj.newContractCount ?? resultObj.newContracts;
        contractCount = typeof raw === "string" ? parseInt(raw, 10) : (typeof raw === "number" ? raw : 0);
      }

      return { success: true, data: contractCount, source: "basescan" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "basescan" };
    }
  }

  async getDailyAvgGasPrice(dateStr: string): Promise<ProviderResult<number>> {
    try {
      const result = await this.call("dailyavggasprice", {
        module: "stats",
        startdate: dateStr,
        enddate: dateStr,
        sort: "asc",
      });

      let avgGasPrice = 0;

      if (Array.isArray(result)) {
        const prices = result
          .map((item: BaseScanResponseItem) => {
            const raw = item.avgGasPrice ?? item.averageGasPrice;
            return typeof raw === "string" ? parseFloat(raw) : (typeof raw === "number" ? raw : 0);
          })
          .filter((p: number) => p > 0);
        avgGasPrice =
          prices.length > 0
            ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length
            : 0;
      } else if (result && typeof result === "object") {
        const resultObj = result as BaseScanResponseItem;
        const raw = resultObj.avgGasPrice ?? resultObj.averageGasPrice;
        avgGasPrice = typeof raw === "string" ? parseFloat(raw) : (typeof raw === "number" ? raw : 0);
      }

      // Assume gwei unless docs say otherwise
      return { success: true, data: avgGasPrice, source: "basescan" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg, source: "basescan" };
    }
  }
}

// Single shared instance
const baseScan =
  BASESCAN_API_KEY ? new BaseScanProvider(BASESCAN_API_KEY) : null;

export interface MarketDataFetcher {
  provider: DataProvider;
  fetch: (dateStr: string, startBlock?: number | null, endBlock?: number | null) => Promise<ProviderResult<number>>;
  fallback?: (dateStr: string, startBlock?: number | null, endBlock?: number | null) => Promise<ProviderResult<number>>;
}

export const MARKET_FETCHERS: Record<string, MarketDataFetcher> = {
  "active-addresses": {
    provider: "alchemy",
    fetch: async (dateStr: string, startBlock?: number | null, endBlock?: number | null) => {
      // Try Alchemy first (more reliable)
      if (alchemy) {
        const result = await alchemy.getDailyNewAddresses(dateStr, startBlock, endBlock);
        if (result.success) return result;
      }
      // Fallback to BaseScan
      if (baseScan) {
        return baseScan.getDailyNewAddresses(dateStr);
      }
      return { success: false, error: "No API keys configured (ALCHEMY_API_KEY or BASESCAN_API_KEY)", source: "none" };
    },
  },
  "total-transactions": {
    provider: "alchemy",
    fetch: async (dateStr: string, startBlock?: number | null, endBlock?: number | null) => {
      // Try Alchemy first (more reliable)
      if (alchemy) {
        const result = await alchemy.getDailyTransactionCount(dateStr, startBlock, endBlock);
        if (result.success) return result;
      }
      // Fallback to BaseScan
      if (baseScan) {
        return baseScan.getDailyTransactionCount(dateStr);
      }
      return { success: false, error: "No API keys configured (ALCHEMY_API_KEY or BASESCAN_API_KEY)", source: "none" };
    },
  },
  "avg-gas-price": {
    provider: "alchemy",
    fetch: async (dateStr: string, startBlock?: number | null, endBlock?: number | null) => {
      // Try Alchemy first (more reliable)
      if (alchemy) {
        const result = await alchemy.getDailyAvgGasPrice(dateStr, startBlock, endBlock);
        if (result.success) return result;
      }
      // Fallback to BaseScan
      if (baseScan) {
        return baseScan.getDailyAvgGasPrice(dateStr);
      }
      return { success: false, error: "No API keys configured (ALCHEMY_API_KEY or BASESCAN_API_KEY)", source: "none" };
    },
  },
  "new-contracts": {
    provider: "alchemy",
    fetch: async (dateStr: string, startBlock?: number | null, endBlock?: number | null) => {
      // Try Alchemy first (more reliable)
      if (alchemy) {
        const result = await alchemy.getDailyNewContracts(dateStr, startBlock, endBlock);
        if (result.success) return result;
      }
      // Fallback to BaseScan
      if (baseScan) {
        return baseScan.getDailyNewContracts(dateStr);
      }
      return { success: false, error: "No API keys configured (ALCHEMY_API_KEY or BASESCAN_API_KEY)", source: "none" };
    },
  },
  "nft-mints": {
    provider: "reservoir",
    fetch: async (_dateStr: string) => {
      return {
        success: false,
        error: "Reservoir NFT mints not implemented",
        source: "reservoir",
      };
    },
  },
  "dex-volume": {
    provider: "defillama",
    fetch: async (_dateStr: string) => ({
      success: false,
      error: "DeFiLlama DEX volume not implemented",
      source: "defillama",
    }),
  },
  "net-bridge": {
    provider: "defillama",
    fetch: async (_dateStr: string) => ({
      success: false,
      error: "Bridge API not implemented",
      source: "defillama",
    }),
  },
  "tvl-growth": {
    provider: "defillama",
    fetch: async (_dateStr: string) => ({
      success: false,
      error: "DeFiLlama TVL not implemented",
      source: "defillama",
    }),
  },
  "average-confirmation": {
    provider: "none",
    fetch: async (_dateStr: string) => ({
      success: false,
      error: "Average confirmation not implemented",
      source: "none",
    }),
  },
  "gas-savings": {
    provider: "none",
    fetch: async (_dateStr: string) => ({
      success: false,
      error: "Gas savings not implemented",
      source: "none",
    }),
  },
};

export async function fetchBaseMetricsForDate(
  dateStr: string,
  startBlock?: number | null,
  endBlock?: number | null
): Promise<{
  metrics: Record<string, number | null>;
  sources: Record<string, DataProvider>;
  errors: Record<string, string>;
}> {
  const metrics: Record<string, number | null> = {};
  const sources: Record<string, DataProvider> = {};
  const errors: Record<string, string> = {};

  // Pass block numbers to all fetchers
  const blockStart = startBlock ?? null;
  const blockEnd = endBlock ?? null;

  await Promise.all(
    Object.entries(MARKET_FETCHERS).map(async ([marketId, fetcher]) => {
      try {
        const result = await fetcher.fetch(dateStr, blockStart, blockEnd);
        sources[marketId] = result.source;

        if (result.success && result.data !== undefined) {
          metrics[marketId] = result.data;
        } else {
          metrics[marketId] = null;
          if (result.error) errors[marketId] = result.error;

          if (fetcher.fallback) {
            const fb = await fetcher.fallback(dateStr, blockStart, blockEnd);
            if (fb.success && fb.data !== undefined) {
              metrics[marketId] = fb.data;
              sources[marketId] = fb.source;
              delete errors[marketId];
            }
          }
        }
      } catch (e) {
        metrics[marketId] = null;
        sources[marketId] = fetcher.provider;
        errors[marketId] = e instanceof Error ? e.message : String(e);
      }
    })
  );

  return { metrics, sources, errors };
}

