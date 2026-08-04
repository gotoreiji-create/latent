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

import { readSummary, writeSummary } from './lib/cache';
import {
  libraryFingerprint,
  screenHeadline,
  summarizeLibrary,
  type LibrarySummary,
} from './lib/library';

// SPEC §9 colour tokens.
const GROUND = '#E6E4DD';
const INK = '#1B1D1A';
const MARK = '#4A5D57';
const SIGNAL = '#1F4B99';
const VEIL = '#C9C6BC';

type Stage =
  | { name: 'boot' }
  | { name: 'intro' }
  | { name: 'scanning'; count: number }
  | { name: 'limited' }
  | { name: 'denied' }
  | { name: 'result'; summary: LibrarySummary };

const group = (n: number) => n.toLocaleString('en-US');

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'boot' });
  const { width } = useWindowDimensions();

  /** Counts the library and caches the result. */
  const scan = useCallback(async () => {
    setStage({ name: 'scanning', count: 0 });
    const fingerprint = await libraryFingerprint();
    const summary = await summarizeLibrary((count) =>
      setStage({ name: 'scanning', count })
    );
    await writeSummary(fingerprint, summary);
    setStage({ name: 'result', summary });
  }, []);

  /** Turns a permission response into the next stage. */
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
        await scan();
      } catch {
        setStage({ name: 'denied' });
      }
    },
    [scan]
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

  // On launch, skip straight to the cached result when the library has not
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
        const cached = await readSummary(await libraryFingerprint());
        setStage(cached ? { name: 'result', summary: cached } : { name: 'intro' });
        if (!cached) await scan();
      } catch {
        setStage({ name: 'intro' });
      }
    })();
  }, [scan]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {stage.name === 'boot' && <View style={styles.page} />}
      {stage.name === 'intro' && <Intro onContinue={begin} />}
      {stage.name === 'scanning' && <Scanning count={stage.count} />}
      {stage.name === 'limited' && <Limited onFix={widenAccess} />}
      {stage.name === 'denied' && <Denied onRetry={begin} />}
      {stage.name === 'result' && (
        <Result summary={stage.summary} width={width} />
      )}
    </View>
  );
}

/** §8 [2] — shown before the permission request, never after. */
function Intro({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.center}>
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

function Scanning({ count }: { count: number }) {
  return (
    <View style={styles.page}>
      <View style={styles.center}>
        <Text style={styles.figure}>{group(count)}</Text>
        <Text style={styles.body}>Reading metadata.</Text>
      </View>
    </View>
  );
}

/** Android 14+ can grant access to a hand-picked set of photos. */
function Limited({ onFix }: { onFix: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.center}>
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
      <View style={styles.center}>
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

function Result({
  summary,
  width,
}: {
  summary: LibrarySummary;
  width: number;
}) {
  const { total, screenshots, world, screenshotRatio, windowed } = summary;

  const barWidth = Math.min(width - 48, 420);
  const screenWidth = Math.round(barWidth * screenshotRatio);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.center}>
        <Text style={styles.display}>{screenHeadline(summary)}</Text>

        <View style={[styles.bar, { width: barWidth }]}>
          <View
            style={{
              width: screenWidth,
              height: '100%',
              backgroundColor: SIGNAL,
            }}
          />
        </View>

        <Text style={styles.body}>
          You photographed the world{' '}
          <Text style={styles.inlineFigure}>{group(world)}</Text> times.
        </Text>
        <Text style={styles.body}>
          You photographed a screen{' '}
          <Text style={styles.inlineFigure}>{group(screenshots)}</Text> times.
        </Text>

        <Text style={styles.footnote}>
          {group(total)} photos{' '}
          {windowed
            ? 'from the last two years.'
            : 'from your library. This device does not record when they were taken.'}{' '}
          Read on this device.
        </Text>
      </View>
    </ScrollView>
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
  root: { flex: 1, backgroundColor: GROUND },
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  center: { gap: 20 },
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
  inlineFigure: { fontFamily: 'monospace', color: INK },
  body: { fontSize: 17, lineHeight: 25, color: MARK },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: MARK,
    marginTop: 24,
    fontFamily: 'monospace',
  },
  bar: {
    height: 10,
    backgroundColor: VEIL,
    marginVertical: 8,
    flexDirection: 'row',
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
