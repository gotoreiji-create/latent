// SPEC §5 — reading the photo library.
//
// In SDK 57 the legacy functions exported from the package root are deprecated
// shims that throw at runtime, so they are imported from the /legacy subpath.
import * as Legacy from 'expo-media-library/legacy';

const MONTHS = 24;
const MAX_ASSETS = 5000; // §5.1 — how many we keep
const MAX_SCAN = 20000; // how many we are willing to look at to find them
const PAGE_SIZE = 200;

export type LibrarySummary = {
  /** Photos counted. */
  total: number;
  /** Of those, how many are screenshots. */
  screenshots: number;
  /** Of those, how many are not. */
  world: number;
  /** screenshots / total, or 0 when empty. */
  screenshotRatio: number;
  /**
   * False when no photo carried a usable date and the counts therefore cover
   * the whole library rather than the last 24 months. The UI has to say so —
   * claiming "the last two years" would be a lie on those devices.
   */
  windowed: boolean;
};

function windowStart(): number {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS);
  return d.getTime();
}

/**
 * When a photo was taken, as far as the media store knows.
 *
 * Xiaomi's HyperOS leaves `creationTime` at 0 for images its own gallery did
 * not write, so `modificationTime` is the fallback. A tester on a Redmi 12
 * reported a library of zero photos because of this — the previous
 * implementation passed `createdAfter` straight to the media store, which drops
 * every row with no DATE_TAKEN before we ever see it.
 */
function timestampOf(asset: Legacy.Asset): number | null {
  return asset.creationTime || asset.modificationTime || null;
}

/**
 * Screenshot detection, in the priority order of §5.4. Album membership is the
 * most reliable signal; the path and filename checks cover devices where the
 * album is named something else.
 */
function makeScreenshotTest(screenshotAlbumId: string | null) {
  return (asset: Legacy.Asset): boolean => {
    if (screenshotAlbumId && String(asset.albumId) === screenshotAlbumId) {
      return true;
    }
    if (asset.uri.toLowerCase().includes('screenshot')) return true;
    return asset.filename.toLowerCase().startsWith('screenshot');
  };
}

/** Cheap identity of the library: newest photo plus how many there are (§5.5). */
export async function libraryFingerprint(): Promise<string> {
  const page = await Legacy.getAssetsAsync({
    first: 1,
    mediaType: Legacy.MediaType.photo,
    sortBy: [Legacy.SortBy.creationTime],
  });
  return `${page.assets[0]?.id ?? 'none'}:${page.totalCount}`;
}

/**
 * Reads metadata for the photos of the last 24 months and counts them.
 *
 * The date window is applied here rather than by the media store, so photos
 * with a missing DATE_TAKEN still get a chance to be counted. If nothing at all
 * carries a date, the window is abandoned and the whole library is counted —
 * an honest total beats a screen that says zero.
 *
 * Only metadata is read. No image is opened or decoded.
 */
export async function summarizeLibrary(
  onProgress?: (count: number) => void
): Promise<LibrarySummary> {
  const album = await Legacy.getAlbumAsync('Screenshots');
  const isScreenshot = makeScreenshotTest(album ? String(album.id) : null);
  const cutoff = windowStart();

  let total = 0;
  let screenshots = 0;
  let scanned = 0;
  let sawAnyDate = false;

  // Kept in case every photo turns out to be undated.
  let allTimeTotal = 0;
  let allTimeScreenshots = 0;

  let after: string | undefined;
  let hasNext = true;

  while (hasNext && total < MAX_ASSETS && scanned < MAX_SCAN) {
    const page = await Legacy.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: Legacy.MediaType.photo,
      sortBy: [Legacy.SortBy.creationTime],
    });

    let pageHadRecent = false;

    for (const asset of page.assets) {
      scanned++;
      const shot = isScreenshot(asset);

      if (allTimeTotal < MAX_ASSETS) {
        allTimeTotal++;
        if (shot) allTimeScreenshots++;
      }

      const t = timestampOf(asset);
      if (t !== null) sawAnyDate = true;

      // Undated photos are kept rather than dropped — that is the whole bug.
      if (t === null || t >= cutoff) {
        if (total < MAX_ASSETS) {
          total++;
          if (shot) screenshots++;
          pageHadRecent = true;
        }
      }
    }

    onProgress?.(total);
    after = page.endCursor;
    hasNext = page.hasNextPage;

    // Sorted newest first: once a whole page falls outside the window we are
    // past it. Only trust this once we know the device reports dates at all.
    if (sawAnyDate && !pageHadRecent && page.assets.length > 0) break;
  }

  const windowed = sawAnyDate && total > 0;
  const finalTotal = windowed ? total : allTimeTotal;
  const finalScreens = windowed ? screenshots : allTimeScreenshots;

  return {
    total: finalTotal,
    screenshots: finalScreens,
    world: finalTotal - finalScreens,
    screenshotRatio: finalTotal === 0 ? 0 : finalScreens / finalTotal,
    windowed,
  };
}

/**
 * Card 1's headline (§6).
 *
 * The spec's "1 in N" phrasing breaks down once screenshots pass half the
 * library — "1 in 1.3" is not a sentence. Above that point the ratio is stated
 * out of ten instead.
 */
export function screenHeadline(summary: LibrarySummary): string {
  const { screenshotRatio: r, total } = summary;
  if (total === 0) return 'There is nothing here yet.';
  if (r === 0) return 'None of your photos was a screen.';
  if (r >= 0.5) return `${Math.round(r * 10)} in 10 photos was a screen.`;
  return `1 in ${Math.round(1 / r)} photos was a screen.`;
}
