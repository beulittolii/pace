/** Regenerate the study PDF from the very same content/renderer used by the exam. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function studyDocument() {
  const context = vm.createContext({});
  for (const file of ['grammar_data.js', 'grammar_paper.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const paper = vm.runInContext("GrammarPaper.render(GRAMMAR_UNITS['relative-pronouns'], text => GrammarPaper.studyText(text))", context);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>관계대명사 개념 학습</title>
<style>
  @page { size: A4; margin: 14mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; background: white; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 10pt; line-height: 1.65; word-break: keep-all; overflow-wrap: anywhere; }
  h1 { font-size: 25pt; line-height: 1.2; margin: 0 0 5mm; color: #111827; }
  h2 { font-size: 12pt; margin: 5mm 0 2mm; }
  h3 { font-size: 10.8pt; margin: 0 0 1mm; }
  p { margin: 0 0 1mm; }
  .grammar-definition { display: flex; gap: 4mm; border-top: 2px solid #172033; border-bottom: 1px solid #94a3b8; padding: 3mm 0; }
  .grammar-definition > strong { white-space: nowrap; }
  .grammar-section { margin: 0 0 4mm; break-inside: avoid; }
  .grammar-section:nth-of-type(5) { break-before: page; }
  .grammar-example { background: #f1f5f9; padding: 1.5mm 2mm; margin: 1.5mm 0; font-weight: 600; }
  .grammar-muted { color: #475569; }
  .grammar-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9pt; line-height: 1.6; }
  .grammar-table th, .grammar-table td { border: 1px solid #94a3b8; padding: 2mm; vertical-align: top; }
  .grammar-table th { width: 17%; background: #f1f5f9; text-align: left; }
  .grammar-table td:nth-last-child(2) { width: 35%; }
  tr { break-inside: avoid; }
</style></head><body><article class="grammar-paper">${paper}</article></body></html>`;
}

async function main() {
  const html = studyDocument();
  if (process.argv.includes('--html')) { process.stdout.write(html); return; }
  const { chromium } = require('playwright');
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const output = path.join(root, '관계대명사_개념학습.pdf');
    await page.pdf({ path: output, format: 'A4', preferCSSPageSize: true, printBackground: true });
    console.log(output);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
