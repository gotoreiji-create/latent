/**
 * SPEC §9 — the design tokens, in one place so the rules are checkable.
 *
 * The concept is an instrument: a seismograph, a tide table, a ship's log. The
 * aesthetic is measurement, not decoration.
 */

export const colour = {
  /** Bone white. Paper. The background. */
  ground: '#E6E4DD',
  /** Near black. Body text and rules. */
  ink: '#1B1D1A',
  /** Slate green. Every data mark. */
  mark: '#4A5D57',
  /**
   * Blueprint blue. **Once per card, on the headline's figure.** Nothing else
   * in the app is blue. Holding this line is what keeps the whole thing tight.
   */
  signal: '#1F4B99',
  /** Paywall blur and inactive states. */
  veil: '#C9C6BC',
} as const;

/**
 * §9 asks for Archivo Expanded. `@expo-google-fonts/archivo` ships the weight
 * axis only — the expanded width is a separate family that is not on the
 * package — so the display face is Archivo at its heaviest weights instead.
 */
export const font = {
  display: 'Archivo_700Bold',
  displayHeavy: 'Archivo_800ExtraBold',
  /** Every number in this app is monospaced. Figures that jitter look cheap. */
  data: 'IBMPlexMono_500Medium',
  dataLight: 'IBMPlexMono_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
} as const;
