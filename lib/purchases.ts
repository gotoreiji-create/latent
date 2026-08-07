import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * SPEC §7.4 — RevenueCat.
 *
 * The key is public by design (it identifies the app, not the account) and is
 * read from `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, which Expo inlines at build
 * time. `.env` is gitignored.
 *
 * Configuration is skipped when no key is present. That is not a placeholder:
 * Play refuses to let you create subscription products until it has seen a
 * build containing the billing library, and the billing library arrives with
 * this package whether or not it is ever configured. So the SDK ships first,
 * the products are created second, and the key is filled in third.
 */

const KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/** The entitlement every paid card checks (§7.4). */
export const PRO = 'pro';

export function configurePurchases(): boolean {
  if (!KEY) return false;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: KEY });
    return true;
  } catch {
    // A billing SDK that fails to start must not take the portrait with it.
    return false;
  }
}

/** Whether this device currently has the paid entitlement. */
export async function hasPro(): Promise<boolean> {
  if (!KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PRO] !== undefined;
  } catch {
    return false;
  }
}
