#!/usr/bin/env node
// In CI, install the project's fixed debug keystore so every APK has the SAME signature.
// Without it each GitHub run creates a new random key and Android refuses to update the app
// (you would have to uninstall it and lose the events saved on the phone).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.env.CI) {
  const dir = join(homedir(), ".android");
  mkdirSync(dir, { recursive: true });
  const src = new URL("../signing/debug.keystore", import.meta.url);
  if (existsSync(src)) {
    copyFileSync(src, join(dir, "debug.keystore"));
    console.log("Debug keystore del progetto installato (firma APK stabile).");
  }
}
