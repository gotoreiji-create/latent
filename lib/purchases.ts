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
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: KEY });
  } catch {
    // Nothing to recover; hasPro() will simply keep answering false.
  }
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
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages
      .map((pkg) => ({
        pkg,
        price: pkg.product.priceString,
        period: periodOf(pkg),
        trialDays: trialDaysOf(pkg),
      }))
      .sort((a, b) => (a.period === 'year' ? -1 : b.period === 'year' ? 1 : 0));
  } catch {
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
