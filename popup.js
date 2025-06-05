document.getElementById('csv').addEventListener('click', () => exportData('csv'));
document.getElementById('json').addEventListener('click', () => exportData('json'));
document.getElementById('exportPages').addEventListener('click', () => {
  console.log('[Popup] Export pages button clicked');
  
  const count = parseInt(document.getElementById('pageCount').value, 10);
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
