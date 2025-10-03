class CheatSheetGenerator {
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
    modal.id = 'cheatsheet-modal';
    modal.innerHTML = `
      <div class="flashcard-modal__backdrop" data-close></div>
      <div class="flashcard-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="cheatsheet-modal-title">
        <header class="flashcard-modal__header">
          <h2 id="cheatsheet-modal-title">Generate Cheat Sheet</h2>
          <button type="button" class="flashcard-modal__icon-btn" data-close aria-label="Close">
            ×
          </button>
        </header>
        <div class="flashcard-modal__body">
          <form id="cheatsheet-form" class="flashcard-form">
            <section class="flashcard-section">
              <label class="flashcard-label" for="cheatsheet-api-key">OpenAI API Key</label>
              <input id="cheatsheet-api-key" class="flashcard-input" type="password" placeholder="sk-..." autocomplete="off" />
              <label class="flashcard-remember">
                <input id="cheatsheet-remember" type="checkbox" />
                Remember key on this device (stored in Chrome storage)
              </label>
            </section>

            <section class="flashcard-section">
              <div class="flashcard-row">
                <div class="flashcard-field">
                  <label class="flashcard-label" for="cheatsheet-model">Model</label>
                  <input id="cheatsheet-model" class="flashcard-input" list="cheatsheet-models" placeholder="gpt-4o-mini" />
                  <datalist id="cheatsheet-models">
                    <option value="gpt-4o-mini"></option>
                    <option value="gpt-4o"></option>
                    <option value="o3-mini"></option>
                    <option value="gpt-4.1-mini"></option>
                    <option value="gpt-3.5-turbo"></option>
                  </datalist>
                </div>
                <div class="flashcard-field">
                  <label class="flashcard-label" for="cheatsheet-temperature">Creativity</label>
                  <input id="cheatsheet-temperature" class="flashcard-input" type="number" min="0" max="1" step="0.1" value="0.3" />
                </div>
              </div>
            </section>

            <section class="flashcard-section">
              <label class="flashcard-label" for="cheatsheet-topic">Topic/Subject (optional)</label>
              <input id="cheatsheet-topic" class="flashcard-input" type="text" placeholder="e.g., Machine Learning Midterm, Linear Algebra Chapter 3" />
            </section>

            <section class="flashcard-section">
              <label class="flashcard-label" for="cheatsheet-notes">Extra guidance (optional)</label>
              <textarea id="cheatsheet-notes" class="flashcard-textarea" rows="3" placeholder="e.g., Focus on key formulas and definitions"></textarea>
            </section>

            <section class="flashcard-section">
              <div class="flashcard-files-header">
                <div>Selected files</div>
                <button type="button" class="flashcard-refresh" id="cheatsheet-refresh-list">Refresh list</button>
              </div>
              <ul id="cheatsheet-selection" class="flashcard-selection"></ul>
            </section>

            <section class="flashcard-status" aria-live="polite" id="cheatsheet-status"></section>

            <footer class="flashcard-footer">
              <button type="button" class="flashcard-btn" data-cancel>Cancel</button>
              <button type="submit" class="flashcard-btn primary" data-generate>Generate Cheat Sheet</button>
            </footer>
          </form>

          <div id="cheatsheet-output" class="flashcard-output hidden">
            <h3>Your Cheat Sheet</h3>
            <div class="flashcard-output__actions" id="cheatsheet-output-actions"></div>
            <div class="cheatsheet-content" id="cheatsheet-content"></div>
            <div class="flashcard-output__warnings" id="cheatsheet-warnings"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    this.elements.modal = modal;
    this.elements.form = modal.querySelector('#cheatsheet-form');
    this.elements.apiKeyInput = modal.querySelector('#cheatsheet-api-key');
    this.elements.rememberCheckbox = modal.querySelector('#cheatsheet-remember');
    this.elements.modelInput = modal.querySelector('#cheatsheet-model');
    this.elements.temperatureInput = modal.querySelector('#cheatsheet-temperature');
    this.elements.topicInput = modal.querySelector('#cheatsheet-topic');
    this.elements.notesInput = modal.querySelector('#cheatsheet-notes');
    this.elements.selectionList = modal.querySelector('#cheatsheet-selection');
    this.elements.status = modal.querySelector('#cheatsheet-status');
    this.elements.generateBtn = modal.querySelector('[data-generate]');
    this.elements.cancelBtn = modal.querySelector('[data-cancel]');
    this.elements.output = modal.querySelector('#cheatsheet-output');
    this.elements.outputActions = modal.querySelector('#cheatsheet-output-actions');
    this.elements.contentContainer = modal.querySelector('#cheatsheet-content');
    this.elements.warnings = modal.querySelector('#cheatsheet-warnings');
    this.elements.refreshSelection = modal.querySelector('#cheatsheet-refresh-list');

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
    this.elements.contentContainer.innerHTML = '';
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
    const temperature = Number(this.elements.temperatureInput?.value || 0.3);
    const topic = (this.elements.topicInput?.value || '').trim();
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

    if (temperature < 0 || temperature > 1) {
      this.updateStatus('Creativity must be between 0 and 1.', 'error');
      this.elements.temperatureInput?.focus({ preventScroll: true });
      return;
    }

    this.settings.model = model;
    this.settings.rememberKey = rememberKey;
    this.settings.apiKey = rememberKey ? apiKey : '';

    this.saveSettings();

    this.generateCheatSheet({ apiKey, model, temperature, topic, notes });
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

  async generateCheatSheet({ apiKey, model, temperature, topic, notes }) {
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
        this.updateStatus('None of the selected files could be processed for cheat sheet.', 'error');
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
        topic,
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

      this.updateStatus(`Cheat sheet generated successfully with ${model}.`, 'success');
      this.renderOutput({ content: response.rawContent, warnings });
    } catch (error) {
      console.error('Cheat sheet generation failed:', error);
      const message = error?.message || 'Unexpected error while generating cheat sheet.';
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
      this.elements.temperatureInput,
      this.elements.topicInput,
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
      this.elements.generateBtn.textContent = isDisabled ? 'Generating...' : 'Generate Cheat Sheet';
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
      const maxLength = 30000;
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

    const maxBinaryBytes = 15 * 1024 * 1024;
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

  buildPrompts({ textContexts, fileContexts, topic, notes }) {
    const textBlocks = textContexts.map((entry, index) => {
      return `### Source ${index + 1}: ${entry.name}\n${entry.text}`;
    }).join('\n\n');

    const attachmentsList = fileContexts.length
      ? fileContexts.map((entry, index) => `${index + 1}. ${entry.name} (${this.formatSize(entry.size) || 'attachment'})`).join('\n')
      : '';

    const topicContext = topic ? `\n\nTopic/Subject: ${topic}` : '';
    const noteInstruction = notes ? `\n\nAdditional guidance: ${notes}` : '';

    const systemPrompt = `You are an expert educator who creates comprehensive study materials. Your explanations are clear, structured, and pedagogically sound. You excel at breaking down complex concepts into understandable pieces.`;

    let userPrompt = `Please create a comprehensive cheat sheet from the provided course materials${topicContext ? ' for ' + topic : ''}.

Follow these guidelines for creating the cheat sheet:

1. **Use concrete examples and analogies** - relate abstract concepts to tangible things
2. **Show, don't just tell** - use simple code blocks, diagrams (in text form), or mathematical notation where helpful
3. **Build up complexity gradually** - start with the simplest version, then add nuance
4. **Use formatting for clarity**:
   - Headers to organize sections
   - **Bold** for key terms and emphasis
   - Code blocks for examples/math
   - Bullet points for lists (but prose for longer explanations)
5. **Explain the "why" not just the "what"** - include motivation and intuition
6. **Connect concepts** - show how ideas relate to each other
7. **Be precise but accessible** - accurate without being overly academic

Structure the cheat sheet like:
- Start with a one-line summary of the main topic
- Break down into logical sections
- Use examples throughout
- End with key insights or practical implications

Keep a conversational but informative tone - like explaining to a smart friend who's genuinely curious.

Use LaTeX notation (wrapped in $ for inline or $$ for display) when demonstrating equations.${noteInstruction}`;

    if (textBlocks) {
      userPrompt += `\n\n## Source Materials\n\n${textBlocks}`;
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
      max_tokens: 4096,
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
      max_output_tokens: 4096,
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

  renderOutput({ content, warnings }) {
    this.lastOutput = { content };

    this.elements.output.classList.remove('hidden');
    this.renderActions();
    this.renderContent(content);
    this.renderWarnings(warnings);
  }

  renderActions() {
    if (!this.elements.outputActions) return;
    this.elements.outputActions.innerHTML = `
      <button type="button" class="flashcard-btn primary" id="cheatsheet-copy-btn">📋 Copy to Clipboard</button>
      <button type="button" class="flashcard-btn" id="cheatsheet-download-btn">💾 Download as Markdown</button>
      <button type="button" class="flashcard-btn" id="cheatsheet-retry-btn">🔄 Retry Generation</button>
    `;

    const copyBtn = this.elements.modal.querySelector('#cheatsheet-copy-btn');
    const downloadBtn = this.elements.modal.querySelector('#cheatsheet-download-btn');
    const retryBtn = this.elements.modal.querySelector('#cheatsheet-retry-btn');

    copyBtn?.addEventListener('click', () => this.copyToClipboard());
    downloadBtn?.addEventListener('click', () => this.downloadAsMarkdown());
    retryBtn?.addEventListener('click', () => this.retryGeneration());
  }

  renderContent(content) {
    if (!this.elements.contentContainer) return;

    // Render markdown content with proper styling
    const formattedContent = this.formatMarkdown(content);
    this.elements.contentContainer.innerHTML = `
      <div class="cheatsheet-content__inner">
        ${formattedContent}
      </div>
    `;
  }

  formatMarkdown(text) {
    // Basic markdown to HTML conversion
    let html = this.escapeHtml(text);

    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // LaTeX (display)
    html = html.replace(/\$\$(.*?)\$\$/g, '<div class="latex-display">$1</div>');

    // LaTeX (inline)
    html = html.replace(/\$([^\$]+)\$/g, '<span class="latex-inline">$1</span>');

    // Bullet points
    html = html.replace(/^\- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    return html;
  }

  async copyToClipboard() {
    if (!this.lastOutput?.content) {
      this.updateStatus('No content to copy.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.lastOutput.content);
      this.updateStatus('Cheat sheet copied to clipboard!', 'success');
    } catch (error) {
      console.error('Clipboard write failed:', error);
      this.updateStatus('Unable to copy to clipboard.', 'error');
    }
  }

  downloadAsMarkdown() {
    if (!this.lastOutput?.content) {
      this.updateStatus('No content to download.', 'error');
      return;
    }

    const topic = (this.elements.topicInput?.value || '').trim() || 'Cheat Sheet';
    const filename = `${this.sanitizeFileName(topic)}.md`;
    const blob = new Blob([this.lastOutput.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.updateStatus('Cheat sheet downloaded!', 'success');
  }

  retryGeneration() {
    this.clearOutput();
    this.updateStatus('Ready to generate new cheat sheet. Click Generate when ready.', 'info');
    this.elements.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

window.CheatSheetGenerator = CheatSheetGenerator;
