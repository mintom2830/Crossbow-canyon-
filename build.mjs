// Builds the game into self-contained HTML files.
//   node build.mjs          -> dist/index.html (open directly, works offline)
//                              dist/crossbow-canyon.html (body fragment for hosts
//                              that supply their own <html>/<head>, e.g. Claude artifacts)
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--dev');
const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !watch,
  sourcemap: false,
  target: ['es2020', 'safari15'],
  write: false,
  legalComments: 'none',
  drop: watch ? [] : ['console', 'debugger'],   // three.js warning strings are dead weight in the shipped page
  banner: { js: '/* Crossbow Canyon — includes three.js (MIT, © 2010-2024 three.js authors) */' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// pictures in src/assets are written into the page itself (__ASSET(name.webp)__ in the template)
const withAssets = (html) => html.replace(/__ASSET\(([\w.-]+)\)__/g, (_, f) => `data:image/${f.split('.').pop()};base64,${readFileSync('src/assets/' + f).toString('base64')}`);
let template = withAssets(readFileSync('src/index.template.html', 'utf8'));
if (!watch) {
  // minify the stylesheet and drop line-break indentation between tags
  const m = template.match(/<style>([\s\S]*?)<\/style>/);
  if (m) {
    const css = (await transform(m[1], { loader: 'css', minify: true })).code.trim();
    template = template.replace(m[0], () => `<style>${css}</style>`);
  }
  template = template.replace(/>\s*\n\s*</g, '><').replace(/<!--(?!\s*\/\*)[\s\S]*?-->/g, '');
}
const fragment = template.replace('/*__BUNDLE__*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/crossbow-canyon.html', fragment);
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#e9b578">
<meta name="description" content="Crossbow Canyon: a 3D tower-defense game. Collect gold, build crossbows and cannons, and hold the town against 16 waves of rats.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Crossbow Canyon">
<style>html,body{margin:0;padding:0}[hidden]{display:none!important}</style>
</head>
<body>
${fragment}
</body>
</html>
`;
writeFileSync('dist/index.html', full);
// Two-file version for hosts that serve supporting files: a small page plus game.js.
mkdirSync('dist/artifact', { recursive: true });
writeFileSync('dist/artifact/game.js', js);
writeFileSync('dist/artifact/index.html', template.replace('<script>/*__BUNDLE__*/</script>', '<script src="game.js"></script>'));
console.log(`built dist/index.html (${(full.length / 1024).toFixed(0)} KB), dist/crossbow-canyon.html`);
