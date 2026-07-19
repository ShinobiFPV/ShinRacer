// Generates the production signing keystore for the TWA. Run once — losing
// this keystore or its password means the app can never be updated again
// under the same package id, so the password is written to
// .keystore-credentials.txt (gitignored) for William to move into a
// password manager, not treated as disposable.
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Config, JdkHelper, KeyTool, ConsoleLog } = require('@bubblewrap/core');

const CONFIG_PATH = path.join(require('os').homedir(), '.bubblewrap', 'config.json');
const KEYSTORE_PATH = path.join(__dirname, 'android.keystore');
const CREDS_PATH = path.join(__dirname, '.keystore-credentials.txt');

async function main() {
  if (fs.existsSync(KEYSTORE_PATH)) {
    console.log('Keystore already exists at', KEYSTORE_PATH, '- not overwriting.');
    return;
  }

  const config = Config.deserialize(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const jdkHelper = new JdkHelper(process, config);
  const keyTool = new KeyTool(jdkHelper, new ConsoleLog('keygen'));

  const keystorePassword = crypto.randomBytes(18).toString('base64').replace(/[/+=]/g, 'x');
  const keyPassword = keystorePassword; // one password for both, single-key store

  await keyTool.createSigningKey({
    path: KEYSTORE_PATH,
    alias: 'shinracer',
    password: keystorePassword,
    keypassword: keyPassword,
    fullName: 'William Kew',
    organizationalUnit: 'ShinTech Electronics',
    organization: 'ShinTech Electronics',
    country: 'US',
  });

  fs.writeFileSync(
    CREDS_PATH,
    `ShinRacer TWA signing keystore\n` +
    `Generated ${new Date().toISOString()}\n\n` +
    `Keystore file: android.keystore\n` +
    `Alias: shinracer\n` +
    `Keystore password: ${keystorePassword}\n` +
    `Key password: ${keyPassword}\n\n` +
    `Back this up (keystore file + this password) somewhere durable -- a password\n` +
    `manager plus an offline copy of android.keystore. If both are lost, this app\n` +
    `can never be updated again under com.shintech.shinracer.twa; a fresh install\n` +
    `would be a different app to every user's phone (different signature).\n`,
  );

  console.log('Keystore created at', KEYSTORE_PATH);
  console.log('Credentials written to', CREDS_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
