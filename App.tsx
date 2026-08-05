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

import { analyse, type Analysis, type Progress } from './lib/analysis';
import { readAnalysis, writeAnalysis } from './lib/cache';
import {
  changeSub,
  hoursHeadline,
  hoursSub,
  placesHeadline,
  placesSub,
  screenHeadline,
} from './lib/cards';
import { libraryFingerprint } from './lib/library';

// SPEC §9 colour tokens.
const GROUND = '#E6E4DD';
const INK = '#1B1D1A';
const MARK = '#4A5D57';
const SIGNAL = '#1F4B99';
const VEIL = '#C9C6BC';

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
        <Text style={styles.figure}>{group(progress.count)}</Text>
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
        headline={screenHeadline(screen)}
        sub={`You photographed the world ${group(
          screen.world
        )} times. You photographed a screen ${group(screen.screenshots)} times.`}
      >
        {/* Twelve empty bars say nothing. Libraries whose newest photo predates
            the window — a spare handset, a phone kept for screenshots — get the
            figures without the chart. */}
        {screen.months.some((m) => m.count > 0) ? (
          <MonthBars months={screen.months} width={inner} />
        ) : null}
      </Card>

      {hours.sample > 0 && (
        <Card headline={hoursHeadline(hours)} sub={hoursSub(hours)}>
          <HourBlocks histogram={hours.histogram} width={inner} />
        </Card>
      )}

      {places && (
        <Card headline={placesHeadline(places)} sub={placesSub(places)}>
          <PlaceDots places={places.places} width={inner} />
        </Card>
      )}

      {change.top && (
        <Card headline={change.top.headline} sub={changeSub()} />
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
  headline,
  sub,
  children,
}: {
  headline: string;
  sub?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.display}>{headline}</Text>
      {children}
      {sub ? <Text style={styles.body}>{sub}</Text> : null}
    </View>
  );
}

/** Card 1 — one bar per month, filled by that month's screenshot share. */
function MonthBars({
  months,
  width,
}: {
  months: { label: string; ratio: number; count: number }[];
  width: number;
}) {
  const gap = 4;
  const barWidth = (width - gap * (months.length - 1)) / months.length;
  return (
    <View style={[styles.row, { width, height: 96 }]}>
      {months.map((m, i) => (
        <View
          key={i}
          style={{
            width: barWidth,
            marginRight: i === months.length - 1 ? 0 : gap,
            height: '100%',
            backgroundColor: VEIL,
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              height: `${Math.round(m.ratio * 100)}%`,
              backgroundColor: m.count === 0 ? 'transparent' : SIGNAL,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/** Card 2 — 24 cells in a row, shaded by how often that hour appears (§6). */
function HourBlocks({
  histogram,
  width,
}: {
  histogram: number[];
  width: number;
}) {
  const peak = Math.max(...histogram, 1);
  const gap = 2;
  const cell = (width - gap * 23) / 24;
  return (
    <View style={[styles.row, { width, height: 44 }]}>
      {histogram.map((count, h) => (
        <View
          key={h}
          style={{
            width: cell,
            marginRight: h === 23 ? 0 : gap,
            height: '100%',
            backgroundColor: INK,
            opacity: 0.08 + (count / peak) * 0.92,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Card 3 — the three places, drawn only in relation to each other. No map, no
 * place name, no coordinate on screen (§6).
 */
function PlaceDots({ places, width }: { places: Place[]; width: number }) {
  const height = 160;
  if (places.length === 0) return null;

  const lats = places.map((p) => p.lat);
  const lons = places.map((p) => p.lon);
  const spanLat = Math.max(...lats) - Math.min(...lats) || 1;
  const spanLon = Math.max(...lons) - Math.min(...lons) || 1;
  const most = Math.max(...places.map((p) => p.visits));

  return (
    <View style={{ width, height }}>
      {places.map((p, i) => {
        const size = 16 + (p.visits / most) * 48;
        const x = ((p.lon - Math.min(...lons)) / spanLon) * (width - size);
        const y = ((Math.max(...lats) - p.lat) / spanLat) * (height - size);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: places.length === 1 ? width / 2 - size / 2 : x,
              top: places.length === 1 ? height / 2 - size / 2 : y,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: i === 0 ? SIGNAL : MARK,
            }}
          />
        );
      })}
    </View>
  );
}

type Place = { lat: number; lon: number; visits: number };

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
  root: { flex: 1, backgroundColor: GROUND },
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  portrait: { paddingHorizontal: 24, paddingTop: 80, paddingBottom: 64 },
  stack: { gap: 20 },
  card: { gap: 20, paddingBottom: 64 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.5,
  },
  figure: {
    fontFamily: 'monospace',
    fontSize: 64,
    color: SIGNAL,
    letterSpacing: -1,
  },
  body: { fontSize: 17, lineHeight: 25, color: MARK },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: MARK,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  button: {
    borderWidth: 1,
    borderColor: INK,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: INK },
  buttonLabel: {
    fontSize: 16,
    color: INK,
    letterSpacing: 1,
    textTransform: 'uppercase',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
