import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// SPEC §5 is written against the legacy API. In SDK 57 the legacy functions
// exported from the package root are deprecated shims that THROW at runtime,
// so they must be imported from the /legacy subpath.
import * as Legacy from 'expo-media-library/legacy';

// The SDK 57 "next" API. Measured here only to compare against legacy.
import {
  Asset as NextAsset,
  AssetField,
  MediaType as NextMediaType,
  Query,
} from 'expo-media-library';

/**
 * SPEC.md §14 — device probe.
 *
 *   1. What is the screenshot album actually called on this device?
 *   2. How many photos exist in the last 24 months?
 *   3. What share of photos carry coordinates, and how slow is the call?
 *
 * Throwaway diagnostic screen. Not part of the product UI.
 */

const MONTHS = 24;
const MAX_ASSETS = 5000;
const PAGE_SIZE = 200;
const SAMPLE_SIZE = 50;
const PARALLEL = 8;

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

/** Pick `count` items spread evenly across the whole list. */
function evenSample<T>(items: T[], count: number, offset = 0): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[Math.min(items.length - 1, Math.floor(i * step + offset))]);
  }
  return out;
}

type ProbeResult = { withLocation: number; failed: number; ms: number };

/** Runs `task` over `items` with a bounded number of concurrent workers. */
async function probe<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<{ latitude: number; longitude: number } | null>
): Promise<ProbeResult> {
  const started = Date.now();
  let withLocation = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        if (await task(item)) withLocation++;
      } catch {
        failed++;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );

  return { withLocation, failed, ms: Date.now() - started };
}

function summarize(label: string, n: number, r: ProbeResult): string {
  return (
    `${label}  n=${n}  loc=${r.withLocation} (${((r.withLocation / n) * 100).toFixed(1)}%)` +
    `  failed=${r.failed}  ${r.ms} ms  (${(r.ms / n).toFixed(1)} ms/asset)`
  );
}

export default function App() {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const log = useCallback((line = '') => {
    console.log(`[probe] ${line}`);
    setLines((prev) => [...prev, line]);
  }, []);

  const run = useCallback(async () => {
    setLines([]);
    setRunning(true);
    try {
      log(`platform: ${Platform.OS} ${Platform.Version}`);

      // ---- permission ---------------------------------------------------
      const perm = await Legacy.requestPermissionsAsync();
      log(
        `permission: status=${perm.status} accessPrivileges=${perm.accessPrivileges ?? 'n/a'}`
      );
      if (perm.status !== 'granted') {
        log('ABORT: permission not granted.');
        return;
      }
      if (perm.accessPrivileges === 'limited') {
        log('WARNING: limited access — counts below are NOT the full library.');
      }

      const cutoff = monthsAgo(MONTHS);

      // ---- 1. albums ----------------------------------------------------
      log();
      log('=== 1. ALBUMS ===');
      const albums = await Legacy.getAlbumsAsync();
      log(`album count: ${albums.length}`);
      for (const a of albums) {
        log(`  "${a.title}"  assets=${a.assetCount}  id=${a.id}`);
      }
      const screenshotAlbum = await Legacy.getAlbumAsync('Screenshots');
      log(
        screenshotAlbum
          ? `getAlbumAsync('Screenshots') -> HIT (assets=${screenshotAlbum.assetCount}, id=${screenshotAlbum.id})`
          : `getAlbumAsync('Screenshots') -> MISS`
      );

      // ---- 2. counts ----------------------------------------------------
      log();
      log('=== 2. PHOTO COUNTS ===');
      const allTime = await Legacy.getAssetsAsync({
        first: 1,
        mediaType: Legacy.MediaType.photo,
      });
      log(`photos, all time: ${allTime.totalCount}`);

      const recent = await Legacy.getAssetsAsync({
        first: 1,
        mediaType: Legacy.MediaType.photo,
        createdAfter: cutoff,
      });
      log(`cutoff (${MONTHS} months ago): ${cutoff.toISOString()}`);
      log(`photos, last ${MONTHS} months: ${recent.totalCount}`);
      log(
        `-> ${MAX_ASSETS} cap is ${recent.totalCount > MAX_ASSETS ? 'BINDING' : 'NOT binding'}`
      );

      // ---- 2b. pagination speed (§5.2 claims this is fast) ---------------
      log();
      log('=== 2b. PAGINATION SPEED (legacy) ===');
      const pageStart = Date.now();
      const assets: Legacy.Asset[] = [];
      let after: string | undefined;
      let hasNext = true;
      let pages = 0;
      while (hasNext && assets.length < MAX_ASSETS) {
        const page = await Legacy.getAssetsAsync({
          first: PAGE_SIZE,
          after,
          mediaType: Legacy.MediaType.photo,
          sortBy: [Legacy.SortBy.creationTime],
          createdAfter: cutoff,
        });
        assets.push(...page.assets);
        after = page.endCursor;
        hasNext = page.hasNextPage;
        pages++;
      }
      log(
        `fetched ${assets.length} assets in ${pages} pages / ${Date.now() - pageStart} ms`
      );
      if (assets.length > 0) {
        const times = assets.map((a) => a.creationTime);
        log(`oldest: ${new Date(Math.min(...times)).toISOString()}`);
        log(`newest: ${new Date(Math.max(...times)).toISOString()}`);
      }

      // ---- 2c. screenshot detection fallbacks (§5.4) ---------------------
      log();
      log('=== 2c. SCREENSHOT DETECTION ===');
      const albumIds = new Set(
        screenshotAlbum ? [String(screenshotAlbum.id)] : []
      );
      const byAlbum = assets.filter((a) =>
        albumIds.has(String(a.albumId))
      ).length;
      const byUri = assets.filter((a) =>
        a.uri.toLowerCase().includes('screenshot')
      ).length;
      const byFilename = assets.filter((a) =>
        a.filename.toLowerCase().startsWith('screenshot')
      ).length;
      log(`(1) albumId == Screenshots album: ${byAlbum}`);
      log(`(2) uri contains "screenshot":    ${byUri}`);
      log(`(3) filename starts "screenshot": ${byFilename}`);
      log(`sample filenames: ${assets.slice(0, 5).map((a) => a.filename).join(', ')}`);
      log(`sample uri: ${assets[0]?.uri ?? '(none)'}`);

      // ---- 3. location probe --------------------------------------------
      log();
      log('=== 3. LOCATION PROBE (legacy getAssetInfoAsync) ===');
      if (assets.length === 0) {
        log('no assets to probe.');
        return;
      }

      const serialSet = evenSample(assets, SAMPLE_SIZE, 0);
      const serial = await probe(serialSet, 1, async (a) => {
        const info = await Legacy.getAssetInfoAsync(a);
        return info.location ?? null;
      });
      log(summarize(`serial       `, serialSet.length, serial));

      const parallelSet = evenSample(assets, SAMPLE_SIZE, 1);
      const parallel = await probe(parallelSet, PARALLEL, async (a) => {
        const info = await Legacy.getAssetInfoAsync(a);
        return info.location ?? null;
      });
      log(summarize(`parallel(${PARALLEL})  `, parallelSet.length, parallel));

      const perAsset = parallel.ms / parallelSet.length;
      log(`800 samples @ parallel(${PARALLEL}): ~${((perAsset * 800) / 1000).toFixed(1)} s`);
      log(`400 samples @ parallel(${PARALLEL}): ~${((perAsset * 400) / 1000).toFixed(1)} s`);

      const rate =
        (serial.withLocation + parallel.withLocation) /
        (serialSet.length + parallelSet.length);
      log(`combined location rate: ${(rate * 100).toFixed(1)}%`);
      log(`-> Card 3 (needs >=15%): ${rate >= 0.15 ? 'VIABLE' : 'DROP, promote Card 4'}`);

      // ---- 4. next API comparison ---------------------------------------
      log();
      log('=== 4. NEXT API COMPARISON (SDK 57 Query) ===');
      try {
        const qStart = Date.now();
        const metas = await new Query()
          .eq(AssetField.MEDIA_TYPE, NextMediaType.IMAGE)
          .gte(AssetField.CREATION_TIME, cutoff.getTime())
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(MAX_ASSETS)
          .exeForMetadata();
        log(`exeForMetadata: ${metas.length} assets in ${Date.now() - qStart} ms`);
        if (metas.length > 0) {
          const t = metas
            .map((m) => m.creationTime)
            .filter((x): x is number => x != null);
          if (t.length > 0) {
            log(`oldest: ${new Date(Math.min(...t)).toISOString()}`);
            log(`newest: ${new Date(Math.max(...t)).toISOString()}`);
          }
          const nextSet = evenSample(metas, SAMPLE_SIZE, 2);
          const nextRes = await probe(nextSet, PARALLEL, (m) =>
            new NextAsset(m.id).getLocation()
          );
          log(summarize(`getLocation(${PARALLEL})`, nextSet.length, nextRes));
        }
      } catch (e) {
        log(`next API failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      log();
      log('done.');
    } catch (e) {
      log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, [log]);

  // Auto-run once on mount so the results land in logcat without a tap.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    run();
  }, [run]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Latent — device probe (SPEC §14)</Text>
      <Button
        title={running ? 'Running…' : 'Run probe'}
        onPress={run}
        disabled={running}
      />
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.line} selectable>
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E6E4DD',
    paddingTop: 56,
    paddingHorizontal: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1B1D1A', marginBottom: 12 },
  log: { flex: 1, marginTop: 12 },
  logContent: { paddingBottom: 48 },
  line: {
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    fontSize: 11,
    color: '#1B1D1A',
    lineHeight: 16,
  },
});
