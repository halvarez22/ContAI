/**
 * Genera MANUAL_USUARIO.pdf desde el manual con capturas de pantalla.
 * Uso: node scripts/build-manual-pdf.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Manual principal del proyecto (incluye capturas de pantalla)
const mdPath = join(root, 'MANUAL_USUARIO.md');
const pdfPath = join(root, 'MANUAL_USUARIO.pdf');

console.log('Leyendo manual desde:', mdPath);

let md = readFileSync(mdPath, 'utf8');

// Convertir rutas de imágenes absolutas de Windows a file:// para Playwright
md = md.replace(
  /!\[([^\]]*)\]\(([A-Z]:\\[^)]+\.(jpg|jpeg|png|webp))\)/gi,
  (_, alt, imgPath) => {
    const fileUrl = 'file:///' + imgPath.replace(/\\/g, '/');
    return `![${alt}](${fileUrl})`;
  }
);

const body = await marked.parse(md, { gfm: true, breaks: false });

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Manual ContAI — Pruebas de campo</title>
  <style>
    @page { size: A4; margin: 16mm 18mm; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      max-width: 720px;
      margin: 0 auto;
      color: #111;
      font-size: 11pt;
      line-height: 1.5;
    }

    /* Encabezados */
    h1 {
      font-size: 1.6rem;
      margin: 0 0 0.5em;
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 0.3em;
      color: #1e1b4b;
    }
    h2 {
      font-size: 1.2rem;
      margin: 1.6em 0 0.5em;
      color: #1e1b4b;
      border-left: 4px solid #4f46e5;
      padding-left: 10px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 1.05rem;
      margin: 1em 0 0.4em;
      color: #312e81;
      page-break-after: avoid;
    }

    /* Párrafos y listas */
    p  { margin: 0.5em 0; }
    ul, ol { margin: 0.4em 0; padding-left: 1.4em; }
    li { margin: 0.25em 0; }

    /* Tablas */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.9em 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 9px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eef2ff; font-weight: 600; color: #1e1b4b; }
    tr:nth-child(even) td { background: #f8fafc; }

    /* Separadores */
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.6em 0; }

    /* Código e inline */
    strong { font-weight: 600; }
    em { font-style: italic; }
    code {
      background: #f1f5f9;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'Consolas', monospace;
    }

    /* Blockquotes (alertas NOTE/TIP/WARNING/IMPORTANT/CAUTION) */
    blockquote {
      margin: 0.8em 0;
      padding: 10px 14px;
      border-left: 4px solid #4f46e5;
      background: #eef2ff;
      border-radius: 0 6px 6px 0;
      color: #1e1b4b;
      page-break-inside: avoid;
    }
    blockquote p { margin: 0; }

    /* Imágenes */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0.8em auto 0.4em;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      page-break-inside: avoid;
    }
    /* Pie de imagen generado por el alt text */
    img + em, p > img + em {
      display: block;
      text-align: center;
      font-size: 9pt;
      color: #64748b;
      margin-top: 2px;
    }

    /* Footer por página */
    @media print {
      .page-footer {
        position: fixed;
        bottom: 0;
        width: 100%;
        text-align: center;
        font-size: 8pt;
        color: #94a3b8;
        border-top: 1px solid #e2e8f0;
        padding-top: 4px;
      }
    }
  </style>
</head>
<body>
  ${body}
  <div class="page-footer">ContAI · Manual para pruebas de campo · Agosto 2026</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });

// Esperar a que todas las imágenes carguen
await page.evaluate(() =>
  Promise.all(
    Array.from(document.images)
      .filter(img => !img.complete)
      .map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))
  )
);

await page.pdf({
  path: pdfPath,
  format: 'A4',
  margin: { top: '16mm', bottom: '16mm', left: '18mm', right: '18mm' },
  printBackground: true,
  displayHeaderFooter: false,
});

await browser.close();
console.log('✅ PDF generado:', pdfPath);
