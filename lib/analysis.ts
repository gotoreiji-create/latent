import {
  changeCard,
  encodeSheet,
  hoursCard,
  placesCard,
  sampleLocations,
  screenCard,
  PLACES_MIN_COVERAGE,
  type ChangeCard,
  type HoursCard,
  type PlacesCard,
  type ScreenCard,
} from './cards';
import { scanLibrary } from './library';

export type Analysis = {
  /** False when the device records no dates and the counts cover all time. */
  windowed: boolean;
  /** Images that arrived from elsewhere and were left out of every card. */
  received: number;
  /** One character per photo: the library's shape, and nothing traceable (§9). */
  sheet: string;
  screen: ScreenCard;
  hours: HoursCard;
  /** Null when too few photos carry coordinates — §6 drops the card entirely. */
  places: PlacesCard | null;
  change: ChangeCard;
};

export type Progress =
  | { phase: 'reading'; count: number }
  | { phase: 'locating'; count: number };

/**
 * One pass over the library, then arithmetic. The location sampling is the only
 * slow part (one media-store call per sampled photo), so it runs last and
 * reports its own progress.
 */
export async function analyse(
  onProgress?: (p: Progress) => void
): Promise<Analysis> {
  const { photos, windowed } = await scanLibrary((count) =>
    onProgress?.({ phase: 'reading', count })
  );

  // Every card asks a question about what this person did. Images that arrived
  // from a messenger or a download answer none of them: their timestamps are
  // arrival times and their coordinates belong to whoever took them.
  const mine = photos.filter((p) => !p.received);
  const received = photos.length - mine.length;

  const screen = screenCard(mine);
  const hours = hoursCard(mine);
  const change = changeCard(mine);

  const { points, sampled } = await sampleLocations(mine, (count) =>
    onProgress?.({ phase: 'locating', count })
  );
  const places = placesCard(points, sampled);

  return {
    windowed,
    received,
    sheet: encodeSheet(mine),
    screen,
    hours,
    // §6: below 15% coverage the three dots would be noise pretending to be a
    // finding. The card is dropped rather than shown weakly.
    places: places.coverage >= PLACES_MIN_COVERAGE ? places : null,
    change,
  };
}
