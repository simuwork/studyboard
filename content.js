// Content script for Studyboard
console.log('Studyboard content script loaded on:', window.location.href);

const API_BASE = '/api/v1';
const MAX_FILE_RESULTS = 300; // safety guard for pagination
const MAX_MODULE_RESULTS = 200;

async function fetchJsonWithPagination(url, maxItems = Infinity) {
  let results = [];
  let nextUrl = url;
  let pageCount = 0;

  while (nextUrl && results.length < maxItems && pageCount < 10) {
    const response = await fetch(nextUrl, { credentials: 'include' });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.response = response;
      throw error;
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      results = results.concat(data);
    } else if (data) {
      results.push(data);
    }

    const linkHeader = response.headers.get('link');
    nextUrl = null;

    if (linkHeader) {
      const parts = linkHeader.split(',');
      for (const part of parts) {
        const section = part.split(';');
        if (section.length !== 2) continue;
        const urlPart = section[0].trim().replace(/[<>]/g, '');
        const relPart = section[1].trim();
        if (relPart === 'rel="next"') {
          nextUrl = urlPart;
          break;
        }
      }
    }

    pageCount += 1;
  }

  return results.slice(0, maxItems);
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.statusText = response.statusText;
    error.response = response;
    throw error;
  }
  return await response.json();
}

async function fetchFileDetail(fileId) {
  return await fetchJson(`${API_BASE}/files/${fileId}`);
}

async function fetchFilesViaModules(courseId) {
  const modulesUrl = `${API_BASE}/courses/${courseId}/modules?include[]=items&include[]=content_details&per_page=50`;
  const modules = await fetchJsonWithPagination(modulesUrl, MAX_MODULE_RESULTS);

  if (!Array.isArray(modules) || modules.length === 0) {
    return { files: [], viaModules: true };
  }

  const seen = new Set();
  const candidates = [];

  outer: for (const module of modules) {
    const moduleName = module?.name;
    const items = Array.isArray(module?.items) ? module.items : [];

    for (const item of items) {
      if (!item || item.type !== 'File') continue;
      if (item.locked_for_user) continue;
      if (item.published === false) continue;

      const id = item.content_id;
      const url = item.html_url || item.url || item.content_details?.url;
      if (!id && !url) continue;

      const key = id ? `id:${id}` : `url:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const title = item.title || item.content_details?.display_name || item.content_details?.name || 'File';
      const size = item.content_details?.size;
      const updatedAt = item.updated_at || item.created_at || module.updated_at || module.created_at || null;

      candidates.push({ id, url, title, size, updatedAt, moduleName });

      if (candidates.length >= MAX_FILE_RESULTS) {
        break outer;
      }
    }
  }

  if (!candidates.length) {
    return { files: [], viaModules: true };
  }

  const files = [];

  for (const candidate of candidates) {
    if (candidate.id) {
      try {
        const detail = await fetchFileDetail(candidate.id);
        files.push({ ...detail, module_name: candidate.moduleName });
        continue;
      } catch (err) {
        console.warn('Module fallback failed to fetch file detail:', candidate.id, err);
      }
    }

    files.push({
      id: candidate.id || candidate.url,
      display_name: candidate.title,
      filename: candidate.title,
      url: candidate.url,
      updated_at: candidate.updatedAt,
      created_at: candidate.updatedAt,
      size: candidate.size,
      module_name: candidate.moduleName
    });
  }

  return { files, viaModules: true };
}

async function fetchCourses() {
  const url = `${API_BASE}/courses?enrollment_state=active&completed=false&include[]=term&per_page=100`;
  return await fetchJsonWithPagination(url, 200);
}

async function fetchCourseFiles(courseId) {
  const base = `${API_BASE}/courses/${courseId}/files`;
  const params = new URLSearchParams({
    sort: 'updated_at',
    order: 'desc',
    per_page: '100'
  });
  params.append('include[]', 'user');
  const url = `${base}?${params.toString()}`;

  try {
    const files = await fetchJsonWithPagination(url, MAX_FILE_RESULTS);
    return { files, disabled: false };
  } catch (error) {
    if (error.status === 403) {
      let message = 'Files are disabled for this course.';

      try {
        const moduleFallback = await fetchFilesViaModules(courseId);
        if (moduleFallback?.files?.length) {
          return { ...moduleFallback, disabled: false };
        }
      } catch (moduleError) {
        console.warn('Module fallback failed:', moduleError);
      }

      if (error.response) {
        try {
          const text = await error.response.clone().text();
          if (text) {
            const lower = text.toLowerCase();
            try {
              const data = JSON.parse(text);
              const possibleMessage = data?.errors?.[0]?.message || data?.message || data?.error;
              if (possibleMessage) {
                const clean = String(possibleMessage).trim();
                if (clean) {
                  message = clean;
                }
              }
            } catch (_) {
              if (lower.includes('disabled') || lower.includes('unauthorized') || lower.includes('locked')) {
                const clean = text.trim();
                if (clean) {
                  message = clean;
                }
              }
            }
          }
        } catch (_) {
          // ignore parsing issues; default message stands
        }
      }

      return { files: [], disabled: true, message };
    }

    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, courseId } = message;

  let promise;

  switch (action) {
    case 'ping':
      sendResponse({ ok: true, url: window.location.href });
      return;
    case 'getCourses':
      promise = fetchCourses();
      break;
    case 'getCourseFiles':
      promise = fetchCourseFiles(courseId);
      break;
    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return;
  }

  promise
    .then(data => sendResponse({ success: true, data }))
    .catch(error => {
      console.error('Studyboard content script error:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true;
});
