import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import type { Analysis } from '../lib/analysis';
import { screenHeadline } from '../lib/cards';
import { colour, font } from '../lib/theme';
import { GhostSheetGraphic } from './GhostContactSheet';
import { MonthBand } from './instruments';

/**
 * The image that leaves the app (§6 Card 1, §13).
 *
 * Card 1 is the free card and the one that travels, so this is composed for a
 * feed rather than for a phone screen: fixed size, wider margins, and the
 * contact sheet underneath as the thing that makes it recognisably Latent.
 *
 * Rendered off-screen and captured; never shown to the user directly.
 */

const WIDTH = 1080;
const SCALE = 0.34; // laid out small, captured at full resolution
const INNER = WIDTH * SCALE - 96;

export const ShareCard = forwardRef<ViewShotRef, { analysis: Analysis }>(
  function ShareCard({ analysis }, ref) {
    const { screen, sheet } = analysis;
    const headline = screenHeadline(screen);
    const group = (n: number) => n.toLocaleString('en-US');

    return (
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot
          ref={ref}
          options={{ format: 'png', quality: 1, width: WIDTH, height: WIDTH }}
        >
          <View style={styles.frame}>
            <View style={styles.slug}>
              <Text style={styles.slugText}>LATENT</Text>
              <View style={styles.rule} />
              <Text style={styles.slugText}>SCREEN OR WORLD</Text>
            </View>

            <Text style={styles.display}>
              {headline.before}
              {headline.figure ? (
                <Text
                  style={
                    /^\d/.test(headline.figure)
                      ? styles.figure
                      : styles.figureWord
                  }
                >
                  {headline.figure}
                </Text>
              ) : null}
              {headline.after}
            </Text>

            {screen.months.some((m) => m.count > 0) ? (
              <MonthBand months={screen.months} width={INNER} />
            ) : null}

            <Text style={styles.body}>
              {group(screen.world)} of the world. {group(screen.screenshots)} of
              a screen.
            </Text>

            <View style={styles.sheet}>
              <GhostSheetGraphic sheet={sheet} width={INNER} maxRows={6} />
            </View>

            <Text style={styles.foot}>
              Read on the device. No picture was opened.
            </Text>
          </View>
        </ViewShot>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  // Kept in the tree so it can be captured, kept out of sight so it is never
  // part of the layout the user sees.
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  frame: {
    width: WIDTH * SCALE,
    height: WIDTH * SCALE,
    backgroundColor: colour.ground,
    padding: 48,
    justifyContent: 'space-between',
  },
  slug: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slugText: {
    fontFamily: font.data,
    fontSize: 10,
    color: colour.mark,
    letterSpacing: 1,
  },
  rule: { flex: 1, height: 1, backgroundColor: colour.veil },
  display: {
    fontFamily: font.displayHeavy,
    fontSize: 30,
    lineHeight: 35,
    color: colour.ink,
    letterSpacing: -0.6,
  },
  figure: { fontFamily: font.data, fontSize: 30, color: colour.signal },
  figureWord: { fontFamily: font.displayHeavy, color: colour.signal },
  body: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    color: colour.mark,
  },
  sheet: { opacity: 0.9 },
  foot: { fontFamily: font.dataLight, fontSize: 10, color: colour.mark },
});
