# ChatGPT PDF Preprocessor Extension

A Chrome Extension (Manifest V3) that runs only on `https://chatgpt.com`, intercepts PDF uploads before ChatGPT receives them, opens an in-page modal overlay, shows page thumbnails, lets the user choose pages to delete, and then uploads an optimized replacement PDF.

## Included files

- `manifest.json` — MV3 manifest scoped to `chatgpt.com`.
- `content.js` — capture-phase interception for file input and drag/drop uploads.
- `background.js` — service worker entrypoint.
- `lib/pdf-processor.js` — preview loading and PDF rewrite/compression logic.
- `ui/modal.js` — modal overlay behavior.
- `ui/modal.css` — modal styling.
- `vendor/` — place local `pdf.js` and `pdf-lib` browser modules here.

## Required local vendor files

This project intentionally uses **no CDN**. You must place these browser-ready files into the local `vendor/` folder before loading the extension:

1. From the official `pdfjs-dist` package:
   - copy `build/pdf.mjs` to `vendor/pdf.mjs`
   - copy `build/pdf.worker.mjs` to `vendor/pdf.worker.mjs`

2. From the official `pdf-lib` package:
   - copy `dist/pdf-lib.esm.min.js` to `vendor/pdf-lib.esm.min.js`

Your final tree should contain:

```text
vendor/
  pdf.mjs
  pdf.worker.mjs
  pdf-lib.esm.min.js
```

## How to load

1. Put the required vendor files into `vendor/`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.

## Behavior summary

- Only activates on `https://chatgpt.com/*`.
- Intercepts PDF uploads before page handlers receive the original file.
- Supports both file picker uploads and drag/drop uploads.
- If the user cancels, the original PDF continues.
- If preprocessing fails, the original PDF continues.
- Rewrites the PDF with deleted pages removed and object-stream serialization enabled to reduce file size.
- Uses async yielding while rendering thumbnails so the UI stays responsive for PDFs around 30 pages.

## Compression note

`pdf-lib` can reduce size by removing deleted pages, dropping now-unreferenced objects, and saving with object streams. It does **not** aggressively recompress embedded images by itself. If you need stronger lossy compression later, add an optional rasterization pass in a worker and rebuild the PDF from downsampled page images.
