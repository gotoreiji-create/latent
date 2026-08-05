// SPEC §5 — reading the photo library.
//
// In SDK 57 the legacy functions exported from the package root are deprecated
// shims that throw at runtime, so they are imported from the /legacy subpath.
import * as Legacy from 'expo-media-library/legacy';

const MONTHS = 24;
const MAX_ASSETS = 5000; // §5.1 — how many we keep
const MAX_SCAN = 20000; // how many we are willing to look at to find them
const PAGE_SIZE = 200;

/** One photo, reduced to the few things this app is allowed to know. */
export type PhotoRecord = {
  id: string;
  /** Best available timestamp, in ms. */
  time: number;
  /**
   * True when the file sits in a directory that receives images from elsewhere
   * — a messenger, a download, a share. Those were not photographed by anyone
   * holding this phone, so "You photographed the world N times" would be a lie
   * if they were counted.
   */
  received: boolean;
  /**
   * True when `time` came from the media store's own creation date. When false
   * it is a file modification date standing in, which is fine for counting but
   * not for asking what hour of the day someone photographs (§6 Card 2).
   */
  dated: boolean;
  screenshot: boolean;
};

export type Scan = {
  photos: PhotoRecord[];
  /**
   * False when no photo carried a real creation date and the scan therefore
   * covers the whole library rather than the last 24 months. The UI has to say
   * so — claiming "the last two years" would be a lie on those devices.
   */
  windowed: boolean;
};

function windowStart(): number {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS);
  return d.getTime();
}

/**
 * Screenshot detection (§5.4).
 *
 * The spec calls album membership the most reliable signal. On a Galaxy S25 it
 * is the least reliable: the device has two distinct albums both titled
 * "Screenshots", `getAlbumAsync` returns only one of their ids, and matching on
 * it found 142 of the 438 screenshots that the path and filename checks agreed
 * on. All three run and their results are unioned, so the weakest one can only
 * add.
 */
function makeScreenshotTest(screenshotAlbumId: string | null) {
  return (asset: Legacy.Asset): boolean => {
    if (asset.uri.toLowerCase().includes('screenshot')) return true;
    if (asset.filename.toLowerCase().startsWith('screenshot')) return true;
    return !!screenshotAlbumId && String(asset.albumId) === screenshotAlbumId;
  };
}

/**
 * Directories that images arrive in rather than originate from.
 *
 * Matched on the file path, not the album title — album titles are localised,
 * duplicated, and on some devices simply wrong. Only positive matches are
 * excluded: a photo we cannot place is kept. Excluding by failing to recognise
 * a camera directory would empty the library on the next unfamiliar phone, the
 * same way `createdAfter` did on HyperOS.
 */
const RECEIVED_PATHS = [
  '/download/',
  '/bluetooth/',
  '/pictures/line/',
  '/pictures/twitter/',
  '/pictures/instagram/',
  '/pictures/telegram/',
  '/telegram/',
  '/pictures/whatsapp/',
  '/whatsapp/media/',
  '/pictures/messenger/',
  '/pictures/facebook/',
  '/pictures/discord/',
  '/pictures/slack/',
  '/pictures/kakaotalk/',
  '/pictures/wechat/',
  '/tencent/',
  '/pictures/qq/',
  '/huawei share/',
  '/pictures/huawei share/',
  '/android/media/',
];

function isReceived(asset: Legacy.Asset): boolean {
  const path = asset.uri.toLowerCase();
  return RECEIVED_PATHS.some((dir) => path.includes(dir));
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
 * Walks the photo library and reduces it to one record per photo.
 *
 * The date window is applied here rather than by the media store, because
 * passing `createdAfter` makes it filter on DATE_TAKEN — a column Xiaomi's
 * HyperOS leaves empty for images its own gallery did not write, which made the
 * whole library vanish on a tester's Redmi 12. Photos with no creation date
 * fall back to their modification date, and photos with neither are kept.
 *
 * Only metadata is read. No image is opened or decoded.
 */
export async function scanLibrary(
  onProgress?: (count: number) => void
): Promise<Scan> {
  const album = await Legacy.getAlbumAsync('Screenshots');
  const isScreenshot = makeScreenshotTest(album ? String(album.id) : null);
  const cutoff = windowStart();

  const inWindow: PhotoRecord[] = [];
  const everything: PhotoRecord[] = [];
  let scanned = 0;
  let sawRealDate = false;

  let after: string | undefined;
  let hasNext = true;

  while (hasNext && inWindow.length < MAX_ASSETS && scanned < MAX_SCAN) {
    const page = await Legacy.getAssetsAsync({
      first: PAGE_SIZE,
      after,
      mediaType: Legacy.MediaType.photo,
      sortBy: [Legacy.SortBy.creationTime],
    });

    let pageHadRecent = false;

    for (const asset of page.assets) {
      scanned++;
      const dated = asset.creationTime > 0;
      if (dated) sawRealDate = true;

      const received = isReceived(asset);
      const record: PhotoRecord = {
        id: asset.id,
        time: asset.creationTime || asset.modificationTime || 0,
        dated,
        received,
        // A file that arrived from a messenger is not this person's screenshot
        // even if it happens to be one.
        screenshot: !received && isScreenshot(asset),
      };

      if (everything.length < MAX_ASSETS) everything.push(record);

      // Undated photos are kept rather than dropped — that is the whole bug.
      if (record.time === 0 || record.time >= cutoff) {
        if (inWindow.length < MAX_ASSETS) {
          inWindow.push(record);
          pageHadRecent = true;
        }
      }
    }

    onProgress?.(inWindow.length);
    after = page.endCursor;
    hasNext = page.hasNextPage;

    // Sorted newest first: once a whole page falls outside the window we are
    // past it. Only trust this once we know the device reports dates at all.
    if (sawRealDate && !pageHadRecent && page.assets.length > 0) break;
  }

  const windowed = sawRealDate && inWindow.length > 0;
  return { photos: windowed ? inWindow : everything, windowed };
}
