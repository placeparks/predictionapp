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
      throw new Error(`BaseScan API error: ${data.message || "Unknown error"}`);
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
  fetch: (dateStr: string) => Promise<ProviderResult<number>>;
  fallback?: (dateStr: string) => Promise<ProviderResult<number>>;
}

export const MARKET_FETCHERS: Record<string, MarketDataFetcher> = {
  "active-addresses": {
    provider: "basescan",
    fetch: async (dateStr: string) => {
      if (!baseScan) {
        return { success: false, error: "BASESCAN_API_KEY missing", source: "basescan" };
      }
      return baseScan.getDailyNewAddresses(dateStr);
    },
  },
  "total-transactions": {
    provider: "basescan",
    fetch: async (dateStr: string) => {
      if (!baseScan) {
        return { success: false, error: "BASESCAN_API_KEY missing", source: "basescan" };
      }
      return baseScan.getDailyTransactionCount(dateStr);
    },
  },
  "avg-gas-price": {
    provider: "basescan",
    fetch: async (dateStr: string) => {
      if (!baseScan) {
        return { success: false, error: "BASESCAN_API_KEY missing", source: "basescan" };
      }
      return baseScan.getDailyAvgGasPrice(dateStr);
    },
  },
  "new-contracts": {
    provider: "basescan",
    fetch: async (dateStr: string) => {
      if (!baseScan) {
        return { success: false, error: "BASESCAN_API_KEY missing", source: "basescan" };
      }
      return baseScan.getDailyNewContracts(dateStr);
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

export async function fetchBaseMetricsForDate(dateStr: string): Promise<{
  metrics: Record<string, number | null>;
  sources: Record<string, DataProvider>;
  errors: Record<string, string>;
}> {
  const metrics: Record<string, number | null> = {};
  const sources: Record<string, DataProvider> = {};
  const errors: Record<string, string> = {};

  await Promise.all(
    Object.entries(MARKET_FETCHERS).map(async ([marketId, fetcher]) => {
      try {
        const result = await fetcher.fetch(dateStr);
        sources[marketId] = result.source;

        if (result.success && result.data !== undefined) {
          metrics[marketId] = result.data;
        } else {
          metrics[marketId] = null;
          if (result.error) errors[marketId] = result.error;

          if (fetcher.fallback) {
            const fb = await fetcher.fallback(dateStr);
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
