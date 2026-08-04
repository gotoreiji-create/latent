# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Latent is an Android app for the RevenueCat Shipaton 2026 hackathon. It reads **only the
metadata** of the photo library — creation time, EXIF coordinates, filename, album — and
presents a few cards about what the user has been paying attention to. It never opens,
decodes, displays, or uploads image content.

**`../SPEC.md` is the source of truth.** It defines the scope, the copy, the design tokens,
the numbered implementation order, and an explicit "do not build this" list (§10). Read it
before writing code. What is not in the spec does not get built.

Two constraints from the spec that shape almost every decision:

- **Nothing derived from a photo may be transmitted.** Only RevenueCat (purchases),
  OneSignal (push token), and Layers (SDK analytics) may talk to the network. Coordinates,
  timestamps, filenames, and aggregate results must never leave the device. Reverse
  geocoding is forbidden for this reason (§2, §6).
- **UI copy is English only**, with no i18n mechanism. Assertions, no exclamation marks, no
  evaluative words (good/bad/should).

## Commands

```bash
npx tsc --noEmit           # typecheck — the only automated check that exists
npx expo start             # Metro; the installed debug build loads its bundle from here
npx expo run:android       # build + install + launch on a connected device
npx expo prebuild -p android --clean   # regenerate android/ after changing app.json
```

There is **no test framework and no linter configured**. `npx tsc --noEmit` plus running on
a real device is the whole verification story.

Release build:

```bash
npx eas-cli build -p android --profile preview --no-wait   # emits .aab (see eas.json)
```

Bump `expo.android.versionCode` in `app.json` before every build destined for Play Console —
a versionCode cannot be reused.

## Environment (Windows)

The shell is PowerShell 5.1 unless the Bash tool is used explicitly.

- `&&` is a parse error. Chain with `;`.
- Interactive shells may block `npx` via execution policy. Use `npx.cmd`.
- Gradle needs `JAVA_HOME` pointed at Android Studio's bundled JDK:
  `$env:JAVA_HOME="$env:ProgramFiles\Android\Android Studio\jbr"`.
- `adb` is not on PATH: `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`.
- Under Git Bash, `adb shell` paths need `MSYS_NO_PATHCONV=1` or `/sdcard/...` is rewritten
  into a Windows path.

## Architecture

`index.ts` → `App.tsx` → `lib/library.ts`.

**`App.tsx`** is a single component driving a four-state machine: `intro` → `scanning` →
`result`, with `denied` as the branch when the permission is refused. The `intro` screen is
not decoration — §4 and §8 require an explanation *before* `requestPermissionsAsync()` is
called, and its wording is fixed by the spec.

**`lib/library.ts`** owns everything that touches the media store. `summarizeLibrary()`
paginates the last 24 months (capped at 5,000 assets, §5.1) and counts screenshots;
`screenHeadline()` turns the ratio into Card 1's sentence. Keep media-store access here so
the network-silence guarantee stays auditable in one file.

**`probe/DeviceProbe.tsx`** is the §14 diagnostic screen. It is not rendered by the app. It
prints album names, photo counts, all three screenshot-detection strategies, and location
probe timings to logcat under the `[probe]` prefix. Swap it into `index.ts` to re-measure on
a new device — cheaper than adding instrumentation to the product screens.

### expo-media-library in SDK 57

The spec's code samples use the legacy API. In SDK 57 the legacy functions exported from the
package root are **deprecated shims that throw at runtime**. They must come from the subpath:

```ts
import * as Legacy from 'expo-media-library/legacy';   // getAssetsAsync, MediaType, SortBy
```

The root export is the newer `Query`/`Asset`/`Album` API. It was benchmarked against legacy
on device and lost — legacy paginates ~5x faster and `exeForMetadata()` omits `uri`, which
the screenshot fallback needs. Stay on legacy.

### Screenshot detection

Three strategies in priority order (§5.4), all implemented in `makeScreenshotTest`: album
membership, then `uri` containing `screenshot`, then `filename` starting with `screenshot`.
Album names are locale-dependent, so the fallbacks are load-bearing on devices that are not
an English-locale Pixel. Card 1 does not exist without this working.

### Card 1 headline

`screenHeadline()` deviates from the spec's `"1 in N"` template above a 50% ratio, where
"1 in 1.3" stops being a sentence, and says `"8 in 10"` instead. Real device data hit 78%.

## Permissions

`app.json` declares exactly `READ_MEDIA_IMAGES` and `ACCESS_MEDIA_LOCATION` (§4). The
expo-media-library plugin adds `READ_MEDIA_AUDIO` and `READ_MEDIA_VIDEO` by default; they are
suppressed with `granularPermissions: ["photo"]`. Do not reintroduce them — asking for audio
access contradicts the product's central claim.

`ACCESS_MEDIA_LOCATION` is required on Android 10+ for EXIF coordinates. Card 3 dies without it.

Verify after any `app.json` change:

```bash
npx expo prebuild -p android --clean
```

then read `android/app/src/main/AndroidManifest.xml`.

## Play Console declarations tied to the code

The app is submitted declaring that it collects nothing, has no purchases, no access
restrictions, and no advertising ID. **Adding an SDK invalidates all four.** Before shipping
RevenueCat (§11 step 12), OneSignal (15), or Layers (16), update: Data safety, Login details
(plus a promo code so reviewers can reach paid cards), the content-rating purchase question,
and the advertising ID declaration. A stale data-safety form is grounds for suspension.
