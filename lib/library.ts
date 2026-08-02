// SPEC §5 — reading the photo library.
//
// In SDK 57 the legacy functions exported from the package root are deprecated
// shims that throw at runtime, so they are imported from the /legacy subpath.
import * as Legacy from 'expo-media-library/legacy';

const MONTHS = 24;
const MAX_ASSETS = 5000; // §5.1
const PAGE_SIZE = 200;

export type LibrarySummary = {
  /** Photos in the window, after the cap. */
  total: number;
  /** Of those, how many are screenshots. */
  screenshots: number;
  /** Of those, how many are not. */
  world: number;
  /** screenshots / total, or 0 when the library is empty. */
  screenshotRatio: number;
};

function windowStart(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS);
  return d;
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

/**
 * Reads metadata for the photos of the last 24 months and counts them.
 *
 * Only metadata is read — no image is opened or decoded. `onProgress` is called
 * with the running count so the scanning screen can show it.
 */
export async function summarizeLibrary(
  onProgress?: (count: number) => void
): Promise<LibrarySummary> {
  const album = await Legacy.getAlbumAsync('Screenshots');
  const isScreenshot = makeScreenshotTest(album ? String(album.id) : null);

  const createdAfter = windowStart();
  let total = 0;
  let screenshots = 0;
  let after: string | undefined;
  let hasNext = true;

  while (hasNext && total < MAX_ASSETS) {
    const page = await Legacy.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: Legacy.MediaType.photo,
      sortBy: [Legacy.SortBy.creationTime],
      createdAfter,
    });

    for (const asset of page.assets) {
      if (total >= MAX_ASSETS) break;
      total++;
      if (isScreenshot(asset)) screenshots++;
    }

    onProgress?.(total);
    after = page.endCursor;
    hasNext = page.hasNextPage;
  }

  return {
    total,
    screenshots,
    world: total - screenshots,
    screenshotRatio: total === 0 ? 0 : screenshots / total,
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
  if (r >= 0.5) {
    return `${Math.round(r * 10)} in 10 photos was a screen.`;
  }
  return `1 in ${Math.round(1 / r)} photos was a screen.`;
}
