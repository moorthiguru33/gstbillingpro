# GST Billing Pro – Android (Trusted Web Activity)

Minimal Gradle TWA (androidx.browser via `com.google.androidbrowserhelper`) that opens
https://gst-billing-pro.pages.dev/ full-screen in Chrome.

* Package: `in.dprinters.gstbillingpro` · Name: GST Billing Pro · minSdk 21 · target 35
* Icons come from `public/icons` (copied into `app/src/main/res`).
* Digital Asset Links: `public/.well-known/assetlinks.json` (served at
  `https://gst-billing-pro.pages.dev/.well-known/assetlinks.json`).

## Build

Requirements: JDK 17+ and the Android SDK (platform 35, build-tools 35.0.0).

```sh
export ANDROID_HOME=/path/to/android-sdk
export GBP_SIGNING_PROPS=/secure/path/signing.properties   # storeFile, storePassword, keyAlias, keyPassword
./gradlew bundleRelease assembleRelease
# AAB: app/build/outputs/bundle/release/app-release.aab
# APK: app/build/outputs/apk/release/app-release.apk
```

The keystore and its passwords must never be committed (see `.gitignore`).

## Play Store

1. Upload the AAB signed with the **upload key** and enrol in **Play App Signing**.
2. Copy the **App signing key certificate SHA-256** from Play Console → Setup → App integrity
   and add it to `sha256_cert_fingerprints` in `public/.well-known/assetlinks.json`
   (keep the upload-key fingerprint too), then redeploy the website. Without it, the app
   installed from Play shows a browser URL bar instead of running full-screen.
3. Bump `versionCode` / `versionName` in `app/build.gradle` for every upload.
