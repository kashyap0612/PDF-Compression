const stylesPromise = fetch(chrome.runtime.getURL('ui/modal.css')).then((response) => response.text());

export class PdfSelectionModal {
  constructor({ file, pageCount, onConfirm, onCancel }) {
    this.file = file;
    this.pageCount = pageCount;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.removedPages = new Set();
    this.elements = {};
  }

  async mount() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-cgp-modal-root', '');
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = await stylesPromise;

    const overlay = document.createElement('div');
    overlay.className = 'cgp-overlay';

    overlay.innerHTML = `
      <section class="cgp-modal" role="dialog" aria-modal="true" aria-label="Optimize PDF before upload">
        <header class="cgp-header">
          <div>
            <div class="cgp-title">Optimize PDF before upload</div>
            <div class="cgp-subtitle">Preview pages, remove what you do not need, then continue with a smaller PDF.</div>
          </div>
          <div class="cgp-chip">${escapeHtml(this.file.name)}</div>
        </header>
        <div class="cgp-toolbar">
          <div class="cgp-meta">${this.pageCount} pages detected</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="cgp-button cgp-button-secondary" data-action="keep-all">Keep all pages</button>
            <button class="cgp-button cgp-button-secondary" data-action="remove-all-but-first" ${this.pageCount < 2 ? 'disabled' : ''}>Remove pages 2-${this.pageCount}</button>
          </div>
        </div>
        <main class="cgp-grid" data-role="grid">
          <div class="cgp-loading">Rendering thumbnails…</div>
        </main>
        <footer class="cgp-footer">
          <div class="cgp-status" data-role="status">No pages marked for removal.</div>
          <div style="display:flex; gap:10px;">
            <button class="cgp-button cgp-button-secondary" data-action="cancel">Use original PDF</button>
            <button class="cgp-button cgp-button-primary" data-action="confirm">Apply changes</button>
          </div>
        </footer>
      </section>
    `;

    this.shadowRoot.append(style, overlay);
    document.documentElement.appendChild(this.host);

    this.elements.grid = this.shadowRoot.querySelector('[data-role="grid"]');
    this.elements.status = this.shadowRoot.querySelector('[data-role="status"]');
    this.elements.confirm = this.shadowRoot.querySelector('[data-action="confirm"]');
    this.elements.cancel = this.shadowRoot.querySelector('[data-action="cancel"]');

    this.shadowRoot.querySelector('[data-action="keep-all"]').addEventListener('click', () => {
      this.removedPages.clear();
      this.syncCheckboxes();
      this.updateStatus();
    });

    this.shadowRoot.querySelector('[data-action="remove-all-but-first"]').addEventListener('click', () => {
      this.removedPages = new Set(Array.from({ length: Math.max(this.pageCount - 1, 0) }, (_, i) => i + 1));
      this.syncCheckboxes();
      this.updateStatus();
    });

    this.elements.cancel.addEventListener('click', () => this.onCancel());
    this.elements.confirm.addEventListener('click', () => this.onConfirm([...this.removedPages]));
  }

  setPages(thumbnails) {
    if (!thumbnails.length) {
      this.elements.grid.innerHTML = '<div class="cgp-empty">No preview pages were available.</div>';
      return;
    }

    this.elements.grid.innerHTML = '';

    thumbnails.forEach((thumb) => {
      const card = document.createElement('label');
      card.className = 'cgp-card';
      card.innerHTML = `
        <img alt="Preview of page ${thumb.pageNumber}" src="${thumb.dataUrl}" />
        <div class="cgp-page-row">
          <span>Page ${thumb.pageNumber}</span>
          <span class="cgp-checkbox">
            <input type="checkbox" data-page-index="${thumb.pageNumber - 1}" />
            Delete
          </span>
        </div>
      `;

      const checkbox = card.querySelector('input');
      checkbox.addEventListener('change', () => {
        const index = Number(checkbox.dataset.pageIndex);
        if (checkbox.checked) {
          this.removedPages.add(index);
        } else {
          this.removedPages.delete(index);
        }
        this.updateStatus();
      });

      this.elements.grid.appendChild(card);
    });

    this.updateStatus();
  }

  setBusy(isBusy, message = 'Processing…') {
    this.elements.confirm.disabled = isBusy;
    this.elements.cancel.disabled = isBusy;
    if (isBusy) {
      this.elements.status.textContent = message;
    } else {
      this.updateStatus();
    }
  }

  updateStatus() {
    const count = this.removedPages.size;
    if (count === 0) {
      this.elements.status.textContent = 'No pages marked for removal.';
      return;
    }

    if (count >= this.pageCount) {
      this.elements.status.textContent = 'At least one page must remain in the PDF.';
      return;
    }

    this.elements.status.textContent = `${count} page${count === 1 ? '' : 's'} will be removed before upload.`;
  }

  syncCheckboxes() {
    this.shadowRoot.querySelectorAll('input[data-page-index]').forEach((checkbox) => {
      checkbox.checked = this.removedPages.has(Number(checkbox.dataset.pageIndex));
    });
  }

  destroy() {
    this.host?.remove();
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
