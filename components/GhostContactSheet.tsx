import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { decodeSheet } from '../lib/cards';
import { colour, font } from '../lib/theme';

/**
 * SPEC §9 — the signature element.
 *
 * One cell per photo, arranged in reading order. No image is drawn: each photo
 * is a small mark, placed lower in its cell the later in the day it was taken,
 * filled if it was of the world and outlined if it was a screen. The result is
 * the shape of two years of attention, made entirely without showing a single
 * picture — the constraint turned into the thing you look at.
 *
 * Every mark is emitted into one of two `<Path>` elements rather than its own
 * node. Five thousand `<Rect>`s take seconds to mount and stutter when
 * scrolled; two paths mount instantly, which is what §13's "reduce the cell
 * count if it janks" was there to work around.
 */

const CELL = 8;
const MARK = 3.2;

/** The drawing on its own, so the share image can reuse it. */
export function GhostSheetGraphic({
  sheet,
  width,
  maxRows,
}: {
  sheet: string;
  width: number;
  /** Crops to the most recent rows — the share image is square. */
  maxRows?: number;
}) {
  const { filled, outlined, height, count } = useMemo(() => {
    const marks = decodeSheet(sheet);
    const columns = Math.max(1, Math.floor(width / CELL));
    const rows = Math.ceil(marks.length / columns);
    const shown =
      maxRows && rows > maxRows ? marks.slice(-(maxRows * columns)) : marks;
    const shownRows = Math.ceil(shown.length / columns);

    // Path data is assembled as strings because that is what react-native-svg
    // hands to the platform; building two of them beats building 5,000 nodes.
    let a = '';
    let b = '';

    shown.forEach((mark, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * CELL + (CELL - MARK) / 2;
      // Midnight sits at the top of its cell, late evening at the bottom.
      const drift = (mark.hour / 23) * (CELL - MARK);
      const y = row * CELL + drift;
      const box = `M${x.toFixed(1)} ${y.toFixed(1)}h${MARK}v${MARK}h-${MARK}Z`;
      if (mark.screenshot) b += box;
      else a += box;
    });

    return {
      filled: a,
      outlined: b,
      height: shownRows * CELL,
      count: shown.length,
    };
  }, [sheet, width, maxRows]);

  if (count === 0) return null;

  return (
    <Svg width={width} height={height}>
      <Path d={filled} fill={colour.mark} />
      <Path
        d={outlined}
        fill="none"
        stroke={colour.mark}
        strokeWidth={0.7}
        opacity={0.85}
      />
    </Svg>
  );
}

export function GhostContactSheet({
  sheet,
  width,
}: {
  sheet: string;
  width: number;
}) {
  const count = sheet.length;
  if (count === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.slug}>
        <Text style={styles.slugIndex}>—</Text>
        <View style={styles.rule} />
        <Text style={styles.slugTitle}>Every photo, none shown</Text>
      </View>

      <GhostSheetGraphic sheet={sheet} width={width} />

      <Text style={styles.caption}>
        {count.toLocaleString('en-US')} marks. Filled is the world, outlined is a
        screen. Each sits lower the later in the day it was taken.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingTop: 8 },
  slug: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slugIndex: { fontFamily: font.data, fontSize: 11, color: colour.mark },
  rule: { flex: 1, height: 1, backgroundColor: colour.veil },
  slugTitle: {
    fontFamily: font.data,
    fontSize: 11,
    color: colour.mark,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  caption: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 20,
    color: colour.mark,
  },
});
