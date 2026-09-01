function ensurePdfJsReady() {
  if (!window.pdfjsLib) throw new Error('PDF 解析库未加载');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function getPdfPageCount(file) {
  ensurePdfJsReady();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  return pdf.numPages;
}

async function extractPdfPageRange(file, startPage, endPage) {
  if (!window.PDFLib) throw new Error('PDF 裁剪库未加载');
  const { PDFDocument } = PDFLib;

  const srcBytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(srcBytes);
  const total = srcDoc.getPageCount();

  const start = Math.max(1, Math.min(startPage, total));
  const end = Math.max(start, Math.min(endPage, total));
  const indices = [];
  for (let i = start - 1; i < end; i++) indices.push(i);

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, indices);
  copied.forEach(page => newDoc.addPage(page));

  const pdfBytes = await newDoc.save();
  const baseName = file.name.replace(/\.pdf$/i, '');
  const rangeLabel = start === end ? `${start}` : `${start}-${end}`;
  return new File([pdfBytes], `${baseName}_p${rangeLabel}.pdf`, { type: 'application/pdf' });
}

window.PdfRange = {
  getPdfPageCount,
  extractPdfPageRange,
};
