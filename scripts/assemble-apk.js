// Builds a debug APK and prints where it landed.
//
// `npm run android:install` is the one to use when a phone is plugged in — it
// builds and installs in one step. This script is for the other case: producing
// an .apk file you can hand to someone whose phone is not in front of you.
//
// It only wraps the Gradle wrapper. The reason it exists at all is that the
// wrapper has two different names depending on the platform, so a plain npm
// script string cannot invoke it portably.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ANDROID = path.resolve(__dirname, '..', 'android');
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

if (!fs.existsSync(path.join(ANDROID, wrapper.replace('./', '')))) {
    console.error(`Could not find ${wrapper} in android/. Run "npm install" first.`);
    process.exit(1);
}

console.log(`Running ${wrapper} assembleDebug in android/ ...`);
const res = spawnSync(wrapper, ['assembleDebug'], {
    cwd: ANDROID,
    stdio: 'inherit',
    // Needed on Windows: gradlew.bat is a batch file, not an executable.
    shell: process.platform === 'win32',
});

if (res.error) {
    console.error('Could not start Gradle:', res.error.message);
    process.exit(1);
}
if (res.status !== 0) {
    // Gradle has already printed the real reason; the usual ones are a missing
    // JDK 21 (JAVA_HOME unset) or a missing Android SDK (no local.properties
    // and no ANDROID_HOME). See ANDROID_SETUP.md.
    process.exit(res.status);
}

const apk = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (fs.existsSync(apk)) {
    const mb = (fs.statSync(apk).size / (1024 * 1024)).toFixed(1);
    console.log(`\nAPK ready (${mb} MB):\n  ${apk}\n`);
    console.log('Send that file to whoever needs it. On their phone they must allow');
    console.log('"install unknown apps" for whatever app opens it (Files, Drive, WhatsApp).');
} else {
    console.warn('\nGradle succeeded but the APK is not where expected:\n  ' + apk);
    process.exit(1);
}
