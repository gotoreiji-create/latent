import { useCallback, useState } from 'react';
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

import {
  screenHeadline,
  summarizeLibrary,
  type LibrarySummary,
} from './lib/library';

// SPEC §9 colour tokens.
const GROUND = '#E6E4DD';
const INK = '#1B1D1A';
const MARK = '#4A5D57';
const SIGNAL = '#1F4B99';

type Stage =
  | { name: 'intro' }
  | { name: 'scanning'; count: number }
  | { name: 'denied' }
  | { name: 'result'; summary: LibrarySummary };

const group = (n: number) => n.toLocaleString('en-US');

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  const { width } = useWindowDimensions();

  const begin = useCallback(async () => {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      setStage({ name: 'denied' });
      return;
    }

    setStage({ name: 'scanning', count: 0 });
    try {
      const summary = await summarizeLibrary((count) =>
        setStage({ name: 'scanning', count })
      );
      setStage({ name: 'result', summary });
    } catch {
      setStage({ name: 'denied' });
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {stage.name === 'intro' && <Intro onContinue={begin} />}
      {stage.name === 'scanning' && <Scanning count={stage.count} />}
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
  const { total, screenshots, world, screenshotRatio } = summary;

  // A single bar: the share of the library that was a screen.
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
          {group(total)} photos from the last two years. Read on this device.
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
    backgroundColor: '#C9C6BC',
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
    // letterSpacing adds trailing advance that Android clips off a centred,
    // shrink-wrapped Text — stretching the label gives the last glyph room.
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
