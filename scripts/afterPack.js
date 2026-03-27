const rcedit = require('rcedit');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = path.join(__dirname, '..', 'icon.ico');
  console.log('afterPack: embedding icon into', exe);
  await rcedit(exe, {
    icon: ico,
    'version-string': {
      ProductName: 'VulpiDL',
      FileDescription: 'VulpiDL',
      CompanyName: 'dord',
    }
  });
  console.log('afterPack: icon embedded');
};
