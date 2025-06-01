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

      // 1) Calculamos la media C y m=1000
      const ratings = products.map(p => parseFloat(p.rating));
      const C = ratings.reduce((a,b) => a+b, 0) / (ratings.length||1);
      const m = 1000;

      // 2) Añadimos bayescore a cada producto
      products.forEach(p => {
        const R = parseFloat(p.rating), v = parseInt(p.reviews,10);
        p.bayescore = (((v/(v+m))*R + (m/(v+m))*C) || 0).toFixed(3);
      });

      // 3) Generamos contenido
      const bom    = '\uFEFF';
      const header = ['title','description','rating','reviews','price','bayescore'];
      let content, filename;

      if (format === 'json') {
        content  = JSON.stringify(products, null, 2);
        filename = 'amazon_products.json';
      } else { // CSV format
        const rows = products.map(p =>
          [p.title, p.description, p.rating, p.reviews, p.price, p.bayescore]
            .map(v => `"${(v || '').toString().replace(/"/g,'""')}"`).join(',')
        );
        content  = bom + header.join(',') + '\n' + rows.join('\n');
        filename = 'amazon_products.csv';
      }

      // 4) Disparamos la descarga (Refactored download logic)
      const blob = new Blob([content], { type: format==='json'
        ? 'application/json;charset=utf-8'
        : 'text/csv;charset=utf-8'
      });
      downloadBlob(blob, filename);
    });
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename,
    saveAs: true
  }, id => {
    URL.revokeObjectURL(url);
    if (chrome.runtime.lastError) {
      console.error('Error al descargar:', chrome.runtime.lastError);
    }
  });
}
