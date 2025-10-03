class FlashcardGenerator {
  constructor({ getSelection } = {}) {
    this.getSelection = typeof getSelection === 'function' ? getSelection : () => [];
    this.isGenerating = false;
    this.lastOutput = null;
    this.elements = {};
    this.settings = {
      model: 'gpt-4o-mini',
      rememberKey: false,
      apiKey: ''
    };

    this.init();
  }

  async init() {
    this.buildModal();
    await this.loadSettings();
    this.applySettingsToForm();
  }

  buildModal() {
    const modal = document.createElement('div');
    modal.className = 'flashcard-modal hidden';
    modal.id = 'flashcard-modal';
    modal.innerHTML = `
      <div class="flashcard-modal__backdrop" data-close></div>
      <div class="flashcard-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="flashcard-modal-title">
        <header class="flashcard-modal__header">
          <h2 id="flashcard-modal-title">Generate Flash Cards</h2>
          <button type="button" class="flashcard-modal__icon-btn" data-close aria-label="Close">
            ×
          </button>
        </header>
        <div class="flashcard-modal__body">
          <form id="flashcard-form" class="flashcard-form">
            <section class="flashcard-section">
              <label class="flashcard-label" for="flashcards-api-key">OpenAI API Key</label>
              <input id="flashcards-api-key" class="flashcard-input" type="password" placeholder="sk-..." autocomplete="off" />
              <label class="flashcard-remember">
                <input id="flashcards-remember" type="checkbox" />
                Remember key on this device (stored in Chrome storage)
              </label>
            </section>

            <section class="flashcard-section">
              <div class="flashcard-row">
                <div class="flashcard-field">
                  <label class="flashcard-label" for="flashcards-model">Model</label>
                  <input id="flashcards-model" class="flashcard-input" list="flashcards-models" placeholder="gpt-4o-mini" />
                  <datalist id="flashcards-models">
                    <option value="gpt-4o-mini"></option>
                    <option value="gpt-4o"></option>
                    <option value="o3-mini"></option>
                    <option value="gpt-4.1-mini"></option>
                    <option value="gpt-3.5-turbo"></option>
                  </datalist>
                </div>
                <div class="flashcard-field">
                  <label class="flashcard-label" for="flashcards-count">Flashcards</label>
                  <input id="flashcards-count" class="flashcard-input" type="number" min="1" max="50" value="10" />
                </div>
                <div class="flashcard-field">
                  <label class="flashcard-label" for="flashcards-temperature">Creativity</label>
                  <input id="flashcards-temperature" class="flashcard-input" type="number" min="0" max="1" step="0.1" value="0.3" />
                </div>
              </div>
            </section>

            <section class="flashcard-section">
              <label class="flashcard-label" for="flashcards-notes">Extra guidance (optional)</label>
              <textarea id="flashcards-notes" class="flashcard-textarea" rows="3" placeholder="e.g. Focus on definitions from lecture 3"></textarea>
            </section>

            <section class="flashcard-section">
              <div class="flashcard-files-header">
                <div>Selected files</div>
                <button type="button" class="flashcard-refresh" id="flashcards-refresh-list">Refresh list</button>
              </div>
              <ul id="flashcards-selection" class="flashcard-selection"></ul>
            </section>

            <section class="flashcard-status" aria-live="polite" id="flashcards-status"></section>

            <footer class="flashcard-footer">
              <button type="button" class="flashcard-btn" data-cancel>Cancel</button>
              <button type="submit" class="flashcard-btn primary" data-generate>Generate Flash Cards</button>
            </footer>
          </form>

          <div id="flashcards-output" class="flashcard-output hidden">
            <h3>Flashcard set ready</h3>
            <div class="flashcard-output__actions" id="flashcards-output-actions"></div>
            <div class="flashcard-output__code" id="flashcards-json-block"></div>
            <div class="flashcard-output__code" id="flashcards-component-block"></div>
            <div class="flashcard-output__warnings" id="flashcards-warnings"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    this.elements.modal = modal;
    this.elements.form = modal.querySelector('#flashcard-form');
    this.elements.apiKeyInput = modal.querySelector('#flashcards-api-key');
    this.elements.rememberCheckbox = modal.querySelector('#flashcards-remember');
    this.elements.modelInput = modal.querySelector('#flashcards-model');
    this.elements.countInput = modal.querySelector('#flashcards-count');
    this.elements.temperatureInput = modal.querySelector('#flashcards-temperature');
    this.elements.notesInput = modal.querySelector('#flashcards-notes');
    this.elements.selectionList = modal.querySelector('#flashcards-selection');
    this.elements.status = modal.querySelector('#flashcards-status');
    this.elements.generateBtn = modal.querySelector('[data-generate]');
    this.elements.cancelBtn = modal.querySelector('[data-cancel]');
    this.elements.output = modal.querySelector('#flashcards-output');
    this.elements.outputActions = modal.querySelector('#flashcards-output-actions');
    this.elements.jsonBlock = modal.querySelector('#flashcards-json-block');
    this.elements.componentBlock = modal.querySelector('#flashcards-component-block');
    this.elements.warnings = modal.querySelector('#flashcards-warnings');
    this.elements.refreshSelection = modal.querySelector('#flashcards-refresh-list');

    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => this.close());
    });

    this.elements.cancelBtn.addEventListener('click', () => this.close());
    this.elements.refreshSelection.addEventListener('click', () => this.renderSelectionList());

    this.elements.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleGenerate();
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.close();
      }
    });
  }

  async loadSettings() {
    if (!chrome?.storage?.local) {
      return;
    }

    return new Promise((resolve) => {
      chrome.storage.local.get(['openaiModel', 'openaiRememberKey', 'openaiApiKey'], (items) => {
        const model = typeof items.openaiModel === 'string' && items.openaiModel.trim()
          ? items.openaiModel.trim()
          : this.settings.model;
        const rememberKey = Boolean(items.openaiRememberKey);
        const apiKey = rememberKey && typeof items.openaiApiKey === 'string'
          ? items.openaiApiKey
          : '';

        this.settings = {
          model,
          rememberKey,
          apiKey
        };
        resolve();
      });
    });
  }

  applySettingsToForm() {
    if (this.elements.modelInput) {
      this.elements.modelInput.value = this.settings.model;
    }
    if (this.elements.rememberCheckbox) {
      this.elements.rememberCheckbox.checked = this.settings.rememberKey;
    }
    if (this.elements.apiKeyInput && this.settings.rememberKey) {
      this.elements.apiKeyInput.value = this.settings.apiKey;
    }
  }

  open() {
    this.renderSelectionList();
    this.clearOutput();
    this.updateStatus('Fill in your OpenAI details then generate.', 'info');
    this.elements.modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.elements.modal.classList.add('flashcard-modal--visible');
      const focusTarget = this.elements.apiKeyInput?.value
        ? this.elements.modelInput
        : this.elements.apiKeyInput;
      focusTarget?.focus({ preventScroll: true });
    });
  }

  isOpen() {
    return Boolean(this.elements.modal && !this.elements.modal.classList.contains('hidden'));
  }

  close() {
    this.elements.modal.classList.remove('flashcard-modal--visible');
    setTimeout(() => {
      this.elements.modal.classList.add('hidden');
    }, 150);
  }

  renderSelectionList() {
    const list = this.elements.selectionList;
    if (!list) return;

    const selection = this.getSelection();
    if (!selection.length) {
      list.innerHTML = '<li class="flashcard-selection__empty">Select files in the dashboard to enable generation.</li>';
      return;
    }

    const items = selection.map((payload) => {
      const file = payload?.file || {};
      const title = this.getFileTitle(payload);
      const size = this.formatSize(file.size);
      return `<li>${this.escapeHtml(title)}${size ? ` <span>${this.escapeHtml(size)}</span>` : ''}</li>`;
    });

    list.innerHTML = items.join('');
  }

  clearOutput() {
    this.lastOutput = null;
    this.elements.output.classList.add('hidden');
    this.elements.outputActions.innerHTML = '';
    this.elements.jsonBlock.innerHTML = '';
    this.elements.componentBlock.innerHTML = '';
    this.elements.warnings.innerHTML = '';
  }

  async handleGenerate() {
    if (this.isGenerating) {
      return;
    }

    const selection = this.getSelection();
    if (!selection.length) {
      this.updateStatus('Select at least one file to continue.', 'error');
      return;
    }

    const apiKey = (this.elements.apiKeyInput?.value || '').trim();
    const model = (this.elements.modelInput?.value || '').trim() || 'gpt-4o-mini';
    const count = Number(this.elements.countInput?.value || 0);
    const temperature = Number(this.elements.temperatureInput?.value || 0.3);
    const notes = (this.elements.notesInput?.value || '').trim();
    const rememberKey = Boolean(this.elements.rememberCheckbox?.checked);

    if (!apiKey) {
      this.updateStatus('Enter your OpenAI API key.', 'error');
      this.elements.apiKeyInput?.focus({ preventScroll: true });
      return;
    }

    if (!model) {
      this.updateStatus('Enter a model name.', 'error');
      this.elements.modelInput?.focus({ preventScroll: true });
      return;
    }

    if (!Number.isFinite(count) || count < 1) {
      this.updateStatus('Flashcard count must be at least 1.', 'error');
      this.elements.countInput?.focus({ preventScroll: true });
      return;
    }

    if (temperature < 0 || temperature > 1) {
      this.updateStatus('Creativity must be between 0 and 1.', 'error');
      this.elements.temperatureInput?.focus({ preventScroll: true });
      return;
    }

    this.settings.model = model;
    this.settings.rememberKey = rememberKey;
    this.settings.apiKey = rememberKey ? apiKey : '';

    this.saveSettings();

    this.generateFlashcards({ apiKey, model, count, temperature, notes });
  }

  saveSettings() {
    if (!chrome?.storage?.local) {
      return;
    }

    const payload = {
      openaiModel: this.settings.model,
      openaiRememberKey: this.settings.rememberKey
    };

    if (this.settings.rememberKey) {
      payload.openaiApiKey = this.settings.apiKey;
    } else {
      payload.openaiApiKey = '';
    }

    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        console.warn('Unable to persist OpenAI settings:', chrome.runtime.lastError);
      }
    });
  }

  async generateFlashcards({ apiKey, model, count, temperature, notes }) {
    this.isGenerating = true;
    this.setFormDisabled(true);
    this.clearOutput();
    this.updateStatus('Fetching file content...', 'info');

    try {
      const selection = this.getSelection();
      const textContexts = [];
      const fileAttachments = [];
      const warnings = [];

      for (const payload of selection) {
        const result = await this.fetchFileContent(payload);
        if (!result || result.skipped) {
          if (result?.message) {
            warnings.push(result.message);
          }
          continue;
        }
        if (result.type === 'text') {
          textContexts.push(result);
          if (result.truncated) {
            warnings.push(`${result.name}: trimmed to ${result.text.length.toLocaleString()} characters to stay within the limit.`);
          }
        } else if (result.type === 'file') {
          fileAttachments.push(result);
        }
      }

      if (!textContexts.length && !fileAttachments.length) {
        this.updateStatus('None of the selected files could be processed for flashcards.', 'error');
        return;
      }

      if (fileAttachments.length) {
        this.updateStatus('Uploading attachments to OpenAI...', 'info');
      } else {
        this.updateStatus('Contacting OpenAI...', 'info');
      }

      const { systemPrompt, userPrompt } = this.buildPrompts({
        textContexts,
        fileContexts: fileAttachments,
        count,
        notes
      });
      const response = await this.callOpenAI({
        apiKey,
        model,
        temperature,
        systemPrompt,
        userPrompt,
        fileAttachments
      });
      const cards = this.parseFlashcards(response.rawContent);

      if (!Array.isArray(cards) || !cards.length) {
        this.updateStatus('OpenAI response was empty.', 'error');
        return;
      }

      this.updateStatus(`Created ${cards.length} flashcards with ${model}.`, 'success');
      this.renderOutput({ cards, warnings });
    } catch (error) {
      console.error('Flashcard generation failed:', error);
      const message = error?.message || 'Unexpected error while generating flashcards.';
      this.updateStatus(message, 'error');
    } finally {
      this.isGenerating = false;
      this.setFormDisabled(false);
    }
  }

  setFormDisabled(isDisabled) {
    const elements = [
      this.elements.apiKeyInput,
      this.elements.rememberCheckbox,
      this.elements.modelInput,
      this.elements.countInput,
      this.elements.temperatureInput,
      this.elements.notesInput,
      this.elements.generateBtn,
      this.elements.refreshSelection
    ];

    elements.forEach((el) => {
      if (el) {
        el.disabled = isDisabled;
      }
    });

    if (this.elements.generateBtn) {
      this.elements.generateBtn.textContent = isDisabled ? 'Generating...' : 'Generate Flash Cards';
    }
  }

  updateStatus(message, type = 'info') {
    const el = this.elements.status;
    if (!el) return;
    el.textContent = message;
    el.dataset.status = type;
  }

  async fetchFileContent(payload) {
    const file = payload?.file;
    if (!file || !file.url) {
      return { skipped: true, message: 'A selected file is missing its download URL.' };
    }

    const url = file.url;
    let response;
    try {
      response = await fetch(url, { credentials: 'include' });
    } catch (error) {
      return {
        skipped: true,
        message: `Unable to fetch ${this.getFileTitle(payload)} (${error.message}).`
      };
    }

    if (!response?.ok) {
      return {
        skipped: true,
        message: `Request for ${this.getFileTitle(payload)} failed with status ${response?.status}.`
      };
    }

    const headerType = response.headers.get('content-type');
    const contentType = headerType || file.content_type || '';
    const extension = this.getFileExtension(file);

    if (this.isSupportedTextType({ contentType, extension })) {
      let text;
      try {
        text = await response.text();
      } catch (error) {
        return {
          skipped: true,
          message: `Unable to read ${this.getFileTitle(payload)} as text (${error.message}).`
        };
      }

      if (!text || !text.trim()) {
        return {
          skipped: true,
          message: `${this.getFileTitle(payload)} did not contain readable text.`
        };
      }

      const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
      const maxLength = 15000;
      const truncated = cleaned.length > maxLength;
      const snippet = truncated ? cleaned.slice(0, maxLength) : cleaned;

      return {
        skipped: false,
        type: 'text',
        name: this.getFileTitle(payload),
        text: snippet,
        truncated
      };
    }

    if (!this.isSupportedBinaryType({ contentType, extension })) {
      return {
        skipped: true,
        message: `${this.getFileTitle(payload)} is ${extension || 'binary'} and is not yet supported.`
      };
    }

    const maxBinaryBytes = 15 * 1024 * 1024; // 15 MB
    let buffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (error) {
      return {
        skipped: true,
        message: `Unable to read ${this.getFileTitle(payload)} as binary (${error.message}).`
      };
    }
    if (buffer.byteLength === 0) {
      return {
        skipped: true,
        message: `${this.getFileTitle(payload)} appears to be empty.`
      };
    }

    if (buffer.byteLength > maxBinaryBytes) {
      return {
        skipped: true,
        message: `${this.getFileTitle(payload)} exceeds the 15 MB attachment limit.`
      };
    }

    const blob = new Blob([buffer], { type: headerType || 'application/octet-stream' });

    return {
      skipped: false,
      type: 'file',
      name: this.getFileTitle(payload),
      blob,
      size: buffer.byteLength,
      filename: file.display_name || file.filename || this.sanitizeFileName(this.getFileTitle(payload)) || 'attachment'
    };
  }

  isSupportedTextType({ contentType, extension }) {
    const normalizedType = (contentType || '').toLowerCase();
    const normalizedExt = (extension || '').toLowerCase();

    if (normalizedType.includes('text/')) return true;
    if (normalizedType.includes('json')) return true;
    if (normalizedType.includes('xml')) return true;
    if (normalizedType.includes('csv')) return true;
    if (normalizedType.includes('yaml') || normalizedType.includes('yml')) return true;
    if (normalizedType.includes('html')) return true;
    if (normalizedType.includes('javascript') || normalizedType.includes('typescript')) return true;
    if (normalizedType.includes('markdown')) return true;

    const textExtensions = new Set([
      'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'xml', 'html', 'htm',
      'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'rb', 'cs', 'c', 'cpp', 'h', 'hpp',
      'sql', 'yml', 'yaml', 'rst'
    ]);

    if (textExtensions.has(normalizedExt)) {
      return true;
    }

    const binaryExtensions = new Set([
      'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', '7z', 'tar', 'gz',
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'mp4', 'mov', 'avi', 'mp3', 'wav'
    ]);

    if (binaryExtensions.has(normalizedExt)) {
      return false;
    }

    if (!normalizedType && !normalizedExt) {
      return false;
    }

    return false;
  }

  isSupportedBinaryType({ contentType, extension }) {
    const normalizedType = (contentType || '').toLowerCase();
    const normalizedExt = (extension || '').toLowerCase();

    const supportedExt = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'odp', 'odt', 'rtf']);

    if (supportedExt.has(normalizedExt)) {
      return true;
    }

    if (normalizedType.includes('pdf')) return true;
    if (normalizedType.includes('powerpoint')) return true;
    if (normalizedType.includes('presentation')) return true;
    if (normalizedType.includes('msword')) return true;
    if (normalizedType.includes('wordprocessing')) return true;

    return false;
  }

  getFileExtension(file) {
    const name = file?.display_name || file?.filename || '';
    const idx = name.lastIndexOf('.');
    if (idx === -1 || idx === name.length - 1) {
      return '';
    }
    return name.slice(idx + 1);
  }

  getFileTitle(payload) {
    const file = payload?.file;
    if (!file) return 'Unnamed file';
    return file.display_name || file.filename || 'Unnamed file';
  }

  formatSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB'];
    let size = bytes / 1024;
    for (const unit of units) {
      if (size < 1024) {
        return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
      }
      size /= 1024;
    }
    return `${size.toFixed(1)} GB`;
  }

  buildPrompts({ textContexts, fileContexts, count, notes }) {
    const textBlocks = textContexts.map((entry, index) => {
      return `### Text Snippet ${index + 1}: ${entry.name}\n${entry.text}`;
    }).join('\n\n');

    const attachmentsList = fileContexts.length
      ? fileContexts.map((entry, index) => `${index + 1}. ${entry.name} (${this.formatSize(entry.size) || 'attachment'})`).join('\n')
      : '';

    const noteInstruction = notes ? `\n\nAdditional guidance: ${notes}` : '';

    const systemPrompt = 'You are an expert machine learning tutor that crafts flashcards. Always respond with valid JSON arrays only.';

    let userPrompt = `You are given course materials from Canvas. Using the provided text excerpts${fileContexts.length ? ' and attached documents' : ''}, write ${count} high-quality study flashcards for a machine learning midterm. Follow the structure strictly:\n\n- Return a JSON array only.\n- Each flashcard must have the fields: "category" (string), "q" (string question), "a" (array of exactly three answers).\n- The answers array should progress from concise to increasingly detailed explanations.\n- Keep each answer under 120 words.\n- Prefer categories sourced from the material. If unsure, choose a short descriptive category.\n- Cover different concepts, avoid duplicates.\n${noteInstruction}`;

    if (textBlocks) {
      userPrompt += `\n\n${textBlocks}`;
    }

    if (attachmentsList) {
      userPrompt += `\n\nAttached documents:\n${attachmentsList}\nUse these attachments as source material along with the text snippets.`;
    }

    return { systemPrompt, userPrompt };
  }

  async callOpenAI({ apiKey, model, temperature, systemPrompt, userPrompt, fileAttachments = [] }) {
    if (fileAttachments.length) {
      return this.callOpenAIWithFiles({ apiKey, model, temperature, systemPrompt, userPrompt, fileAttachments });
    }

    const payload = {
      model,
      temperature,
      max_tokens: 1600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let detail = `status ${response.status}`;
      try {
        const error = await response.json();
        if (error?.error?.message) {
          detail = error.error.message;
        }
      } catch (_) {
        // ignore
      }
      throw new Error(`OpenAI request failed: ${detail}`);
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI did not return any content.');
    }

    return { rawContent, usage: data?.usage };
  }

  async callOpenAIWithFiles({ apiKey, model, temperature, systemPrompt, userPrompt, fileAttachments = [] }) {
    if (!this.supportsFileAttachments(model)) {
      throw new Error(`${model} does not support file attachments. Choose gpt-4o, gpt-4o-mini, gpt-4.1, or o3-mini.`);
    }

    const uploads = [];
    for (const attachment of fileAttachments) {
      const fileId = await this.uploadFileToOpenAI({ apiKey, attachment });
      if (fileId) {
        uploads.push({ ...attachment, fileId });
      }
    }

    if (!uploads.length) {
      throw new Error('Failed to upload attachments to OpenAI.');
    }

    if (uploads.length !== fileAttachments.length) {
      throw new Error('Some attachments failed to upload to OpenAI. Remove unsupported files and try again.');
    }

    this.updateStatus('Contacting OpenAI...', 'info');

    const inputMessages = [];

    if (systemPrompt) {
      inputMessages.push({
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }]
      });
    }

    const userContent = [{ type: 'input_text', text: userPrompt }];
    uploads.forEach((item) => {
      userContent.push({ type: 'input_file', file_id: item.fileId });
    });

    inputMessages.push({
      role: 'user',
      content: userContent
    });

    const payload = {
      model,
      temperature,
      max_output_tokens: 1600,
      input: inputMessages
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let detail = `status ${response.status}`;
      try {
        const error = await response.json();
        if (error?.error?.message) {
          detail = error.error.message;
        }
      } catch (_) {
        // ignore
      }
      throw new Error(`OpenAI request failed: ${detail}`);
    }

    const data = await response.json();
    const rawContent = this.extractTextFromResponses(data);
    if (!rawContent) {
      throw new Error('OpenAI did not return any content.');
    }

    return { rawContent, usage: data?.usage };
  }

  supportsFileAttachments(model) {
    const normalized = (model || '').trim().toLowerCase();
    const supported = new Set([
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'o3-mini'
    ]);
    return supported.has(normalized);
  }

  async uploadFileToOpenAI({ apiKey, attachment }) {
    const form = new FormData();
    form.append('purpose', 'assistants');
    form.append('file', attachment.blob, attachment.filename || attachment.name || 'attachment');

    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      console.error('OpenAI file upload failed', response.status);
      return null;
    }

    const data = await response.json();
    return data?.id || null;
  }

  extractTextFromResponses(data) {
    if (!data) {
      return '';
    }

    const collectText = (node) => {
      if (!node) return [];
      if (Array.isArray(node)) {
        return node.flatMap(collectText);
      }
      if (typeof node === 'string') {
        return [node];
      }
      if (typeof node === 'object') {
        if (typeof node.text === 'string') {
          return [node.text];
        }
        if (Array.isArray(node.content)) {
          return node.content.flatMap(collectText);
        }
        if (typeof node.output_text === 'string') {
          return [node.output_text];
        }
      }
      return [];
    };

    const textPieces = collectText(data.output || data.responses || data);
    return textPieces.join('\n').trim();
  }

  sanitizeFileName(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/[\\/:*?"<>|]+/g, '_').replace(/[\u0000-\u001F]+/g, '');
  }

  parseFlashcards(rawContent) {
    const trimmed = (rawContent || '').trim();
    if (!trimmed) {
      throw new Error('OpenAI returned an empty response.');
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      const match = trimmed.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Unable to parse JSON from OpenAI response.');
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array from OpenAI.');
    }

    return parsed;
  }

  renderOutput({ cards, warnings }) {
    const json = JSON.stringify(cards, null, 2);
    const component = FlashcardGenerator.buildComponentSource(cards);

    this.lastOutput = {
      cards,
      json,
      component
    };

    this.elements.output.classList.remove('hidden');
    this.renderCopyActions();
    this.renderCodeBlock({ target: this.elements.jsonBlock, title: 'Cards JSON', code: json });
    this.renderCodeBlock({ target: this.elements.componentBlock, title: 'React component', code: component, language: 'tsx' });
    this.renderWarnings(warnings);
  }

  renderCopyActions() {
    if (!this.elements.outputActions) return;
    this.elements.outputActions.innerHTML = `
      <button type="button" class="flashcard-btn" id="flashcards-copy-json">Copy JSON</button>
      <button type="button" class="flashcard-btn" id="flashcards-copy-component">Copy React Component</button>
    `;

    const copyJsonBtn = this.elements.modal.querySelector('#flashcards-copy-json');
    const copyComponentBtn = this.elements.modal.querySelector('#flashcards-copy-component');

    copyJsonBtn?.addEventListener('click', () => {
      if (this.lastOutput?.json) {
        this.copyToClipboard(this.lastOutput.json, 'Flashcard JSON copied to clipboard.');
      }
    });

    copyComponentBtn?.addEventListener('click', () => {
      if (this.lastOutput?.component) {
        this.copyToClipboard(this.lastOutput.component, 'React component copied to clipboard.');
      }
    });
  }

  renderCodeBlock({ target, title, code, language }) {
    if (!target) return;
    const escaped = this.escapeHtml(code);
    const lang = language ? ` data-lang="${language}"` : '';
    target.innerHTML = `
      <div class="flashcard-code__title">${this.escapeHtml(title)}</div>
      <pre class="flashcard-code"${lang}><code>${escaped}</code></pre>
    `;
  }

  renderWarnings(warnings = []) {
    if (!this.elements.warnings) return;
    if (!warnings.length) {
      this.elements.warnings.innerHTML = '';
      return;
    }

    const items = warnings.map((text) => `<li>${this.escapeHtml(text)}</li>`).join('');
    this.elements.warnings.innerHTML = `
      <div class="flashcard-warnings__title">Notes</div>
      <ul>${items}</ul>
    `;
  }

  async copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      if (successMessage) {
        this.updateStatus(successMessage, 'success');
      }
    } catch (error) {
      console.error('Clipboard write failed:', error);
      this.updateStatus('Unable to copy to clipboard. Copy manually from the code block.', 'error');
    }
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static buildComponentSource(cards) {
    const cardsJson = JSON.stringify(cards, null, 2);
    return FlashcardGenerator.COMPONENT_TEMPLATE
      .replace('__CARDS_PLACEHOLDER__', cardsJson)
      .replace(/__CARD_COUNT__/g, '${cards.length}');
  }
}

FlashcardGenerator.COMPONENT_TEMPLATE = `import React, { useState, useEffect } from 'react';

const cards = __CARDS_PLACEHOLDER__;

const FlashCards = () => {
  const [currentCard, setCurrentCard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerLevel, setAnswerLevel] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = ['all', ...new Set(cards.map(c => c.category))];
  const filteredCards = selectedCategory === 'all'
    ? cards
    : cards.filter(c => c.category === selectedCategory);

  const nextCard = () => {
    setShowAnswer(false);
    setAnswerLevel(0);
    setCurrentCard((currentCard + 1) % filteredCards.length);
  };

  const prevCard = () => {
    setShowAnswer(false);
    setAnswerLevel(0);
    setCurrentCard((currentCard - 1 + filteredCards.length) % filteredCards.length);
  };

  const toggleAnswer = () => {
    if (!showAnswer) {
      setShowAnswer(true);
      setAnswerLevel(0);
    } else if (answerLevel < 2) {
      setAnswerLevel(answerLevel + 1);
    } else {
      setShowAnswer(false);
      setAnswerLevel(0);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') prevCard();
      else if (e.key === ' ') {
        e.preventDefault();
        toggleAnswer();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentCard, showAnswer, answerLevel, filteredCards.length]);

  return (
    <div style={{
      maxWidth: '800px',
      margin: '40px auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '10px', color: '#2c3e50' }}>
        ML Midterm Study Guide
      </h1>
      <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: '30px' }}>
        Comprehensive flashcards generated from Canvas content
      </p>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        justifyContent: 'center',
        marginBottom: '30px'
      }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setCurrentCard(0);
              setShowAnswer(false);
              setAnswerLevel(0);
            }}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: selectedCategory === cat ? '2px solid #3498db' : '2px solid #e0e0e0',
              borderRadius: '20px',
              backgroundColor: selectedCategory === cat ? '#3498db' : '#fff',
              color: selectedCategory === cat ? '#fff' : '#2c3e50',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.3s'
            }}
          >
            {cat === 'all' ? \`All (__CARD_COUNT__)\` : cat}
          </button>
        ))}
      </div>

      <div style={{
        border: '2px solid #e0e0e0',
        borderRadius: '12px',
        padding: '40px',
        minHeight: '350px',
        cursor: 'pointer',
        backgroundColor: showAnswer ? '#f8f9fa' : '#fff',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        transition: 'background-color 0.3s'
      }}
      onClick={toggleAnswer}>
        <div style={{
          fontSize: '12px',
          color: '#95a5a6',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '15px'
        }}>
          {filteredCards[currentCard].category}
        </div>

        <div style={{
          fontSize: '20px',
          fontWeight: '600',
          marginBottom: '30px',
          color: '#2c3e50'
        }}>
          {filteredCards[currentCard].q}
        </div>

        {showAnswer && (
          <>
            <div style={{
              fontSize: '12px',
              color: '#95a5a6',
              marginBottom: '15px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Detail Level {answerLevel + 1} / 3
            </div>
            <div style={{
              fontSize: '16px',
              color: '#34495e',
              whiteSpace: 'pre-line',
              borderTop: '2px solid #e0e0e0',
              paddingTop: '20px',
              lineHeight: '1.6'
            }}>
              {filteredCards[currentCard].a[answerLevel]}
            </div>
          </>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '30px'
      }}>
        <button
          onClick={prevCard}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            border: '2px solid #3498db',
            borderRadius: '6px',
            backgroundColor: '#fff',
            color: '#3498db',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          ← Previous
        </button>

        <span style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#7f8c8d'
        }}>
          {currentCard + 1} / {filteredCards.length}
        </span>

        <button
          onClick={nextCard}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            border: '2px solid #3498db',
            borderRadius: '6px',
            backgroundColor: '#3498db',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Next →
        </button>
      </div>

      <div style={{
        textAlign: 'center',
        marginTop: '20px',
        fontSize: '14px',
        color: '#95a5a6'
      }}>
        Click card or press Space for more detail • Use ← → to navigate
        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          Starts concise → builds to comprehensive explanations
        </div>
      </div>
    </div>
  );
};

export default FlashCards;
`;

window.FlashcardGenerator = FlashcardGenerator;
