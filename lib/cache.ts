import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Analysis } from './analysis';

/**
 * SPEC §5.5 — the analysis is cached so the app does not recount on every
 * launch. Only the aggregate is stored; nothing that identifies an individual
 * photo is ever persisted.
 */

const KEY = 'latent.analysis.v2';

type Entry = { fingerprint: string; analysis: Analysis };

export async function readAnalysis(
  fingerprint: string
): Promise<Analysis | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    return entry.fingerprint === fingerprint ? entry.analysis : null;
  } catch {
    // A damaged cache is not worth surfacing — recount instead.
    return null;
  }
}

export async function writeAnalysis(
  fingerprint: string,
  analysis: Analysis
): Promise<void> {
  try {
    const entry: Entry = { fingerprint, analysis };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Caching is an optimisation; failing to cache must not fail the scan.
  }
}
