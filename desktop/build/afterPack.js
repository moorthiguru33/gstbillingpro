// Sets the GST Billing Pro icon + version info on GST Billing Pro.exe with
// pure JS (resedit), so Windows builds made on Linux need no Wine/rcedit.
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const { productFilename } = ctx.packager.appInfo;
  const exePath = path.join(ctx.appOutDir, `${productFilename}.exe`);
  const icoPath = path.join(__dirname, '..', 'icon.ico');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  if (fs.existsSync(icoPath)) {
    const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const id = groups.length ? groups[0].id : 1;
    const lang = groups.length ? groups[0].lang : 1033;
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
  }
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = ctx.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1], v[2], 0, 1033);
    vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: 'GST Billing Pro', FileDescription: 'GST Billing Pro',
      CompanyName: 'D Printers', OriginalFilename: `${productFilename}.exe`, InternalName: 'GST Billing Pro',
      LegalCopyright: '© D Printers',
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
};
