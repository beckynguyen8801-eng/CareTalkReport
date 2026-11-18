// stdin JS -> stdout JS that older parsers accept (ES2017: no ?., ??, ||=), with "</" escaped
// and "//" escaped so no HTML/script sanitizer can mistake a string for a closing tag.
const esbuild = require('esbuild');
let src = '';
process.stdin.on('data', d => (src += d)).on('end', () => {
  const { code } = esbuild.transformSync(src, { loader: 'js', target: 'es2017', charset: 'utf8', minifyWhitespace: true, legalComments: 'none' });
  // Apps Script's HtmlService breaks string literals containing "//" (e.g. "https://…") — escape as "\/\/".
  const out = code.replace(/<\//g, '<\\/').replace(/\/\//g, '\\/\\/');
  process.stdout.write(out);
});
