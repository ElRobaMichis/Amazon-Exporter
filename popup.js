console.log('[popup] cargado');

document.getElementById('csv').addEventListener('click', () => exportData('csv'));
document.getElementById('json').addEventListener('click', () => exportData('json'));
document.getElementById('exportAll').addEventListener('click', () => {
  console.log('[popup] click Exportar TODAS las páginas');
  chrome.runtime.sendMessage({ action: 'startCrawl' }, resp => {
    console.log('[popup] respuesta de startCrawl callback:', resp);
  });
  // No window.close() call here.
});

function exportData(format) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tabId = tabs[0]?.id;
    if (!tabId) return alert('No active tab found.');

    chrome.tabs.sendMessage(tabId, { action: 'export' }, response => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return alert('Error contacting content script.');
      }
      const products = response?.products || [];
      if (!products.length) return alert('No hay productos.');

      bayesUtils.addBayesScore(products);

      // 3) Generamos contenido
      let content, filename;

      if (format === 'json') {
        content  = JSON.stringify(products, null, 2);
        filename = 'amazon_products.json';
      } else { // CSV format
        content  = csvUtils.toCsv(products);
        filename = 'amazon_products.csv';
      }

      // 4) Disparamos la descarga (Refactored download logic)
      const blob = new Blob([content], { type: format==='json'
        ? 'application/json;charset=utf-8'
        : 'text/csv;charset=utf-8'
      });
      downloadUtils.downloadBlob(blob, filename);
    });
  });
}
