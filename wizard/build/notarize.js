const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function notarize({ appOutDir, packager }) {
  if (packager.platform.name !== 'mac') return;
  if (process.env.SKIP_NOTARIZE === '1') { console.log('Notarization skipped (SKIP_NOTARIZE=1).'); return; }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const zipPath = path.join(appOutDir, `${appName}.zip`);

  console.log(`\nNotarizing ${appPath}...`);

  try {
    // notarytool requires a zip, pkg, or dmg — zip the .app first
    execSync(
      `ditto -c -k --keepParent "${appPath}" "${zipPath}"`,
      { stdio: 'inherit' }
    );
    execSync(
      `xcrun notarytool submit "${zipPath}" --keychain-profile "nogoon-notary" --wait`,
      { stdio: 'inherit' }
    );
    fs.rmSync(zipPath, { force: true });
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });
    console.log('Notarization complete.');
  } catch (e) {
    fs.rmSync(zipPath, { force: true });
    console.error('Notarization failed:', e.message);
    throw e;
  }
};
