// Turns the single-file build (dist-single/index.html) into a page body that can be
// published as a hosted page: the host adds its own <html>/<head>/<body> wrapper.
// The bundled code contains strings like "</body>", so split on the real tags
// (searching from the end) rather than with a lazy regex.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const bodyOpen = src.lastIndexOf('<body>');
const bodyClose = src.lastIndexOf('</body>');
const headOpen = src.indexOf('<head>') + '<head>'.length;
const headClose = src.lastIndexOf('</head>', bodyOpen);
if (bodyOpen < 0 || bodyClose < bodyOpen || headClose < headOpen) throw new Error('Unexpected build output');

let head = src.slice(headOpen, headClose);
const body = src.slice(bodyOpen + '<body>'.length, bodyClose).trim();
head = head.replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
const titleMatch = head.match(/^\s*[\s\S]*?(<title>[^<]*<\/title>)/i);
const title = titleMatch?.[1] ?? '<title>Mystery Shop Manager</title>';
head = head.replace(title, '');
// Mount point first, then fonts and the app script.
const out = `${title}\n${body}\n${head.trim()}\n`;
writeFileSync('dist-single/mystery-shop.html', out);
console.log('dist-single/mystery-shop.html', (out.length / 1024 / 1024).toFixed(2), 'MB');
