const MIME_PDF = 'application/pdf';
const processedFiles = new WeakSet();
let activeInterception = null;
let dependenciesPromise = null;

bootstrap();

function bootstrap() {
  document.addEventListener('change', onInputChangeCapture, true);
  document.addEventListener('drop', onDropCapture, true);
  document.addEventListener('dragover', onDragOverCapture, true);
}

async function getDependencies() {
  if (!dependenciesPromise) {
    dependenciesPromise = Promise.all([
      import(chrome.runtime.getURL('lib/pdf-processor.js')),
      import(chrome.runtime.getURL('ui/modal.js')),
    ]).then(([processor, modal]) => ({ ...processor, ...modal }));
  }
  return dependenciesPromise;
}

function onDragOverCapture(event) {
  const items = Array.from(event.dataTransfer?.items || []);
  if (items.some((item) => item.type === MIME_PDF)) {
    event.preventDefault();
  }
}

async function onInputChangeCapture(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
    return;
  }

  const file = input.files?.[0];
  if (!file || file.type !== MIME_PDF || processedFiles.has(file) || activeInterception) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  activeInterception = { source: 'input', input };

  try {
    const replacement = await preparePdf(file);
    const nextFile = replacement || file;
    processedFiles.add(nextFile);
    setInputFiles(input, [nextFile]);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (error) {
    console.error('[ChatGPT PDF Preprocessor] Falling back to original file after input interception error.', error);
    processedFiles.add(file);
    setInputFiles(input, [file]);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    activeInterception = null;
  }
}

async function onDropCapture(event) {
  const pdfFiles = Array.from(event.dataTransfer?.files || []).filter((file) => file.type === MIME_PDF);
  if (!pdfFiles.length || activeInterception) {
    return;
  }

  const [file] = pdfFiles;
  if (processedFiles.has(file)) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  activeInterception = { source: 'drop', target: event.target };

  try {
    const replacement = await preparePdf(file);
    const nextFile = replacement || file;
    processedFiles.add(nextFile);
    redispatchDrop(event, nextFile);
  } catch (error) {
    console.error('[ChatGPT PDF Preprocessor] Falling back to original file after drop interception error.', error);
    processedFiles.add(file);
    redispatchDrop(event, file);
  } finally {
    activeInterception = null;
  }
}

async function preparePdf(file) {
  const { loadPdfForPreview, processPdf, renderPageThumbnail, PdfSelectionModal } = await getDependencies();
  const { pdf, bytes } = await loadPdfForPreview(file);
  const modal = new PdfSelectionModal({
    file,
    pageCount: pdf.numPages,
    onCancel: () => {
      modal.destroy();
      resolver(null);
    },
    onConfirm: async (removePageIndexes) => {
      if (removePageIndexes.length >= pdf.numPages) {
        modal.updateStatus();
        return;
      }

      modal.setBusy(true, 'Optimizing PDF…');
      try {
        const processed = await processPdf({ bytes, fileName: file.name, removePageIndexes });
        modal.destroy();
        resolver(processed);
      } catch (error) {
        console.error('[ChatGPT PDF Preprocessor] PDF processing failed; original file will be used.', error);
        modal.destroy();
        resolver(null);
      }
    },
  });

  let resolver;
  const result = new Promise((resolve) => {
    resolver = resolve;
  });

  await modal.mount();

  const thumbnails = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    thumbnails.push(await renderPageThumbnail(pdf, pageNumber));
    modal.setPages(thumbnails);
    await yieldToMain();
  }

  modal.setPages(thumbnails);
  return result;
}

function setInputFiles(input, files) {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  input.files = dataTransfer.files;
}

function redispatchDrop(originalEvent, file) {
  const target = originalEvent.target instanceof Element
    ? originalEvent.target
    : document.elementFromPoint(originalEvent.clientX, originalEvent.clientY) || document.body;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const syntheticDrop = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: originalEvent.clientX,
    clientY: originalEvent.clientY,
  });

  Object.defineProperty(syntheticDrop, 'dataTransfer', {
    value: dataTransfer,
  });

  target.dispatchEvent(syntheticDrop);
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
