// Configuration for page detection
const PAGE_DETECTION_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAYS: [0, 500, 1000], // ms - exponential backoff
  CONTENT_SCRIPT_TIMEOUT: 3000 // ms - time to wait for content script response
};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if there's an active export and show progress
  checkExportProgress();

  // Start page detection with retry mechanism
  detectPagesWithRetry();

  // Set up cancel button
  document.getElementById('cancelExport').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'cancelExport' }, response => {
      if (response?.success) {
        hideProgressSection();
      }
    });
  });

  // Set up manual retry button
  document.getElementById('retryDetection').addEventListener('click', () => {
    detectPagesWithRetry();
  });
});

// Main detection function with retry logic
async function detectPagesWithRetry() {
  const pageCountHelp = document.getElementById('pageCountHelp');
  const pageCountHelpText = document.getElementById('pageCountHelpText');
  const pageCountIcon = document.getElementById('pageCountIcon');
  const retryButton = document.getElementById('retryDetection');

  // Hide retry button and show detecting status
  retryButton.style.display = 'none';
  pageCountHelpText.textContent = 'Detectando páginas...';
  pageCountIcon.innerHTML = '&#8987;'; // Hourglass
  pageCountHelp.classList.add('visible', 'detecting');
  pageCountHelp.classList.remove('error');

  for (let attempt = 0; attempt < PAGE_DETECTION_CONFIG.MAX_RETRIES; attempt++) {
    // Wait for backoff delay (0ms on first attempt)
    if (attempt > 0) {
      pageCountHelpText.textContent = `Reintentando (${attempt + 1}/${PAGE_DETECTION_CONFIG.MAX_RETRIES})...`;
      await sleep(PAGE_DETECTION_CONFIG.RETRY_DELAYS[attempt]);
    }

    try {
      const result = await detectMaxPagesFromContent();

      if (result.success && result.maxPages > 1) {
        // Success! Update UI
        updatePageCountUI(result.maxPages);
        return;
      }

      // If we got a response with maxPages = 1 on last attempt, it might be a single page
      if (attempt === PAGE_DETECTION_CONFIG.MAX_RETRIES - 1) {
        if (result.success && result.maxPages === 1) {
          pageCountIcon.innerHTML = '&#10003;';
          pageCountHelpText.textContent = 'Una página detectada';
          pageCountHelp.classList.remove('detecting', 'error');
          return;
        }
      }

    } catch (error) {
      console.error(`[Popup] Detection attempt ${attempt + 1} failed:`, error);

      // On first failure, try to inject content script
      if (attempt === 0 && error.message?.includes('not responding')) {
        console.log('[Popup] Attempting to inject content script...');
        await ensureContentScriptInjected();
      }
    }
  }

  // All retries failed - show error and retry button
  showDetectionError();
}

// Detect max pages (single attempt)
function detectMaxPagesFromContent() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        reject(new Error('No active tab found'));
        return;
      }

      // Set timeout for content script response
      const timeout = setTimeout(() => {
        reject(new Error('Content script not responding'));
      }, PAGE_DETECTION_CONFIG.CONTENT_SCRIPT_TIMEOUT);

      chrome.tabs.sendMessage(tabId, { action: 'detectMaxPages' }, response => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          reject(new Error(`Content script error: ${chrome.runtime.lastError.message}`));
          return;
        }

        if (!response || typeof response.maxPages !== 'number') {
          reject(new Error('Invalid response from content script'));
          return;
        }

        resolve({
          success: true,
          maxPages: response.maxPages
        });
      });
    });
  });
}

// Ensure content script is injected
async function ensureContentScriptInjected() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) return;

    // Inject content script programmatically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['utils/productExtractor.js', 'content.js']
    });

    console.log('[Popup] Content script injected successfully');
    // Small delay to let script initialize
    await sleep(100);
  } catch (error) {
    console.error('[Popup] Failed to inject content script:', error);
  }
}

// Update UI with detected page count
function updatePageCountUI(maxPages) {
  const pageCountInput = document.getElementById('pageCount');
  const pageCountHelp = document.getElementById('pageCountHelp');
  const pageCountHelpText = document.getElementById('pageCountHelpText');
  const pageCountIcon = document.getElementById('pageCountIcon');

  pageCountInput.value = maxPages;
  pageCountInput.max = maxPages;

  pageCountIcon.innerHTML = '&#10003;';
  pageCountHelpText.textContent = `Se detectaron ${maxPages} páginas disponibles`;
  pageCountHelp.classList.add('visible');
  pageCountHelp.classList.remove('error', 'detecting');
}

// Show detection error with retry button
function showDetectionError() {
  const pageCountHelp = document.getElementById('pageCountHelp');
  const pageCountHelpText = document.getElementById('pageCountHelpText');
  const pageCountIcon = document.getElementById('pageCountIcon');
  const retryButton = document.getElementById('retryDetection');

  pageCountIcon.innerHTML = '';
  pageCountHelpText.textContent = 'No se pudo detectar';
  pageCountHelp.classList.add('visible', 'error');
  pageCountHelp.classList.remove('detecting');
  retryButton.style.display = 'inline-flex';
}

// Utility: sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

document.getElementById('csv').addEventListener('click', () => exportData('csv'));
document.getElementById('json').addEventListener('click', () => exportData('json'));
document.getElementById('exportPages').addEventListener('click', () => {
  console.log('[Popup] Export pages button clicked');
  
  const pageCountInput = document.getElementById('pageCount');
  let count = parseInt(pageCountInput.value, 10);
  const max = parseInt(pageCountInput.max, 10);
  
  // Ensure count doesn't exceed max if max is set
  if (max && count > max) {
    count = max;
    pageCountInput.value = max;
  }
  
  console.log(`[Popup] Page count: ${count}`);
  
  const message = { action: 'startCrawl', pages: count };
  console.log('[Popup] Sending message to background:', message);
  
  chrome.runtime.sendMessage(message, resp => {
    console.log('[Popup] Received response from background:', resp);
    
    if (chrome.runtime.lastError) {
      console.error('[Popup] Runtime error:', chrome.runtime.lastError);
      alert('Error: Background script not responding. Try reloading the extension.');
      return;
    }
    
    if (resp && resp.error) {
      console.error('[Popup] Background error:', resp.error);
      alert(`Error: ${resp.error}`);
    } else if (resp && resp.success) {
      console.log('[Popup] Crawl started successfully');
      // Show progress section and hide export section
      showProgressSection();
      startProgressListener();
      // Don't close popup, keep it open to show progress
    }
  });
});

function exportData(format) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tabId = tabs[0]?.id;
    if (!tabId) return alert('No active tab found.');

    chrome.tabs.sendMessage(tabId, { action: 'export' }, response => {
      if (chrome.runtime.lastError) {
        return alert('Error contacting content script.');
      }
      const products = response?.products || [];
      if (!products.length) return alert('No hay productos.');

      bayesUtils.addBayesScore(products);

      // 1) Generamos contenido
      let content, filename;

      if (format === 'json') {
        content  = JSON.stringify(products, null, 2);
        filename = 'amazon_products.json';
      } else { // CSV format
        content  = csvUtils.toCsv(products);
        filename = 'amazon_products.csv';
      }

      // 2) Disparamos la descarga (Refactored download logic)
      const blob = new Blob([content], { type: format==='json'
        ? 'application/json;charset=utf-8'
        : 'text/csv;charset=utf-8'
      });
      downloadUtils.downloadBlob(blob, filename);
    });
  });
}

// Progress management functions
function showProgressSection() {
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('exportSection').style.display = 'none';
  document.getElementById('multiPageSection').style.display = 'none';
}

function hideProgressSection() {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('exportSection').style.display = 'block';
  document.getElementById('multiPageSection').style.display = 'block';
}

function updateProgressUI(data) {
  const { currentPage, totalPages, totalProducts } = data;

  // Update progress text
  document.getElementById('progressText').textContent =
    `Página ${currentPage}/${totalPages} - ${totalProducts} productos`;

  // Update progress bar
  const progressPercent = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
  document.getElementById('progressFill').style.width = `${progressPercent}%`;

  // Update stats
  document.getElementById('progressPages').textContent = `${currentPage}/${totalPages} páginas`;
  document.getElementById('progressProducts').textContent = `${totalProducts} productos`;
}

function checkExportProgress() {
  chrome.storage.local.get(['exportProgress'], result => {
    if (result.exportProgress) {
      const progress = result.exportProgress;
      // If there's active progress, show it
      if (progress.currentPage > 0 && progress.currentPage < progress.totalPages) {
        showProgressSection();
        updateProgressUI(progress);
        
        // Start listening for progress updates
        startProgressListener();
      }
    }
  });
}

function startProgressListener() {
  // Listen for progress updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'progressUpdate') {
      updateProgressUI(message.data);
    } else if (message.action === 'exportComplete') {
      hideProgressSection();
    } else if (message.action === 'exportError') {
      hideProgressSection();
      alert(`Error durante la extracción: ${message.error}`);
    }
  });
}
