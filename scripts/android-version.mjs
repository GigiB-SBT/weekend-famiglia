#!/usr/bin/env node
// Capacitor hook (capacitor:sync:after), runs after every `cap sync android`:
// 1. increasing versionCode (GitHub run number) → Android installs the APK as an UPDATE and keeps data;
// 2. location permissions for "Esplora → vicino a me" (the Geolocation plugin does not add them itself).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const gradle = "android/app/build.gradle";
const run = Number(process.env.GITHUB_RUN_NUMBER || 0);
if (existsSync(gradle) && run > 0) {
  const s = readFileSync(gradle, "utf8")
    .replace(/versionCode\s+\d+/, `versionCode ${run}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "beta-${run}"`);
  writeFileSync(gradle, s);
  console.log(`versionCode ${run}, versionName beta-${run}`);
}

const manifest = "android/app/src/main/AndroidManifest.xml";
if (existsSync(manifest)) {
  let m = readFileSync(manifest, "utf8");
  const add = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  ].filter((line) => !m.includes(line.match(/name="([^"]+)"/)[1]));
  if (add.length) {
    m = m.replace(/<\/manifest>\s*$/, `    ${add.join("\n    ")}\n</manifest>\n`);
    writeFileSync(manifest, m);
    console.log(`AndroidManifest: aggiunti ${add.length} permessi posizione`);
  }
}
