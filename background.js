// Background script for Studyboard – routes API requests to a Canvas tab

function isCanvasUrl(url) {
  return Boolean(url && (url.includes('.instructure.com') || url.includes('canvas.duke.edu')));
}

function openOrFocusCanvasTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ['https://*.instructure.com/*', 'https://canvas.duke.edu/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, () => resolve(tab));
        return;
      }

      chrome.tabs.create({ url: 'https://canvas.duke.edu/' }, (tab) => {
        resolve(tab);
      });
    });
  });
}

function waitForTabReady(tabId, maxWaitMs = 12000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, maxWaitMs);

    function handleUpdated(id, info, tab) {
      if (id !== tabId) return;
      if (info.status === 'complete' && isCanvasUrl(tab.url)) {
        cleanup();
        resolve(true);
      }
    }

    function cleanup() {
      try { chrome.tabs.onUpdated.removeListener(handleUpdated); } catch (_) {}
      clearTimeout(timeout);
    }

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete' && isCanvasUrl(tab.url)) {
        cleanup();
        resolve(true);
      } else {
        chrome.tabs.onUpdated.addListener(handleUpdated);
      }
    });
  });
}

function waitForContentScript(tabId, maxWaitMs = 8000, intervalMs = 300) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (response && response.ok) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxWaitMs) {
          resolve(false);
          return;
        }
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'getCourses' && message.action !== 'getCourseFiles') {
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const currentTab = (tabs && tabs.length > 0) ? tabs[0] : null;

    const forwardMessage = (tabId) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError || !response) {
          sendResponse({
            success: false,
            error: 'Canvas page did not respond. Please refresh it and try again.'
          });
        } else {
          sendResponse(response);
        }
      });
    };

    if (currentTab && isCanvasUrl(currentTab.url)) {
      const ready = await waitForContentScript(currentTab.id, 4000, 200);
      if (!ready) {
        sendResponse({ success: false, error: 'Canvas tab not ready yet. Please wait and try again.' });
        return;
      }
      forwardMessage(currentTab.id);
      return true;
    }

    try {
      const tab = await openOrFocusCanvasTab();
      if (!tab) {
        sendResponse({ success: false, error: 'Unable to open Canvas tab automatically.' });
        return;
      }

      await waitForTabReady(tab.id);
      const ready = await waitForContentScript(tab.id);
      if (!ready) {
        sendResponse({ success: false, error: 'Canvas tab is open but not ready. Please press Try Again.' });
        return;
      }

      forwardMessage(tab.id);
    } catch (error) {
      console.error('Error preparing Canvas tab:', error);
      sendResponse({ success: false, error: 'Unable to reach Canvas. Open it manually then retry.' });
    }
  });

  return true;
});

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error('Error setting panel behavior:', error));
