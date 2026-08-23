import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * SPEC §7 — RevenueCat.
 *
 * The key is public by design (it identifies the app, not the account) and is
 * read from `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, which Expo inlines at build
 * time. `.env` is gitignored. The secret is the Play service account JSON, and
 * that lives in RevenueCat's dashboard, never here.
 *
 * Every function degrades to "no subscription" rather than throwing. A billing
 * SDK that fails must never take the portrait down with it — the free card is
 * the product's front door (§6).
 */

const KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/** The entitlement every paid card checks (§7.4). */
export const PRO = 'pro';

export const billingConfigured = Boolean(KEY);

export function configurePurchases(): void {
  if (!KEY) return;
  try {
    // Verbose in release too, for now. The store returns nothing on a build
    // installed from Play and the reason is invisible without this — release
    // builds are the only ones where billing works at all, so they are the
    // only place the failure can be observed. Turn back down once purchases
    // are confirmed.
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: KEY });
  } catch {
    // Nothing to recover; hasPro() will simply keep answering false.
  }
}

/** Set when loadPlans fails, so the sheet can say what actually went wrong. */
let lastPlansError: string | null = null;

export function plansError(): string | null {
  return lastPlansError;
}

export async function hasPro(): Promise<boolean> {
  if (!KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PRO] !== undefined;
  } catch {
    return false;
  }
}

export type Plan = {
  pkg: PurchasesPackage;
  /** "$19.99" — already localised by the store. */
  price: string;
  /** Billing period as a word: "year" or "month". */
  period: string;
  /** Free trial length in days, when the offer carries one (§7.3). */
  trialDays: number | null;
};

function periodOf(pkg: PurchasesPackage): string {
  const unit = pkg.product.subscriptionPeriod ?? '';
  if (unit.endsWith('Y')) return 'year';
  if (unit.endsWith('M')) return 'month';
  if (unit.endsWith('W')) return 'week';
  return 'period';
}

function trialDaysOf(pkg: PurchasesPackage): number | null {
  const phases = pkg.product.defaultOption?.freePhase;
  const period = phases?.billingPeriod;
  if (!period) return null;
  if (period.unit === 'DAY') return period.value;
  if (period.unit === 'WEEK') return period.value * 7;
  if (period.unit === 'MONTH') return period.value * 30;
  return null;
}

/**
 * The plans to offer, annual first.
 *
 * §7.2 makes the annual plan the product: this app is opened about once a
 * month, so charging monthly for it invites cancellation, and a year is the
 * shortest span over which "how you changed" means anything. The monthly price
 * is deliberately steep so the annual one reads as the sensible choice.
 */
export async function loadPlans(): Promise<Plan[]> {
  if (!KEY) return [];
  try {
    // Play's billing client never gives up when it cannot resolve the app —
    // a build whose package name is not on the store, a device with no Play
    // Services — and the sheet would sit on a spinner for ever. Ten seconds is
    // long enough for a slow network and short enough to still be an answer.
    const offerings = await Promise.race([
      Purchases.getOfferings(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      ),
    ]);
    const packages = offerings.current?.availablePackages ?? [];
    if (packages.length === 0) {
      // Distinguish "RevenueCat has no current offering" from "the offering is
      // there but Play returned no product for it" — they need opposite fixes.
      const all = Object.keys(offerings.all ?? {});
      lastPlansError = offerings.current
        ? `offering "${offerings.current.identifier}" has no available packages (all: ${all.join(', ') || 'none'})`
        : `no current offering (all: ${all.join(', ') || 'none'})`;
      return [];
    }
    lastPlansError = null;
    return packages
      .map((pkg) => ({
        pkg,
        price: pkg.product.priceString,
        period: periodOf(pkg),
        trialDays: trialDaysOf(pkg),
      }))
      .sort((a, b) => (a.period === 'year' ? -1 : b.period === 'year' ? 1 : 0));
  } catch (e) {
    lastPlansError = e instanceof Error ? e.message : String(e);
    return [];
  }
}

export type PurchaseResult = 'bought' | 'cancelled' | 'failed';

export async function buy(plan: Plan): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    return customerInfo.entitlements.active[PRO] ? 'bought' : 'failed';
  } catch (e) {
    // The SDK reports a user backing out as an error; it is not one.
    const cancelled = (e as { userCancelled?: boolean })?.userCancelled;
    return cancelled ? 'cancelled' : 'failed';
  }
}

/** For someone who paid on another device, or reinstalled. */
export async function restore(): Promise<boolean> {
  if (!KEY) return false;
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[PRO] !== undefined;
  } catch {
    return false;
  }
}
