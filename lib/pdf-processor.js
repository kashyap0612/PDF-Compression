const pdfjsLibPromise = import(chrome.runtime.getURL('vendor/pdf.mjs'));
const pdfLibPromise = import(chrome.runtime.getURL('vendor/pdf-lib.esm.min.js'));

export async function loadPdfForPreview(file) {
  const pdfjsLib = await pdfjsLibPromise;
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.mjs');

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  return { pdf, bytes };
}

export async function renderPageThumbnail(pdf, pageNumber, maxWidth = 180) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / viewport.width, 1.8);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(scaledViewport.width);
  canvas.height = Math.ceil(scaledViewport.height);

  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

  return {
    pageNumber,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
  };
}

export async function processPdf({ bytes, fileName, removePageIndexes }) {
  const { PDFDocument } = await pdfLibPromise;
  const source = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  const totalPages = source.getPageCount();
  const removeSet = new Set(removePageIndexes);
  const keepIndexes = Array.from({ length: totalPages }, (_, index) => index).filter(
    (index) => !removeSet.has(index),
  );

  if (keepIndexes.length === 0) {
    throw new Error('At least one page must remain in the PDF.');
  }

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(source, keepIndexes);
  copiedPages.forEach((page) => output.addPage(page));

  output.setProducer('ChatGPT PDF Preprocessor');
  output.setCreator('ChatGPT PDF Preprocessor');

  const optimizedBytes = await output.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 20,
    updateFieldAppearances: false,
  });

  return new File([optimizedBytes], buildOutputName(fileName), {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}

function buildOutputName(fileName) {
  const suffix = '-optimized.pdf';
  if (!fileName?.toLowerCase().endsWith('.pdf')) {
    return `${fileName || 'document'}${suffix}`;
  }

  return `${fileName.slice(0, -4)}${suffix}`;
}
