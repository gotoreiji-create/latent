import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as MediaLibrary from 'expo-media-library/legacy';
// presentPermissionsPicker only exists on the new API surface.
import { presentPermissionsPicker } from 'expo-media-library';
import {
  useFonts,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';

import { analyse, type Analysis, type Progress } from './lib/analysis';
import { readAnalysis, writeAnalysis } from './lib/cache';
import {
  changeSub,
  hoursHeadline,
  hoursSub,
  placesHeadline,
  placesSub,
  screenHeadline,
  type Headline,
} from './lib/cards';
import { libraryFingerprint } from './lib/library';
import { colour, font } from './lib/theme';
import { HourRuler, MonthBand, PlaceField } from './components/instruments';

type Stage =
  | { name: 'boot' }
  | { name: 'intro' }
  | { name: 'scanning'; progress: Progress }
  | { name: 'limited' }
  | { name: 'denied' }
  | { name: 'portrait'; analysis: Analysis };

const group = (n: number) => n.toLocaleString('en-US');

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'boot' });
  const [fontsReady] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    Inter_400Regular,
    Inter_500Medium,
  });

  const run = useCallback(async () => {
    setStage({ name: 'scanning', progress: { phase: 'reading', count: 0 } });
    const fingerprint = await libraryFingerprint();
    const analysis = await analyse((progress) =>
      setStage({ name: 'scanning', progress })
    );
    await writeAnalysis(fingerprint, analysis);
    setStage({ name: 'portrait', analysis });
  }, []);

  const proceed = useCallback(
    async (permission: MediaLibrary.PermissionResponse) => {
      if (permission.status !== 'granted') {
        setStage({ name: 'denied' });
        return;
      }
      if (permission.accessPrivileges === 'limited') {
        setStage({ name: 'limited' });
        return;
      }
      try {
        await run();
      } catch {
        setStage({ name: 'denied' });
      }
    },
    [run]
  );

  const begin = useCallback(async () => {
    await proceed(await MediaLibrary.requestPermissionsAsync());
  }, [proceed]);

  /** Reopens the system picker so the user can widen a limited grant. */
  const widenAccess = useCallback(async () => {
    try {
      await presentPermissionsPicker();
    } catch {
      // Older Android has no picker; re-requesting is the only lever left.
    }
    await proceed(await MediaLibrary.getPermissionsAsync());
  }, [proceed]);

  // On launch, go straight to the cached portrait when the library has not
  // changed (§5.5). Nothing is requested here — a silent check only.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      try {
        const permission = await MediaLibrary.getPermissionsAsync();
        if (
          permission.status !== 'granted' ||
          permission.accessPrivileges === 'limited'
        ) {
          setStage({ name: 'intro' });
          return;
        }
        const cached = await readAnalysis(await libraryFingerprint());
        if (cached) {
          setStage({ name: 'portrait', analysis: cached });
          return;
        }
        await run();
      } catch {
        setStage({ name: 'intro' });
      }
    })();
  }, [run]);

  // Typefaces are the product here (§9); showing the system font first and
  // swapping would be worse than a beat of empty paper.
  if (!fontsReady) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {stage.name === 'boot' && <View style={styles.page} />}
      {stage.name === 'intro' && <Intro onContinue={begin} />}
      {stage.name === 'scanning' && <Scanning progress={stage.progress} />}
      {stage.name === 'limited' && <Limited onFix={widenAccess} />}
      {stage.name === 'denied' && <Denied onRetry={begin} />}
      {stage.name === 'portrait' && <Portrait analysis={stage.analysis} />}
    </View>
  );
}

/** §8 [2] — shown before the permission request, never after. */
function Intro({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.stack}>
        <Text style={styles.display}>We never look at your pictures.</Text>
        <Text style={styles.body}>
          Only the timestamp, the coordinates, and whether it was a screenshot.
          Your photos never leave this device.
        </Text>
      </View>
      <Button label="Continue" onPress={onContinue} />
    </View>
  );
}

function Scanning({ progress }: { progress: Progress }) {
  return (
    <View style={styles.page}>
      <View style={styles.stack}>
        <Text style={styles.counter}>{group(progress.count)}</Text>
        <Text style={styles.body}>
          {progress.phase === 'reading'
            ? 'Reading metadata.'
            : 'Reading coordinates.'}
        </Text>
      </View>
    </View>
  );
}

/** Android 14+ can grant access to a hand-picked set of photos. */
function Limited({ onFix }: { onFix: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.stack}>
        <Text style={styles.display}>Latent needs the whole library.</Text>
        <Text style={styles.body}>
          It counts photos — how many, when, how many were screens. A handful of
          selected photos cannot answer that.
        </Text>
        <Text style={styles.body}>
          Nothing is uploaded either way. Your photos stay on this device.
        </Text>
      </View>
      <Button label="Change selection" onPress={onFix} />
    </View>
  );
}

function Denied({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.stack}>
        <Text style={styles.display}>Latent cannot read anything.</Text>
        <Text style={styles.body}>
          Without access to the photo library there is no metadata to count.
          Nothing else in this app works without it.
        </Text>
      </View>
      <Button label="Ask again" onPress={onRetry} />
    </View>
  );
}

// ---------------------------------------------------------------------------

function Portrait({ analysis }: { analysis: Analysis }) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width - 48, 420);
  const { screen, hours, places, change, windowed } = analysis;

  return (
    <ScrollView contentContainerStyle={styles.portrait}>
      <Card
        index="01"
        title="Screen or World"
        headline={screenHeadline(screen)}
        sub={`You photographed the world ${group(
          screen.world
        )} times. You photographed a screen ${group(screen.screenshots)} times.`}
      >
        {/* Twelve empty bars say nothing. Libraries whose newest photo predates
            the window — a spare handset, a phone kept for screenshots — get the
            figures without the chart. */}
        {screen.months.some((m) => m.count > 0) ? (
          <MonthBand months={screen.months} width={inner} />
        ) : null}
      </Card>

      {hours.sample > 0 && (
        <Card
          index="02"
          title="When Your Eyes Open"
          headline={hoursHeadline(hours)}
          sub={hoursSub(hours)}
        >
          <HourRuler histogram={hours.histogram} width={inner} />
        </Card>
      )}

      {places && (
        <Card
          index="03"
          title="Places You Returned To"
          headline={placesHeadline(places)}
          sub={placesSub(places)}
        >
          <PlaceField places={places.places} width={inner} />
        </Card>
      )}

      {change.top && (
        <Card
          index={places ? '04' : '03'}
          title="What Changed"
          headline={change.top.headline}
          sub={changeSub()}
        />
      )}

      <Text style={styles.footnote}>
        {group(screen.total)} photos{' '}
        {windowed
          ? 'from the last two years.'
          : 'from your library. This device does not record when they were taken.'}{' '}
        Read on this device.
      </Text>
    </ScrollView>
  );
}

function Card({
  index,
  title,
  headline,
  sub,
  children,
}: {
  index: string;
  title: string;
  headline: Headline;
  sub?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.slug}>
        <Text style={styles.slugIndex}>{index}</Text>
        <View style={styles.rule} />
        <Text style={styles.slugTitle}>{title}</Text>
      </View>

      <Text style={styles.display}>
        {headline.before}
        {headline.figure ? (
          <Text
            style={
              // §9 wants numbers monospaced. A figure spelled as a word — "You
              // returned to three places" — is not a number, and setting it in
              // Plex Mono next to Archivo just looks like a mistake.
              /^\d/.test(headline.figure) ? styles.figure : styles.figureWord
            }
          >
            {headline.figure}
          </Text>
        ) : null}
        {headline.after}
      </Text>

      {children}
      {sub ? <Text style={styles.body}>{sub}</Text> : null}
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colour.ground },
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  portrait: { paddingHorizontal: 24, paddingTop: 72, paddingBottom: 72 },
  stack: { gap: 20 },
  card: { gap: 18, paddingBottom: 72 },

  // The index/rule/title strip that makes each card read as a reading off an
  // instrument rather than a slide.
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

  display: {
    fontFamily: font.displayHeavy,
    fontSize: 32,
    lineHeight: 38,
    color: colour.ink,
    letterSpacing: -0.6,
  },
  /** The one blue thing on the card (§9). */
  figure: { fontFamily: font.data, fontSize: 32, color: colour.signal },
  figureWord: { fontFamily: font.displayHeavy, color: colour.signal },
  counter: {
    fontFamily: font.data,
    fontSize: 60,
    color: colour.signal,
    letterSpacing: -1,
  },
  body: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    color: colour.mark,
  },
  footnote: {
    fontFamily: font.dataLight,
    fontSize: 12,
    lineHeight: 18,
    color: colour.mark,
    marginTop: 8,
  },

  button: {
    borderWidth: 1,
    borderColor: colour.ink,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: colour.ink },
  buttonLabel: {
    fontFamily: font.data,
    fontSize: 14,
    color: colour.ink,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
