/**
 * Files Dashboard orchestrates loading Canvas courses and their published files.
 */

class FilesDashboard {
  constructor() {
    this.courses = [];
    this.courseData = [];
    this.isLoading = false;
    this.searchQuery = '';
    this.selectedFiles = new Map(); // key -> { courseId, courseName, file }

    this.flashcardGenerator = null;

    this.init();
  }

  init() {
    UIRenderer.renderHeader({ searchQuery: this.searchQuery });
    this.setupEventListeners();
    this.loadData();
  }

  setupEventListeners() {
    document.body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.id === 'refresh-btn') {
        event.preventDefault();
        this.loadData();
        return;
      }

      const fileRow = target.closest('.file');
      if (fileRow && fileRow.dataset.url) {
        if (target.closest('.file-select-wrapper')) {
          return;
        }
        if (target.classList.contains('file-select')) {
          return;
        }
        event.preventDefault();
        this.openFile(fileRow.dataset.url);
      }
    });

    document.body.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.id === 'file-search') {
        const value = target instanceof HTMLInputElement ? target.value : target.textContent;
        this.setSearchQuery(value ?? '');
      }
    });

    document.body.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.classList.contains('file-select')) {
        const courseId = target.getAttribute('data-course-id');
        const fileKey = target.getAttribute('data-file-key');
        const checked = target instanceof HTMLInputElement ? target.checked : false;
        const row = target.closest('.file');
        if (row) {
          row.classList.toggle('selected', checked);
        }
        const payload = this.lookupFile(courseId, fileKey);
        this.updateSelection(payload, checked);
      }
    });

    document.body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.id === 'download-selected') {
        event.preventDefault();
        this.downloadSelectedFiles();
      }

      if (target.id === 'generate-quiz') {
        event.preventDefault();
        this.showPlaceholder('Generate quiz');
      }

      if (target.id === 'generate-study') {
        event.preventDefault();
        this.showPlaceholder('Generate study content');
      }

      if (target.id === 'generate-flashcards') {
        event.preventDefault();
        this.openFlashcardGenerator();
      }
    });
  }

  async loadData() {
    if (this.isLoading) return;

    this.isLoading = true;
    UIRenderer.toggleRefreshLoading(true);
    UIRenderer.showLoading('Loading your Canvas courses...');

    try {
      const courses = await ApiService.getCourses();
      this.courses = this.filterCourses(courses);

      const results = [];
      for (const course of this.courses) {
        try {
          const response = await ApiService.getCourseFiles(course.id);
          if (response?.disabled) {
            results.push({
              course,
              files: [],
              allFiles: [],
              disabled: true,
              disabledReason: response.message
            });
          } else if (response?.files) {
            const files = this.sortFiles(response.files);
            results.push({
              course,
              files,
              allFiles: files,
              viaModules: Boolean(response.viaModules)
            });
          } else {
            const files = Array.isArray(response?.files) ? response.files : response;
            const sorted = this.sortFiles(files);
            results.push({ course, files: sorted, allFiles: sorted });
          }
        } catch (error) {
          console.error(`Failed to load files for course ${course.id}:`, error);
          results.push({
            course,
            files: [],
            allFiles: [],
            error: error?.message || 'Unable to load files for this course.'
          });
        }
      }

      this.courseData = this.sortCourses(results);
      this.pruneDeselected();
      this.render();
    } catch (error) {
      console.error('Unable to load Canvas data:', error);
      const message = error?.message || 'Unable to connect to Canvas.';
      UIRenderer.showError(message, { onRetry: () => this.loadData() });
    } finally {
      this.isLoading = false;
      UIRenderer.toggleRefreshLoading(false);
    }
  }

  render() {
    const totalCourses = this.courseData.filter(entry => !entry.error && !entry.disabled).length;
    const totalFiles = this.courseData
      .filter(entry => !entry.error && !entry.disabled)
      .reduce((sum, entry) => {
        const all = entry.allFiles || entry.files || [];
        return sum + all.length;
      }, 0);

    UIRenderer.renderHeader({
      title: 'Studyboard',
      subtitle: `Courses: ${totalCourses} | Files: ${totalFiles}`,
      searchQuery: this.searchQuery
    });

    if (this.isLoading && (!this.courseData || this.courseData.length === 0)) {
      return;
    }

    const filteredCourses = this.filterBySearch(this.courseData, this.searchQuery);
    const selectedKeys = new Set(this.selectedFiles.keys());

    UIRenderer.renderCourses(filteredCourses, {
      searchQuery: this.searchQuery,
      totalCourses,
      totalFiles,
      selectedKeys
    });

    this.renderSelectionState();
  }

  setSearchQuery(value) {
    if (typeof value !== 'string') {
      value = '';
    }

    if (value === this.searchQuery) {
      return;
    }

    const activeElement = document.activeElement;
    const wasSearchFocused = activeElement && activeElement.id === 'file-search';
    const selectionStart = wasSearchFocused && typeof activeElement.selectionStart === 'number'
      ? activeElement.selectionStart
      : null;
    const selectionEnd = wasSearchFocused && typeof activeElement.selectionEnd === 'number'
      ? activeElement.selectionEnd
      : null;

    this.searchQuery = value;
    this.render();

    if (wasSearchFocused) {
      const input = document.getElementById('file-search');
      if (input) {
        input.focus();
        const pos = selectionEnd ?? selectionStart ?? input.value.length;
        try {
          input.setSelectionRange(pos, pos);
        } catch (_) {
          // Ignore browsers that don't support setSelectionRange on this element
        }
      }
    }
  }

  getFileKey(courseId, file) {
    if (!file) return null;
    const identifier = file.id || file.uuid || file.url;
    if (!identifier) return null;
    return `${courseId}:${identifier}`;
  }

  lookupFile(courseId, fileKey) {
    if (!courseId || !fileKey) return null;
    const entry = this.courseData.find(item => String(item.course?.id) === String(courseId));
    if (!entry) return null;

    const allFiles = entry.allFiles || entry.files || [];
    const file = allFiles.find(candidate => this.getFileKey(courseId, candidate) === fileKey);

    if (!file) return null;

    return {
      courseId,
      courseName: entry.course?.name || entry.course?.course_code || 'Course',
      file
    };
  }

  updateSelection(payload, isSelected) {
    if (!payload) return;

    const key = this.getFileKey(payload.courseId, payload.file);
    if (!key) return;

    if (isSelected) {
      this.selectedFiles.set(key, payload);
    } else {
      this.selectedFiles.delete(key);
    }

    this.renderSelectionState();
    const generator = this.flashcardGenerator;
    if (generator?.isOpen()) {
      generator.renderSelectionList();
    }
  }

  pruneDeselected() {
    if (!this.selectedFiles.size) return;

    const validKeys = new Set();

    for (const entry of this.courseData) {
      if (!entry || entry.disabled || entry.error) continue;
      const courseId = entry.course?.id;
      const files = entry.allFiles || entry.files || [];
      for (const file of files) {
        const key = this.getFileKey(courseId, file);
        if (key) {
          validKeys.add(key);
        }
      }
    }

    for (const key of this.selectedFiles.keys()) {
      if (!validKeys.has(key)) {
        this.selectedFiles.delete(key);
      }
    }

    this.renderSelectionState();
    const generator = this.flashcardGenerator;
    if (generator?.isOpen()) {
      generator.renderSelectionList();
    }
  }

  renderSelectionState() {
    const bar = document.getElementById('selection-bar');
    if (!bar) return;
    UIRenderer.updateSelectionSummary({
      selectedCount: this.selectedFiles.size
    });
    const downloadBtn = document.getElementById('download-selected');
    if (downloadBtn) {
      downloadBtn.disabled = this.selectedFiles.size === 0;
    }
    ['generate-quiz', 'generate-study', 'generate-flashcards'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.disabled = this.selectedFiles.size === 0;
      }
    });
  }

  async downloadSelectedFiles() {
    if (!this.selectedFiles.size) return;

    if (this.selectedFiles.size === 1) {
      const payload = this.selectedFiles.values().next().value;
      const url = payload?.file?.url;
      if (url) {
        this.openFile(url);
      }
      return;
    }

    const downloadBtn = document.getElementById('download-selected');
    const originalLabel = downloadBtn?.textContent;

    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Preparing download...';
      downloadBtn.classList.add('loading');
    }

    try {
      const seenNames = new Map();
      const entries = [];
      let index = 0;

      for (const payload of this.selectedFiles.values()) {
        index += 1;
        const entry = await this.prepareZipEntry(payload, index, seenNames);
        if (entry) {
          entries.push(entry);
        }
      }

      if (!entries.length) {
        this.downloadIndividually();
        return;
      }

      const zipBlob = await ZipBuilder.create(entries);
      const filename = this.buildZipFileName(entries.length);
      this.triggerBlobDownload(zipBlob, filename);
    } catch (error) {
      console.error('Failed to bundle files for download:', error);
      this.downloadIndividually();
    } finally {
      if (downloadBtn) {
        downloadBtn.classList.remove('loading');
        if (typeof originalLabel === 'string') {
          downloadBtn.textContent = originalLabel;
        }
        downloadBtn.disabled = this.selectedFiles.size === 0;
      }
    }
  }

  async prepareZipEntry(payload, index, seenNames) {
    if (!payload || !payload.file?.url) {
      return null;
    }

    const name = this.buildDownloadFilename(payload, index, seenNames);

    try {
      const response = await fetch(payload.file.url, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      const lastModified = payload.file.updated_at || payload.file.modified_at || response.headers.get('last-modified');

      return {
        name,
        data,
        lastModified
      };
    } catch (error) {
      console.error('Unable to fetch file for zip:', error);
      return null;
    }
  }

  downloadIndividually() {
    for (const payload of this.selectedFiles.values()) {
      const url = payload?.file?.url;
      if (!url) continue;
      try {
        this.openFile(url);
      } catch (error) {
        console.error('Failed to open file for download:', error);
      }
    }
  }

  buildDownloadFilename(payload, index, seenNames) {
    const rawName = payload?.file?.display_name || payload?.file?.filename || `file-${index}`;
    const sanitized = this.sanitizeFileName(rawName) || `file-${index}`;
    const key = sanitized.toLowerCase();
    const count = seenNames.get(key) || 0;
    seenNames.set(key, count + 1);

    if (count === 0) {
      return sanitized;
    }

    const dotIndex = sanitized.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex < sanitized.length - 1) {
      return `${sanitized.slice(0, dotIndex)} (${count})${sanitized.slice(dotIndex)}`;
    }
    return `${sanitized} (${count})`;
  }

  buildZipFileName(fileCount) {
    const names = new Set();
    for (const payload of this.selectedFiles.values()) {
      if (payload?.courseName) {
        names.add(payload.courseName);
      }
    }

    const baseName = names.size === 1 ? names.values().next().value : 'canvas-files';
    const sanitizedBase = this.sanitizeFileName(baseName) || 'canvas-files';
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    return `${sanitizedBase}-${fileCount}-files-${timestamp}.zip`;
  }

  sanitizeFileName(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const cleaned = trimmed
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/[\u0000-\u001F]+/g, '')
      .replace(/^\.+$/, '_');

    return cleaned || '';
  }

  triggerBlobDownload(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'download.zip';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  showPlaceholder(actionName) {
    const message = `${actionName} is coming soon. Selected files: ${this.selectedFiles.size}`;
    console.info(message);
    alert?.(message);
  }

  openFlashcardGenerator() {
    const generator = this.ensureFlashcardGenerator();
    if (!generator) {
      this.showPlaceholder('Flash card generator');
      return;
    }

    if (!this.selectedFiles.size) {
      alert?.('Select at least one file to generate flashcards.');
      return;
    }

    generator.open();
  }

  ensureFlashcardGenerator() {
    if (this.flashcardGenerator) {
      return this.flashcardGenerator;
    }

    if (!window.FlashcardGenerator) {
      console.warn('Flashcard generator script not available yet.');
      return null;
    }

    try {
      const instance = new FlashcardGenerator({
        getSelection: () => Array.from(this.selectedFiles.values())
      });
      this.flashcardGenerator = instance;
      return instance;
    } catch (error) {
      console.error('Unable to initialize flashcard generator:', error);
      return null;
    }
  }

  filterBySearch(entries, rawQuery) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const query = (rawQuery || '').trim().toLowerCase();
    if (!query) {
      return entries;
    }

    const filtered = [];

    for (const entry of entries) {
      if (!entry || entry.disabled || entry.error) {
        continue;
      }

      const allFiles = entry.allFiles || entry.files || [];
      const matches = allFiles.filter(file => this.fileMatchesQuery(file, query));
      if (matches.length) {
        filtered.push({
          ...entry,
          files: matches,
          matchCount: matches.length,
          totalCount: allFiles.length,
          searchActive: true
        });
      }
    }

    return filtered;
  }

  fileMatchesQuery(file, query) {
    if (!file) return false;

    const fields = [
      file.display_name,
      file.filename,
      file.title,
      file.description,
      file.user?.display_name,
      file.user?.name,
      file.module_name,
      file.moduleName
    ];

    for (const field of fields) {
      if (typeof field === 'string' && field.toLowerCase().includes(query)) {
        return true;
      }
    }

    const extension = UIRenderer.detectExtension?.(file);
    if (extension && extension.toLowerCase().includes(query)) {
      return true;
    }

    return false;
  }

  filterCourses(courses) {
    if (!Array.isArray(courses)) return [];
    return courses
      .filter(course => course && course.id)
      .filter(course => course.access_restricted_by_date !== true)
      .sort((a, b) => {
        const nameA = (a.name || a.course_code || '').toLowerCase();
        const nameB = (b.name || b.course_code || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }

  sortFiles(files) {
    if (!Array.isArray(files)) return [];
    return [...files].sort((a, b) => {
      const dateA = new Date(a.updated_at || a.modified_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.modified_at || 0).getTime();
      return dateB - dateA;
    });
  }

  sortCourses(courseData) {
    return [...courseData].sort((a, b) => {
      const nameA = (a.course?.name || a.course?.course_code || '').toLowerCase();
      const nameB = (b.course?.name || b.course?.course_code || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  openFile(url) {
    if (!url) return;
    try {
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open file link:', error);
    }
  }
}

/**
 * Minimal ZIP archive builder (store-only, no compression) for bundling downloads client-side.
 */
class ZipBuilder {
  static create(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return new Blob([], { type: 'application/zip' });
    }

    const fileRecords = [];
    const centralRecords = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = this.encodeUtf8(entry?.name || 'file');
      const data = entry?.data instanceof Uint8Array ? entry.data : new Uint8Array(entry?.data || []);
      const { time, date } = this.getDosDateTime(entry?.lastModified);
      const crc = this.computeCrc32(data);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, time, true);
      localView.setUint16(12, date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      fileRecords.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, time, true);
      centralView.setUint16(14, date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      centralRecords.push(centralHeader);

      offset += localHeader.length + data.length;
    }

    const centralLength = centralRecords.reduce((sum, part) => sum + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralLength, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...fileRecords, ...centralRecords, endRecord], {
      type: 'application/zip'
    });
  }

  static encodeUtf8(value) {
    return new TextEncoder().encode(typeof value === 'string' ? value : String(value ?? 'file'));
  }

  static getDosDateTime(input) {
    const date = this.parseDate(input);
    const year = Math.max(1980, date.getFullYear());
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    return { date: dosDate, time: dosTime };
  }

  static parseDate(value) {
    if (!value) {
      return new Date();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }

  static computeCrc32(data) {
    let crc = 0xffffffff;
    const table = this.getCrcTable();
    for (let i = 0; i < data.length; i += 1) {
      const byte = data[i];
      crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  static getCrcTable() {
    if (this.crcTable) {
      return this.crcTable;
    }
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    this.crcTable = table;
    return table;
  }
}
