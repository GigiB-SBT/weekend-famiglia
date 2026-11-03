#!/usr/bin/env node
// Capacitor hook (capacitor:sync:after): gives each APK an increasing versionCode
// (the GitHub run number), so Android installs it as an UPDATE over the previous one
// and keeps the saved data.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "android/app/build.gradle";
const run = Number(process.env.GITHUB_RUN_NUMBER || 0);
if (existsSync(file) && run > 0) {
  const s = readFileSync(file, "utf8")
    .replace(/versionCode\s+\d+/, `versionCode ${run}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "beta-${run}"`);
  writeFileSync(file, s);
  console.log(`versionCode ${run}, versionName beta-${run}`);
}
