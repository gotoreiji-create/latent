# Closed testing log

Kept for the Play Console production-access request, which asks how the app was
tested, what testers reported, and what changed as a result. Written as things
happen — reconstructing it afterwards produces vague answers.

Closed test opened **2026-08-02**. Testers recruited from the RevenueCat Shipaton
Discord and the Androidクローズドテスト攻略組 community.

---

## Devices the app has run on

| Device | OS | Result |
|---|---|---|
| Pixel 7a | Android 16 | Works. 280 photos, 6 in 10 a screen. |
| Galaxy S26 Ultra | Android 16 | Works. 798 photos, 1 in 3 a screen. |
| Redmi 12 5G | Android 15 / HyperOS 2.0.12.0 | **Reported 0 photos.** Fixed in versionCode 3. |
| (unnamed, batty\_\_) | — | Works. Both counts displayed. |

---

## Reports and what changed

### 1. Region lock kept testers out — 2026-08-02

**Reported by** batty\_\_ (Shipaton Discord).
The closed test track was limited to 5 countries, so the install link failed for
everyone outside them.

**Change** — track opened to 171 countries. Tester confirmed the install worked
afterwards. No app change.

### 2. Zero photos on Xiaomi HyperOS — 2026-08-03

**Reported by** あみの酸267 (Redmi 12 5G, HyperOS 2.0.12.0, Android 15).
The result screen showed "There is nothing here yet" and 0 for every figure.
Photo permission was set to "always allow all", so this was not a permission
problem. A second tester on a Galaxy S26 Ultra with the same permission setting
saw correct numbers, which ruled out the permission path entirely.

**Cause** — the scan passed `createdAfter` to `getAssetsAsync()`, so the media
store filtered on `DATE_TAKEN` before returning anything. HyperOS leaves that
column empty for images its own gallery did not write, so every row was dropped
before the app could see it.

**Change (versionCode 3)** — the 24-month window is now applied in the app rather
than by the media store, falling back to `modificationTime` when `creationTime`
is absent, and keeping photos that carry no date at all. If no photo on the
device has a usable date, the window is abandoned and the whole library is
counted, with the result screen saying so instead of showing zero.

**Side effect** — the Pixel 7a count rose from 201 to 280. The same 79 photos had
been silently dropped there too, so this was a difference of degree, not a
Xiaomi-only fault.

### 3. Explanation screen on every launch — 2026-08-03

**Reported by** 小池泰樹 (Galaxy S26 Ultra, Android 16).
The app recomputed from scratch on each launch and always opened on the privacy
explanation.

**Change (versionCode 3)** — the aggregate result is cached against a fingerprint
of the library (newest photo id plus total count) and reused until the library
changes. Only the aggregate is stored; nothing about any individual photo is
persisted.

### 4. English-only interface — 2026-08-03

**Reported by** the 買い物ルートメモ developer.
Asked whether the English screen was the intended state.

**No change.** The app targets English-speaking users and ships no localisation
mechanism by design. Recorded because it will be asked again.

---

## Known gaps

- The limited-access screen added in versionCode 3 has not been reproduced on a
  real device. `adb` cannot produce a genuine partial grant — revoking
  `READ_MEDIA_IMAGES` yields `denied` rather than `limited`.
- Falling back to `modificationTime` counts a photo copied onto the device
  recently as a recent photo. Accepted to avoid the zero-result failure.
