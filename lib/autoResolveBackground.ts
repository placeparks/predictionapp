/**
 * Background auto-resolve service for local development
 * This runs automatically when the dev server starts
 */

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

async function checkAndResolve() {
  if (isRunning) return; // Prevent concurrent runs
  isRunning = true;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const adminKey =
      process.env.BASE_DAILY_ADMIN_KEY ||
      process.env.ADMIN_API_KEY ||
      "";

    if (!adminKey) {
      console.log("[auto-resolve] Admin key not set, skipping auto-resolve");
      return;
    }

    const response = await fetch(`${baseUrl}/api/base-daily/auto-resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      if (data.skipped) {
        // Silently skip if already resolved
      } else {
        console.log(
          `[auto-resolve] ✅ Resolved session ${data.sessionId}: ${data.summary?.successful || 0} successful`
        );
      }
    }
  } catch {
    // Silently fail in background
  } finally {
    isRunning = false;
  }
}

export function startAutoResolve() {
  // Only run in development
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Only run if not already started
  if (intervalId !== null) {
    return;
  }

  console.log("[auto-resolve] 🚀 Background auto-resolve started (checking every 30s)");

  // Run immediately on start
  void checkAndResolve();

  // Then run on interval
  intervalId = setInterval(checkAndResolve, CHECK_INTERVAL_MS);
}

export function stopAutoResolve() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[auto-resolve] 🛑 Background auto-resolve stopped");
  }
}

