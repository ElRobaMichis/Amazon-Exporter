// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if there's an active export and show progress
  checkExportProgress();
  
  // Request max pages from content script
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    
    chrome.tabs.sendMessage(tabId, { action: 'detectMaxPages' }, response => {
      if (!chrome.runtime.lastError && response?.maxPages && response.maxPages > 1) {
        const pageCountInput = document.getElementById('pageCount');
        const pageCountHelp = document.getElementById('pageCountHelp');
        
        pageCountInput.value = response.maxPages;
        pageCountInput.max = response.maxPages;
        
        // Show helpful text
        pageCountHelp.textContent = `Se detectaron ${response.maxPages} páginas disponibles`;
        pageCountHelp.style.display = 'block';
      }
    });
  });
  
  // Set up cancel button
  document.getElementById('cancelExport').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'cancelExport' }, response => {
      if (response?.success) {
        hideProgressSection();
      }
    });
  });
});

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
  document.querySelector('.multi-page-section').style.display = 'none';
}

function hideProgressSection() {
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('exportSection').style.display = 'block';
  document.querySelector('.multi-page-section').style.display = 'block';
}

function updateProgressUI(data) {
  const { currentPage, totalPages, totalProducts } = data;
  
  // Update progress text
  document.getElementById('progressText').textContent = 
    `Página ${currentPage}/${totalPages} - ${totalProducts} productos encontrados`;
  
  // Update progress bar
  const progressPercent = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
  document.getElementById('progressFill').style.width = `${progressPercent}%`;
  
  // Update stats
  document.getElementById('progressPages').textContent = `Páginas: ${currentPage}/${totalPages}`;
  document.getElementById('progressProducts').textContent = `Productos: ${totalProducts}`;
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
