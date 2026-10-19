// build.js — builds "NINA Lite" from the sources of the main extension.
//
//   node lite/build.js        → dist/NINA-Lite/  and  NINA-Lite-<version>.zip
//
// Lite keeps three things: the series library ("Meine Serien" + the tracking
// on the streaming sites), faster playback speed, and auto-skip. The manifest
// is derived from the main one (same sites, same scripts minus the dropped
// ones), so both stay in sync; only the background worker and the settings
// page are Lite's own (lite/background.js, lite/ui/).
//
// Lite uses the same "key" (= same extension ID) and OAuth client as NINA, so
// the Google sign-in (watch status sync via Drive) works with the existing
// client. That also means Lite and NINA cannot be installed at the same time.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'NINA-Lite');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const read = (p) => JSON.parse(rd(p));

const main = read('manifest.json');

// content scripts Lite keeps
const KEEP_JS = new Set([
  'content/speed-patch.js', 'content/audio-patch.js', 'content/frame-speed.js',
  'content/joyn.js', 'content/universal.js',
  'content/cr-api-main.js', 'content/crunchyroll-watch-status.js', 'content/anilist-crunchyroll.js',
  'content/stream-watch.js', 'content/stream-series.js',
  'lib/library-core.js', 'lib/library-providers.js'
]);

const contentScripts = main.content_scripts
  .map((cs) => ({ ...cs, js: (cs.js || []).filter((f) => KEEP_JS.has(f)) }))
  .filter((cs) => cs.js.length);
// Drive sync of the watch status needs window.NinaDrive in the pages that track
// (the main extension loads it on every page for the notes; Lite only where needed)
{
  const driveHosts = [...new Set(contentScripts
    .filter((cs) => cs.js.includes('content/stream-watch.js') || cs.js.includes('content/crunchyroll-watch-status.js'))
    .flatMap((cs) => cs.matches))];
  const at = contentScripts.findIndex((cs) => cs.js.includes('content/stream-watch.js') || cs.js.includes('content/crunchyroll-watch-status.js'));
  contentScripts.splice(at, 0, { matches: driveHosts, js: ['lib/google-drive.js'], run_at: 'document_idle', all_frames: false });
}
// the css only goes where a script of ours goes (overlay.css belongs to universal/joyn/frame-speed)
for (const cs of contentScripts) if (!cs.css || !cs.css.length) delete cs.css;

const manifest = {
  manifest_version: 3,
  name: 'NINA Lite',
  short_name: 'NINA Lite',
  version: main.version,
  key: main.key,
  description: 'Meine Serien (Serien-Tracking & Bibliothek), schnellere Wiedergabe auf jeder Webseite und automatisches Überspringen von Intros.',
  author: 'NINA',
  permissions: ['activeTab', 'storage', 'scripting', 'tabs', 'identity', 'alarms', 'notifications'],
  oauth2: main.oauth2,
  host_permissions: main.host_permissions.filter((h) =>
    !/sponsor.ajay.app|returnyoutubedislikeapi|generativelanguage/.test(h)),
  background: { service_worker: 'background.js' },
  content_scripts: contentScripts,
  options_ui: { page: 'ui/options.html', open_in_tab: true },
  action: {
    default_popup: 'ui/popup.html',
    default_title: 'NINA Lite',
    default_icon: main.action.default_icon
  },
  icons: main.icons,
  web_accessible_resources: [
    { resources: ['icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png', 'icons/icon.png'], matches: ['<all_urls>'] }
  ]
};

// ── files ──────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
const put = (rel, data) => {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
};
const copy = (rel, from = rel) => put(rel, fs.readFileSync(path.join(ROOT, from)));

put('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
copy('background.js', 'lite/background.js');

for (const cs of contentScripts) {
  for (const f of cs.js) copy(f);
  for (const f of cs.css || []) copy(f);
}
for (const f of ['lib/anilist-bg.js', 'lib/view-log-bg.js', 'lib/hotkeys-shared.js']) copy(f);
for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) {
  if (/^icon(16|32|48|128)?\.png$/.test(f)) copy('icons/' + f);
}
for (const f of [
  'ui/popup.html', 'ui/popup.js',
  'ui/library.html', 'ui/library.js', 'ui/library.css',
  'ui/options.css', 'ui/sidepanel-custom.css', 'ui/tailwind.min.css',
  'ui/anilist-settings.js', 'ui/crunchyroll-settings.js'
]) copy(f);
copy('ui/options.js', 'lite/ui/options.js');

// settings page: Lite's template + the AniList section and styles of the main page
const mainOptions = rd('ui/options.html');
const styleStart = mainOptions.indexOf('<style>') + '<style>'.length;
const style = mainOptions.slice(styleStart, mainOptions.indexOf('</style>'));

const secStart = mainOptions.indexOf('<section id="cat-anilist"');
let anilist = mainOptions.slice(secStart, mainOptions.indexOf('</section>', secStart) + '</section>'.length);
if (secStart < 0) throw new Error('AniList section not found in ui/options.html');
// the new-tab news switch means nothing without a new tab
{
  const k = anilist.indexOf('nina_notif_newtab');
  const from = anilist.lastIndexOf('<div class="setting-item settings-row">', k);
  const labelEnd = anilist.indexOf('</label>', k);
  const to = anilist.indexOf('</div>', labelEnd) + '</div>'.length;
  if (k < 0 || from < 0 || labelEnd < 0) throw new Error('new-tab switch not found in the AniList section');
  anilist = anilist.slice(0, from).trimEnd() + anilist.slice(to);
}

put('ui/options.html', rd('lite/ui/options.template.html')
  .replace('<!--@STYLE-->', () => style)
  .replace('<!--@ANILIST-->', () => '        ' + anilist));

// ── checks: every file the manifest / HTML / worker names must exist ───────
const missing = [];
const need = (rel) => { if (!fs.existsSync(path.join(OUT, rel))) missing.push(rel); };
contentScripts.forEach((cs) => [...cs.js, ...(cs.css || [])].forEach(need));
(rd('lite/background.js').match(/importScripts\(([^)]*)\)/)[1].match(/'([^']+)'/g) || []).forEach((s) => need(s.slice(1, -1)));
for (const html of ['ui/popup.html', 'ui/library.html', 'ui/options.html']) {
  const text = fs.readFileSync(path.join(OUT, html), 'utf8');
  for (const m of text.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(https?:|data:|mailto:)/.test(m[1])) continue;
    need(path.posix.normalize(path.posix.join(path.posix.dirname(html), m[1])));
  }
}
need('icons/icon16.png'); need('icons/icon.png');
if (missing.length) throw new Error('missing in Lite build: ' + [...new Set(missing)].join(', '));

// ── zip (tar -a writes a zip with forward slashes; ships with Windows 10+, macOS, Linux) ──
const zip = path.join(ROOT, `NINA-Lite-${main.version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync(process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar', ['-a', '-c', '-f', zip, '-C', OUT, ...fs.readdirSync(OUT)], { stdio: 'inherit' });
const count = (function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0); })(OUT);
console.log(`NINA Lite ${main.version}: ${count} files → ${path.relative(ROOT, zip)} (${Math.round(fs.statSync(zip).size / 1024)} KB)`);
