// SPEC §6 — the four cards. Everything here is arithmetic over the records that
// `scanLibrary` produced; nothing touches the media store except the location
// sampling in `sampleLocations`, which needs one call per photo.
import * as Legacy from 'expo-media-library/legacy';

import type { PhotoRecord } from './library';

// ---------------------------------------------------------------- Card 1 ----

export type ScreenCard = {
  total: number;
  screenshots: number;
  world: number;
  ratio: number;
  /** Share of screenshots per month, oldest first, for the last 12 months. */
  months: { label: string; ratio: number; count: number }[];
};

export function screenCard(photos: PhotoRecord[]): ScreenCard {
  const total = photos.length;
  const screenshots = photos.filter((p) => p.screenshot).length;

  // Twelve buckets ending with the current month.
  const now = new Date();
  const buckets = new Map<string, { screens: number; count: number }>();
  const order: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    order.push(key);
    buckets.set(key, { screens: 0, count: 0 });
  }

  for (const p of photos) {
    if (!p.dated) continue;
    const d = new Date(p.time);
    const bucket = buckets.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) continue;
    bucket.count++;
    if (p.screenshot) bucket.screens++;
  }

  const months = order.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const bucket = buckets.get(key)!;
    return {
      label: new Date(y, m, 1).toLocaleString('en-US', { month: 'narrow' }),
      ratio: bucket.count === 0 ? 0 : bucket.screens / bucket.count,
      count: bucket.count,
    };
  });

  return {
    total,
    screenshots,
    world: total - screenshots,
    ratio: total === 0 ? 0 : screenshots / total,
    months,
  };
}

/**
 * Card 1's headline.
 *
 * The spec's "1 in N" phrasing breaks down once screenshots pass half the
 * library — "1 in 1.3" is not a sentence. Above that point the ratio is stated
 * out of ten instead.
 */
export function screenHeadline(card: ScreenCard): string {
  const { ratio: r, total } = card;
  if (total === 0) return 'There is nothing here yet.';
  if (r === 0) return 'None of your photos was a screen.';
  if (r >= 0.5) return `${Math.round(r * 10)} in 10 photos was a screen.`;
  return `1 in ${Math.round(1 / r)} photos was a screen.`;
}

// ---------------------------------------------------------------- Card 2 ----

export type HoursCard = {
  /** 24 counts, index = local hour. */
  histogram: number[];
  peakHour: number;
  /** Longest run of consecutive hours with the fewest photos. */
  quietFrom: number;
  quietTo: number;
  /** How many photos carried a real creation time. */
  sample: number;
};

function formatHour(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function hoursCard(photos: PhotoRecord[]): HoursCard {
  const histogram = new Array(24).fill(0);
  let sample = 0;

  // Only real creation times mean anything here. A file's modification date
  // says when it was copied, not when the shutter went.
  for (const p of photos) {
    if (!p.dated) continue;
    histogram[new Date(p.time).getHours()]++;
    sample++;
  }

  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (histogram[h] > histogram[peakHour]) peakHour = h;
  }

  // The longest wrap-around run of hours at or below a tenth of the peak.
  const threshold = Math.max(1, histogram[peakHour] * 0.1);
  let bestStart = 0;
  let bestLength = 0;
  let start = -1;
  let length = 0;
  for (let i = 0; i < 48; i++) {
    const h = i % 24;
    if (histogram[h] < threshold) {
      if (length === 0) start = h;
      length++;
      if (length > bestLength && length <= 24) {
        bestLength = length;
        bestStart = start;
      }
    } else {
      length = 0;
    }
  }

  return {
    histogram,
    peakHour,
    quietFrom: bestStart,
    quietTo: (bestStart + bestLength) % 24,
    sample,
  };
}

export function hoursHeadline(card: HoursCard): string {
  return `Your eyes open at ${formatHour(card.peakHour)}.`;
}

export function hoursSub(card: HoursCard): string | null {
  if (card.quietFrom === card.quietTo) return null;
  return `Your quietest hours are ${formatHour(card.quietFrom)} to ${formatHour(
    card.quietTo
  )}.`;
}

// ---------------------------------------------------------------- Card 3 ----

export type Place = { lat: number; lon: number; visits: number };

export type PlacesCard = {
  places: Place[];
  /** Share of the sample that carried coordinates. */
  coverage: number;
  sampled: number;
  located: number;
};

/** §6 Card 3 is dropped below this — the picture would be noise. */
export const PLACES_MIN_COVERAGE = 0.15;

const SAMPLE_SIZE = 800; // §5.3
const CONCURRENCY = 8; // §5.3 — more than this locks the device up

/** Picks `count` items spread evenly across the whole list. */
function evenSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[Math.min(items.length - 1, Math.floor(i * step))]);
  }
  return out;
}

/**
 * Reads coordinates for an even sample of the library.
 *
 * `getAssetInfoAsync` is one call per photo, so the whole library is out of the
 * question (§5.3). Measured at ~3ms per photo with eight in flight, so 800
 * samples costs a couple of seconds.
 */
export async function sampleLocations(
  photos: PhotoRecord[],
  onProgress?: (done: number) => void
): Promise<{ points: { lat: number; lon: number }[]; sampled: number }> {
  const sample = evenSample(photos, SAMPLE_SIZE);
  const points: { lat: number; lon: number }[] = [];
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < sample.length) {
      const photo = sample[cursor++];
      try {
        const info = await Legacy.getAssetInfoAsync(photo.id);
        if (info.location) {
          points.push({
            lat: info.location.latitude,
            lon: info.location.longitude,
          });
        }
      } catch {
        // A photo we cannot read is simply not in the sample (§5.3).
      }
      done++;
      if (done % 50 === 0) onProgress?.(done);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sample.length) }, worker)
  );

  return { points, sampled: sample.length };
}

/**
 * Buckets coordinates onto a ~110m grid and returns the busiest three (§6).
 *
 * No reverse geocoding, ever — sending these coordinates anywhere would break
 * the one promise this product makes (§2).
 */
export function placesCard(
  points: { lat: number; lon: number }[],
  sampled: number
): PlacesCard {
  const grid = new Map<string, Place>();

  for (const { lat, lon } of points) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cell = grid.get(key);
    if (cell) {
      cell.visits++;
    } else {
      grid.set(key, { lat, lon, visits: 1 });
    }
  }

  const places = [...grid.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 3);

  return {
    places,
    coverage: sampled === 0 ? 0 : points.length / sampled,
    sampled,
    located: points.length,
  };
}

export function placesHeadline(card: PlacesCard): string {
  const n = card.places.length;
  if (n === 0) return 'You did not stay anywhere.';
  if (n === 1) return 'You returned to one place.';
  return `You returned to ${n === 2 ? 'two' : 'three'} places.`;
}

export function placesSub(card: PlacesCard): string | null {
  const top = card.places[0];
  if (!top || top.visits < 2) return null;
  return `You went back to one of them ${top.visits} times.`;
}

// ---------------------------------------------------------------- Card 4 ----

const DAY = 86400000;
const PERIOD = 90 * DAY;

export type Change = {
  label: string;
  /** Signed relative change; 0.4 means "40% more". */
  delta: number;
  headline: string;
};

export type ChangeCard = {
  /** Null when either period has too little data to compare. */
  top: Change | null;
  recentCount: number;
  priorCount: number;
};

/**
 * Compares the last 90 days with the 90 before them and keeps the single
 * biggest mover (§6 Card 4).
 */
export function changeCard(photos: PhotoRecord[]): ChangeCard {
  const now = Date.now();
  const dated = photos.filter((p) => p.dated);
  const recent = dated.filter((p) => p.time >= now - PERIOD);
  const prior = dated.filter(
    (p) => p.time >= now - 2 * PERIOD && p.time < now - PERIOD
  );

  // Too thin to say anything honest about.
  if (recent.length < 10 || prior.length < 10) {
    return { top: null, recentCount: recent.length, priorCount: prior.length };
  }

  const worldOf = (set: PhotoRecord[]) => set.filter((p) => !p.screenshot).length;
  const ratioOf = (set: PhotoRecord[]) =>
    set.length === 0 ? 0 : set.filter((p) => p.screenshot).length / set.length;

  const candidates: Change[] = [];

  const worldDelta = (worldOf(recent) - worldOf(prior)) / Math.max(1, worldOf(prior));
  candidates.push({
    label: 'world',
    delta: worldDelta,
    headline:
      worldDelta < 0
        ? `You took ${Math.round(-worldDelta * 100)}% fewer photos of the world.`
        : `You took ${Math.round(worldDelta * 100)}% more photos of the world.`,
  });

  const totalDelta = (recent.length - prior.length) / prior.length;
  candidates.push({
    label: 'total',
    delta: totalDelta,
    headline:
      totalDelta < 0
        ? `You photographed ${Math.round(-totalDelta * 100)}% less.`
        : `You photographed ${Math.round(totalDelta * 100)}% more.`,
  });

  const ratioShift = ratioOf(recent) - ratioOf(prior);
  candidates.push({
    label: 'screens',
    delta: ratioShift,
    headline:
      ratioShift < 0
        ? `Screens fell to ${Math.round(ratioOf(recent) * 100)}% of your photos.`
        : `Screens rose to ${Math.round(ratioOf(recent) * 100)}% of your photos.`,
  });

  const peakOf = (set: PhotoRecord[]) => hoursCard(set).peakHour;
  const shift = peakOf(recent) - peakOf(prior);
  if (shift !== 0) {
    const hours = Math.abs(shift) > 12 ? 24 - Math.abs(shift) : Math.abs(shift);
    candidates.push({
      label: 'hour',
      // Twelve hours is the largest possible shift; scale it to compare.
      delta: hours / 12,
      headline: `Your day moved ${hours} hour${hours === 1 ? '' : 's'} ${
        shift > 0 ? 'later' : 'earlier'
      }.`,
    });
  }

  const top = candidates.reduce((a, b) =>
    Math.abs(b.delta) > Math.abs(a.delta) ? b : a
  );

  return { top, recentCount: recent.length, priorCount: prior.length };
}

export function changeSub(): string {
  return 'Compared to the three months before.';
}
