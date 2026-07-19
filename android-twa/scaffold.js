// One-shot, non-interactive replacement for `bubblewrap init`'s interactive wizard.
// Builds twa-manifest.json from the live PWA manifest, then generates the
// Android Studio project. Run once; re-run only if twa-manifest.json needs
// regenerating from scratch (normal config edits should just hand-edit that
// file and use `bubblewrap update` instead).
const path = require('path');
const { TwaManifest, TwaGenerator } = require('@bubblewrap/core');

const PWA_MANIFEST_URL = 'https://your-pi.tail9249a1.ts.net:8443/manifest.json';
const TARGET_DIR = __dirname;

async function main() {
  const twaManifest = await TwaManifest.fromWebManifest(PWA_MANIFEST_URL);

  twaManifest.packageId = 'com.shintech.shinracer.twa';
  twaManifest.name = 'ShinRacer';
  twaManifest.launcherName = 'ShinRacer';
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = '1.0.0';
  twaManifest.display = 'standalone';
  twaManifest.orientation = 'portrait';
  twaManifest.signingKey.path = path.join(TARGET_DIR, 'android.keystore');
  twaManifest.signingKey.alias = 'shinracer';
  twaManifest.generatorApp = 'bubblewrap-cli (scripted)';

  const err = twaManifest.validate();
  if (err) {
    console.error('twa-manifest.json failed validation:', err);
    process.exit(1);
  }

  const manifestPath = path.join(TARGET_DIR, 'twa-manifest.json');
  await twaManifest.saveToFile(manifestPath);
  console.log('Wrote', manifestPath);
  console.log(JSON.stringify(twaManifest.toJson(), null, 2));

  const twaGenerator = new TwaGenerator();
  const log = {
    debug: () => {}, log: (m) => console.log(m), info: (m) => console.log(m),
    warn: (m) => console.warn(m), error: (m) => console.error(m),
  };
  await twaGenerator.createTwaProject(TARGET_DIR, twaManifest, log, (cur, total) => {
    if (cur === total) console.log('Android project generated.');
  });

  // Mirrors generateManifestChecksumFile() from the CLI's shared.js so
  // `bubblewrap build` doesn't think the manifest changed and re-prompt.
  const crypto = require('crypto');
  const fs = require('fs');
  const manifestContents = fs.readFileSync(manifestPath);
  const sum = crypto.createHash('sha1').update(manifestContents).digest('hex');
  fs.writeFileSync(path.join(TARGET_DIR, 'manifest-checksum.txt'), sum);
  console.log('Wrote manifest-checksum.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
