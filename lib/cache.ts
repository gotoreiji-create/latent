import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LibrarySummary } from './library';

/**
 * SPEC §5.5 — the analysis is cached so the app does not recount on every
 * launch. Only the aggregate is stored; nothing about any individual photo is
 * ever persisted.
 */

const KEY = 'latent.summary.v1';

type Entry = { fingerprint: string; summary: LibrarySummary };

export async function readSummary(
  fingerprint: string
): Promise<LibrarySummary | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    return entry.fingerprint === fingerprint ? entry.summary : null;
  } catch {
    // A damaged cache is not worth surfacing — recount instead.
    return null;
  }
}

export async function writeSummary(
  fingerprint: string,
  summary: LibrarySummary
): Promise<void> {
  try {
    const entry: Entry = { fingerprint, summary };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Caching is an optimisation; failing to cache must not fail the scan.
  }
}
