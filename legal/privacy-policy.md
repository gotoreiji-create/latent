# Privacy Policy for Latent

**Effective date:** August 2, 2026
**Last updated:** September 2, 2026

Latent is an Android application that reads metadata from the photo library on your
device and shows you a small number of summary cards about it.

This policy explains exactly what Latent reads, what stays on your device, and what
is sent elsewhere.

---

## 1. Latent does not look at your pictures

Latent never reads, decodes, displays, copies, uploads, or transmits the visual
content of any photo.

From each photo, Latent reads only:

| Field | Why |
|---|---|
| Date and time the photo was taken | To count photos per month and per hour of day |
| GPS coordinates, when present | To find repeated locations |
| File name and file path | To detect whether the file is a screenshot |
| Album membership | To detect whether the file is a screenshot |
| Pixel width and height | To lay out the summary grid |

Latent does not perform object recognition, face recognition, face identification,
scene classification, or any other analysis of image content.

---

## 2. Your photos never leave this device

All processing happens locally on your device. No photo, and no data derived from
any individual photo, is ever transmitted off your device.

In particular, Latent never transmits:

- photo files, thumbnails, or any image data
- GPS coordinates
- timestamps
- file names, file paths, or album names
- the aggregate results Latent calculates from your library

Latent does not perform reverse geocoding. Coordinates are never sent to a mapping
service, a geocoding service, or any other server, and Latent does not display maps
or place names.

Latent has no account system, no login, no cloud sync, and no backend server
operated by us. There is no database anywhere that holds your photo data.

---

## 3. What Latent stores on your device

Latent stores the calculated summary results — for example, "this many photos were
screenshots" or "the most frequent hour was 7pm" — in the app's private storage on
your device, so it does not need to recalculate them each time you open the app.

Latent does not store copies of individual photos or per-photo records.

This data is removed when you uninstall Latent, or when you clear the app's storage
in Android system settings.

---

## 4. Permissions Latent requests

| Permission | Purpose |
|---|---|
| `READ_MEDIA_IMAGES` | To read the metadata described in section 1 |
| `ACCESS_MEDIA_LOCATION` | To read GPS coordinates stored inside photo files |
| `INTERNET` | Used only to verify subscription purchases with RevenueCat. No photo data travels over it. |
| `com.android.vending.BILLING` | To offer the subscription through Google Play |

You may decline either permission, and you may revoke them at any time in Android
system settings. If you decline, Latent will explain what it cannot show you and
will continue to run.

---

## 5. Third-party services Latent does connect to

Latent is not entirely offline. One third-party service is used, and it receives
only the data listed below. **It receives nothing derived from your photos.**

### RevenueCat

Used to process and verify subscription purchases.

Receives: purchase and subscription status, and an anonymous app-generated user
identifier that is not linked to your name, email address, or photo data.

Privacy policy: https://www.revenuecat.com/privacy

Latent contains no advertising, no analytics, and no crash reporting. It does not
collect an advertising ID.

---

## 6. What we do not do

- We do not sell your personal information.
- We do not share your personal information with advertisers.
- We do not build advertising profiles.
- We do not use your data to train machine learning models.
- Latent does not call any large language model or other external analysis API.

---

## 7. Children

Latent is not directed to children under 13, and we do not knowingly collect
personal information from children under 13.

---

## 8. Your rights

Because Latent stores your data only on your own device, you control it directly:

- **To see what Latent holds:** open the app.
- **To delete everything:** uninstall Latent, or clear the app's storage in Android
  system settings.
- **To stop Latent reading your library:** revoke the media permission in Android
  system settings.

For subscription data held by RevenueCat, contact us at the address below and we
will help you make a deletion request.

---

## 9. Changes to this policy

If this policy changes, the "Last updated" date above will change, and the current
version will always be available at this URL.

---

## 10. Contact

**Email:** goto.reiji@gmail.com

**Developer:** 後藤史兆
