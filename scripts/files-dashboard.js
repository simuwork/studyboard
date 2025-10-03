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

      if (target.id === 'view-saved-flashcards') {
        event.preventDefault();
        this.openFlashcardViewer();
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
    ['generate-quiz', 'generate-study', 'generate-flashcards'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.disabled = this.selectedFiles.size === 0;
      }
    });
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

  async openFlashcardViewer() {
    try {
      const result = await chrome.storage.local.get(['savedFlashcards']);
      const savedFlashcards = result.savedFlashcards || [];

      if (savedFlashcards.length === 0) {
        alert?.('No saved flashcards yet. Generate some flashcards first!');
        return;
      }

      // Open the flashcard viewer page
      const viewerUrl = chrome.runtime.getURL('viewer.html');
      window.open(viewerUrl, '_blank');
    } catch (error) {
      console.error('Error opening flashcard viewer:', error);
      alert?.('Error loading saved flashcards.');
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
