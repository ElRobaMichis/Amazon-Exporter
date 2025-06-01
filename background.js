// background.js
console.log('[background] service worker arrancado');

let collected = [];

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log('[background] onMessage recibido:', msg);
  if (msg.action === 'startCrawl') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab?.id) return console.error('[background] No se encontró pestaña activa');
      console.log('[background] iniciando crawl en pestaña', tab.id);
      collected = [];
      crawlPage(tab.id);
    });
  }
});

function crawlPage(tabId) {
  console.log('[background] crawlPage en tabId=', tabId);

  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const items = Array.from(
        document.querySelectorAll(
          'div.s-main-slot [data-component-type="s-search-result"]'
        )
      );
      return items.map(el => {
        const title     = el.querySelector('h2 span')?.textContent.trim() || '';
        const img       = el.querySelector('img.s-image'); // image element
        // Remove sponsored prefix from the alt text
        const rawAlt    = (img?.alt || '').replace(/^Anuncio patrocinado:\s*/i, '').trim();
        const description = rawAlt.startsWith(title) && rawAlt !== title
          ? rawAlt.slice(title.length).trim()
          : 'No aplica';
        let rating    = el.querySelector('i span.a-icon-alt')
                            ?.textContent.trim().split(' ')[0] || '0';
        // Normalize rating decimal separator
        rating = rating.replace(',', '.');
        const reviews   = el.querySelector('a[href*="#customerReviews"] span')
                            ?.textContent.replace(/[^\d]/g, '') || '0';
        const price     = el.querySelector('span.a-price span.a-offscreen')
                            ?.textContent.replace(/[^0-9.,]/g, '') || '0';
        return { title, description, rating, reviews, price };
      });
    }
  }).then(res => {
    if (chrome.runtime.lastError) {
      console.error('[background] Error executeScript page content:', chrome.runtime.lastError.message);
      return;
    }
    if (!res || !res[0] || !res[0].result) {
      console.error('[background] Unexpected result from executeScript:', res);
      return;
    }
    const pageProducts = res[0].result;
    console.log('[background] productos extraídos en esta página:', pageProducts.length);
    collected = collected.concat(pageProducts);

    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const btn = document.querySelector('a.s-pagination-next')
                 || document.querySelector('ul.a-pagination li.a-last a');
        return btn?.href || null;
      }
    }).then(nextRes => {
      if (chrome.runtime.lastError) {
        console.error('[background] Error executeScript next button:', chrome.runtime.lastError.message);
        return;
      }
      if (!nextRes || !nextRes[0]) {
        console.error('[background] Unexpected result from executeScript (next button):', nextRes);
        return;
      }
      const nextUrl = nextRes[0].result;
      if (nextUrl) {
        console.log('[background] yendo a siguiente página:', nextUrl);
        chrome.tabs.update(tabId, { url: nextUrl }, () => {
          if (chrome.runtime.lastError) {
            console.error('[background] Error navigating to next page:', chrome.runtime.lastError.message);
            return;
          }
          const listener = (updatedId, info) => {
            if (updatedId === tabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => crawlPage(tabId), 500);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      } else {
        console.log('[background] no hay más páginas — terminando');
        finishAndDownload();
      }
    }).catch(err => {
      console.error('[background] Promise rejected (next button script):', err);
    });
  }).catch(err => {
    console.error('[background] Promise rejected (page content script):', err);
  });
}

function finishAndDownload() {
  console.log('[background] calculando bayescore y generando CSV…');
  const ratings = collected.map(p => parseFloat(p.rating));
  const C = ratings.reduce((a,b) => a+b, 0) / (ratings.length||1);
  const m = 1000;
  collected.forEach(p => {
    const R = parseFloat(p.rating), v = parseInt(p.reviews,10);
    p.bayescore = (((v/(v+m))*R + (m/(v+m))*C) || 0).toFixed(3);
  });

  const seen = new Set();
  const unique = collected.filter(p => {
    const key = [p.title, p.description, p.rating, p.reviews, p.price, p.bayescore].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const bom    = '\uFEFF';
  const header = ['title', 'description', 'rating', 'reviews', 'price', 'bayescore'];
  const rows   = unique.map(p =>
    [p.title, p.description, p.rating, p.reviews, p.price, p.bayescore]
      .map(v => `"${v.replace(/"/g,'""')}"`)
      .join(',')
  );
  const csv = bom + header.join(',') + '\n' + rows.join('\n');

  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  chrome.downloads.download({
    url: dataUrl,
    filename: 'amazon_all_products.csv',
    saveAs: true
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[background] Error al descargar:', chrome.runtime.lastError);
    } else {
      console.log('[background] descarga iniciada con', unique.length, 'productos únicos');
    }
  });
}
