/**
 * UI Renderer for Studyboard
 * Handles DOM updates and small formatting helpers
 */

class UIRenderer {
  static renderHeader({ title = 'Studyboard', subtitle = '', searchQuery = '' } = {}) {
    const header = document.getElementById('header');
    if (!header) return;

    header.innerHTML = `
      <div class="header-top">
        <div class="header-content">
          <div class="header-title">${this.escapeHtml(title)}</div>
          ${subtitle ? `<div class="header-subtitle">${this.escapeHtml(subtitle)}</div>` : ''}
        </div>
        <button id="refresh-btn" class="refresh-btn" title="Refresh file list" aria-label="Refresh file list">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
          </svg>
        </button>
      </div>
      <div class="search-row">
        <input
          id="file-search"
          class="search-input"
          type="search"
          placeholder="Search files by name, module, or type"
          autocomplete="off"
          value="${this.escapeAttribute(searchQuery)}"
        />
      </div>
    `;
  }

  static showLoading(message = 'Loading...') {
    const container = document.getElementById('content');
    if (!container) return;
    container.innerHTML = `<div class="loading">${this.escapeHtml(message)}</div>`;
  }

  static showError(message, { onRetry } = {}) {
    const container = document.getElementById('content');
    if (!container) return;

    const retry = onRetry ? `<button class="retry-btn" id="retry-btn">Try Again</button>` : '';

    container.innerHTML = `
      <div class="error">
        <div class="error-title">Something went wrong</div>
        <div class="error-message">${this.escapeHtml(message)}</div>
        ${retry}
      </div>
    `;

    if (onRetry) {
      const btn = document.getElementById('retry-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          try { onRetry(); } catch (error) { console.error('Retry handler failed:', error); }
        });
      }
    }
  }

  static renderCourses(coursesWithFiles, { searchQuery = '', selectedKeys = new Set() } = {}) {
    const container = document.getElementById('content');
    if (!container) return;

    const selectedCount = selectedKeys instanceof Set ? selectedKeys.size : 0;
    const selectionBar = this.renderSelectionBar({
      selectedCount
    });

    if (!coursesWithFiles.length) {
      const trimmedQuery = (searchQuery || '').trim();
      if (trimmedQuery) {
        container.innerHTML = `
          ${selectionBar}
          <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">[search]</div>
            <div>No files match "${this.escapeHtml(trimmedQuery)}".</div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        ${selectionBar}
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">[folder]</div>
          <div>No files found for your active courses.</div>
        </div>
      `;
      return;
    }

    const markup = coursesWithFiles.map(courseData => this.renderCourse(courseData, selectedKeys)).join('');
    container.innerHTML = selectionBar + markup;
  }

  static renderCourse({ course, files, error, disabled, disabledReason, searchActive, matchCount, totalCount }, selectedKeys = new Set()) {
    const courseName = course.name || course.course_code || 'Untitled Course';
    const termName = course.term?.name ? ` - ${course.term.name}` : '';
    const fileCount = Array.isArray(files) ? files.length : 0;
    const totalFiles = (typeof totalCount === 'number') ? totalCount : fileCount;
    const metaText = disabled
      ? `Files disabled${termName}`
      : error
        ? `Error loading files${termName}`
        : searchActive
          ? `${fileCount} match${fileCount === 1 ? '' : 'es'}${totalFiles !== fileCount ? ` of ${totalFiles}` : ''}${termName}`
          : `${fileCount} file${fileCount === 1 ? '' : 's'}${termName}`;

    const courseId = course.id;
    const filesMarkup = (files || []).map(file => this.renderFileRow(courseId, file, selectedKeys)).join('');
    const scrollable = !disabled && !error && fileCount > 5;
    const listClass = `file-list${scrollable ? ' scrollable' : ''}`;
    const bodyMarkup = disabled
      ? `<div class="course-disabled">${this.escapeHtml(disabledReason || 'Files area is disabled for this course.')}</div>`
      : error
        ? `<div class="course-error">${this.escapeHtml(error)}</div>`
        : (fileCount
          ? filesMarkup
          : '<div class="empty-course">No files published yet.</div>');

    return `
      <details class="course" open>
        <summary>
          <span class="course-name">${this.escapeHtml(courseName)}</span>
          <span class="course-meta">${this.escapeHtml(metaText)}</span>
        </summary>
        <div class="${listClass}">
          ${bodyMarkup}
        </div>
      </details>
    `;
  }

  static renderFileRow(courseId, file, selectedKeys = new Set()) {
    const title = file.display_name || file.filename || 'Untitled file';
    const updated = this.formatDate(file.updated_at || file.modified_at);
    const size = this.formatSize(file.size);
    const owner = file.user ? file.user.display_name || file.user.name : '';
    const moduleName = file.module_name || file.moduleName;
    const badge = this.getFileBadgeInfo(file);
    const fileKey = this.buildFileKey(courseId, file);
    const courseIdAttr = courseId != null ? String(courseId) : '';
    const isSelected = Boolean(fileKey && selectedKeys.has(fileKey));
    const rowClasses = ['file'];
    if (isSelected) {
      rowClasses.push('selected');
    }

    return `
      <div class="${rowClasses.join(' ')}" data-url="${this.escapeAttribute(file.url)}">
        <div class="file-primary">
          <label class="file-select-wrapper">
            <input
              type="checkbox"
              class="file-select"
              data-course-id="${this.escapeAttribute(courseIdAttr)}"
              data-file-key="${this.escapeAttribute(fileKey)}"
              ${isSelected ? 'checked' : ''}
              aria-label="Select file ${this.escapeAttribute(title)}"
            />
            <span class="file-checkbox-custom" aria-hidden="true"></span>
          </label>
          <span class="file-badge ${badge.className}" aria-hidden="true">${this.escapeHtml(badge.label)}</span>
          <span class="file-title">${this.escapeHtml(title)}</span>
        </div>
        <div class="file-meta">
          ${updated ? `<span>${this.escapeHtml(updated)}</span>` : ''}
          ${size ? `<span>${this.escapeHtml(size)}</span>` : ''}
          ${owner ? `<span>${this.escapeHtml(owner)}</span>` : ''}
          ${moduleName ? `<span>Module: ${this.escapeHtml(moduleName)}</span>` : ''}
        </div>
      </div>
    `;
  }

  static getFileBadgeInfo(file) {
    const extension = this.detectExtension(file);
    const mapping = [
      { label: 'PDF', className: 'file-badge--pdf', extensions: ['pdf'] },
      { label: 'DOC', className: 'file-badge--word', extensions: ['doc', 'docx', 'rtf', 'pages'] },
      { label: 'PPT', className: 'file-badge--slides', extensions: ['ppt', 'pptx', 'key'] },
      { label: 'XLS', className: 'file-badge--sheets', extensions: ['xls', 'xlsx', 'csv', 'tsv'] },
      { label: 'ZIP', className: 'file-badge--archive', extensions: ['zip', 'rar', '7z', 'gz', 'tar'] },
      { label: 'TXT', className: 'file-badge--text', extensions: ['txt', 'md'] },
      { label: 'IMG', className: 'file-badge--image', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'heic'] },
      { label: 'VID', className: 'file-badge--video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
      { label: 'AUD', className: 'file-badge--audio', extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'] },
      { label: 'CODE', className: 'file-badge--code', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'cs', 'rb', 'go', 'php', 'html', 'css', 'json', 'rs'] }
    ];

    const normalizedExt = (extension || '').toLowerCase();

    for (const entry of mapping) {
      if (entry.extensions.includes(normalizedExt)) {
        return { label: entry.label, className: entry.className };
      }
    }

    if (normalizedExt) {
      return { label: normalizedExt.toUpperCase(), className: 'file-badge--default' };
    }

    return { label: 'FILE', className: 'file-badge--default' };
  }

  static detectExtension(file) {
    const candidates = [file.display_name, file.filename, file.title];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const match = candidate.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
      if (match) return match[1];
    }

    if (file.url) {
      const url = file.url.toLowerCase();
      const match = url.match(/\.([a-z0-9]{1,6})(?:\?|$)/);
      if (match) return match[1];
    }

    const contentType = (file.content_type || '').toLowerCase();
    if (contentType) {
      if (contentType.includes('pdf')) return 'pdf';
      if (contentType.includes('msword')) return 'doc';
      if (contentType.includes('wordprocessingml')) return 'docx';
      if (contentType.includes('powerpoint')) return 'pptx';
      if (contentType.includes('presentationml')) return 'pptx';
      if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'xlsx';
      if (contentType.includes('zip') || contentType.includes('compressed')) return 'zip';
      if (contentType.includes('rar')) return 'rar';
      if (contentType.includes('csv')) return 'csv';
      if (contentType.includes('json')) return 'json';
      if (contentType.includes('javascript')) return 'js';
      if (contentType.includes('python')) return 'py';
      if (contentType.includes('plain')) return 'txt';

      if (contentType.startsWith('image/')) {
        return contentType.replace('image/', '');
      }

      if (contentType.startsWith('video/')) {
        const videoExt = contentType.replace('video/', '');
        if (videoExt === 'quicktime') return 'mov';
        if (videoExt === 'mpeg') return 'mpg';
        return videoExt;
      }

      if (contentType.startsWith('audio/')) {
        const audioExt = contentType.replace('audio/', '');
        if (audioExt === 'mpeg') return 'mp3';
        return audioExt;
      }
    }

    return '';
  }

  static buildFileKey(courseId, file) {
    if (!file) return '';
    const identifier = file.id || file.uuid || file.url;
    if (!identifier) return '';
    return `${courseId}:${identifier}`;
  }

  static renderSelectionBar({ selectedCount = 0 } = {}) {
    const hasSelection = selectedCount > 0;
    return `
      <div id="selection-bar" class="selection-bar">
        <div class="selection-info">
          <span id="selection-count">${selectedCount}</span> selected
        </div>
        <div class="selection-actions">
          <span class="selection-actions__label">Generate</span>
          <button id="generate-quiz" class="selection-btn" ${hasSelection ? '' : 'disabled'}>Quiz</button>
          <button id="generate-study" class="selection-btn" ${hasSelection ? '' : 'disabled'}>Cheat Sheet</button>
          <button id="generate-flashcards" class="selection-btn primary" ${hasSelection ? '' : 'disabled'}>Flash Cards</button>
          <button id="view-saved-flashcards" class="selection-btn">📚 View Saved</button>
        </div>
      </div>
    `;
  }

  static updateSelectionSummary({ selectedCount = 0 } = {}) {
    const countEl = document.getElementById('selection-count');
    if (countEl) {
      countEl.textContent = String(selectedCount);
    }
  }

  static toggleRefreshLoading(isLoading) {
    const btn = document.getElementById('refresh-btn');
    if (!btn) return;
    btn.classList.toggle('loading', Boolean(isLoading));
  }

  static formatDate(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return '';
    }
  }

  static formatSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  static escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  static escapeAttribute(text) {
    return this.escapeHtml(text);
  }
}
