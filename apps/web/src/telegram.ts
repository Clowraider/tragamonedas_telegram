/**
 * Telegram WebApp integration and environment detection.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    query_id?: string;
  };
  version?: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  headerColor?: string;
  backgroundColor?: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback?: {
    impactOccurred: (
      style: "light" | "medium" | "heavy" | "rigid" | "soft",
    ) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/**
 * Access the Telegram WebApp global object if available.
 */
export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.Telegram?.WebApp ?? null;
}

/**
 * Extract raw Telegram initData from WebApp SDK or URL search params.
 */
export function getTelegramInitData(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  // 1. Direct WebApp object
  const webApp = getTelegramWebApp();
  if (webApp?.initData && webApp.initData.trim().length > 0) {
    return webApp.initData;
  }

  // 2. URL search params fallback (tgWebAppData)
  try {
    const url = new URL(window.location.href);
    const tgWebAppData =
      url.searchParams.get("tgWebAppData") ||
      url.searchParams.get("initData") ||
      new URLSearchParams(url.hash.replace(/^#/, "")).get("tgWebAppData");

    if (tgWebAppData && tgWebAppData.trim().length > 0) {
      return tgWebAppData;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return null;
}

/**
 * Determine if running inside a validated Telegram WebApp container.
 */
export function isTelegramEnvironment(): boolean {
  const initData = getTelegramInitData();
  const webApp = getTelegramWebApp();
  return Boolean(initData || (webApp && webApp.platform !== "unknown"));
}

/**
 * Safely initialize Telegram WebApp view (ready & expand).
 */
export function initTelegramApp(): void {
  const webApp = getTelegramWebApp();
  if (webApp) {
    try {
      webApp.ready();
      webApp.expand();
    } catch {
      // Ignore errors in non-standard environments
    }
  }
}

/**
 * Trigger haptic feedback safely.
 */
export function triggerHaptic(
  type: "impact" | "win" | "error",
  style: "light" | "medium" | "heavy" = "medium",
): void {
  const haptic = getTelegramWebApp()?.HapticFeedback;
  if (!haptic) return;

  try {
    if (type === "impact") {
      haptic.impactOccurred(style);
    } else if (type === "win") {
      haptic.notificationOccurred("success");
    } else if (type === "error") {
      haptic.notificationOccurred("error");
    }
  } catch {
    // Ignore haptic errors
  }
}
