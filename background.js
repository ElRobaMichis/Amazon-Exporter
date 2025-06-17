// background.js
console.log('[Background] Background script starting...');

// Import scripts with error handling for each one
const scriptsToImport = ['utils/bayes.js', 'utils/csv.js', 'utils/downloader.js', 'utils/productExtractor.js'];

scriptsToImport.forEach(script => {
  try {
    importScripts(script);
    console.log(`[Background] Successfully imported: ${script}`);
  } catch (error) {
    console.error(`[Background] Error importing ${script}:`, error);
  }
});

let collected = [];
let pagesRemaining = Infinity;
let isDownloading = false;

console.log('[Background] Background script initialized');

// Test if the service worker is responding
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension startup');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Background] Received message:', msg);
  
  if (msg.action === 'startCrawl') {
    console.log('[Background] Processing startCrawl action');
    
    // Simple test response first
    sendResponse({ success: true, message: 'Background script is working!' });
    
    pagesRemaining = parseInt(msg.pages, 10);
    if (isNaN(pagesRemaining) || pagesRemaining < 1) pagesRemaining = Infinity;
    
    console.log(`[Background] Starting crawl for ${pagesRemaining === Infinity ? 'all' : pagesRemaining} pages`);
    
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab?.id) {
        console.error('[Background] No active tab found');
        return;
      }
      
      console.log(`[Background] Active tab found: ${tab.id}, URL: ${tab.url}`);
      
      collected = [];
      isDownloading = false;
      
      // For now, just test that we can inject a simple script
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('[Content] Simple test script executed');
          return { test: true, url: window.location.href };
        }
      }).then(result => {
        console.log('[Background] Test script result:', result);
        
        // Now try the actual crawl
        crawlPage(tab.id);
      }).catch(error => {
        console.error('[Background] Error executing test script:', error);
      });
    });
    
    return true;
  }
  
  return false;
});

function crawlPage(tabId) {
  if (pagesRemaining !== Infinity) pagesRemaining--;
  
  console.log(`[Background] Starting crawl on tab ${tabId}, pages remaining: ${pagesRemaining}`);

  // Execute the extraction function using the same logic as content.js
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      console.log('[Content] ProductExtractor available:', typeof ProductExtractor !== 'undefined');
      
      try {
        // Use extractSimpleProducts which should apply filtering
        if (typeof ProductExtractor !== 'undefined') {
          const products = ProductExtractor.extractSimpleProducts(document);
          console.log(`[Content] Extracted ${products.length} products using ProductExtractor.extractSimpleProducts`);
          
          // Apply additional filtering to remove sponsored products that slipped through
          const filtered = products.filter(product => {
            const title = product.title || '';
            
            // Check if title contains sponsored labels
            const hasSponsored = /anuncio\s+patrocinado|sponsored|publicidad|promoted/i.test(title);
            
            if (hasSponsored) {
              console.log(`[Content] Filtering out sponsored product: ${title.substring(0, 50)}...`);
              return false;
            }
            
            // Additional validation for minimum length and quality
            if (title.length < 10) {
              console.log(`[Content] Filtering out short title: ${title}`);
              return false;
            }
            
            return true;
          });
          
          console.log(`[Content] After additional filtering: ${filtered.length} products (removed ${products.length - filtered.length} sponsored/invalid)`);
          
          // Normalize product format for consistency with content.js format
          return filtered.map(product => ({
            title: product.title,
            rating: product.rating,
            reviews: product.reviews, 
            price: product.price
          }));
        } else {
          console.error('[Content] ProductExtractor not available');
          return [];
        }
      } catch (error) {
        console.error('[Content] Error extracting products:', error);
        return [];
      }
    }
  }).then(res => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Runtime error during extraction:', chrome.runtime.lastError);
        finishAndDownload();
        return;
      }
      if (!res || !res[0] || !res[0].result) {
        console.error('[Background] No result from extraction script');
        finishAndDownload();
        return;
      }
      const pageProducts = res[0].result;
      console.log(`[Background] Collected ${pageProducts.length} products from page`);
      collected = collected.concat(pageProducts);

      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // More comprehensive pagination selector
          const btn = document.querySelector('a.s-pagination-next') ||
                     document.querySelector('ul.a-pagination li.a-last a') ||
                     document.querySelector('a[aria-label*="Next"]') ||
                     document.querySelector('a[aria-label*="Siguiente"]') ||
                     document.querySelector('span.s-pagination-next') ||
                     document.querySelector('.a-last a');
          
          const href = btn?.href;
          
          // Make relative URLs absolute
          if (href && !href.startsWith('http')) {
            const currentUrl = new URL(window.location.href);
            const absoluteUrl = new URL(href, currentUrl.origin).href;
            return absoluteUrl;
          }
          
          return href || null;
        }
      }).then(nextRes => {
        if (chrome.runtime.lastError) {
          finishAndDownload();
          return;
        }
        if (!nextRes || !nextRes[0]) {
          finishAndDownload();
          return;
        }
        const nextUrl = nextRes[0].result;
        if (nextUrl && pagesRemaining > 0) {
          chrome.tabs.update(tabId, { url: nextUrl }, () => {
            if (chrome.runtime.lastError) {
              finishAndDownload();
              return;
            }
            
            let navigationComplete = false;
            
            const listener = (updatedId, info) => {
              if (updatedId === tabId && info.status === 'complete' && !navigationComplete) {
                navigationComplete = true;
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(() => crawlPage(tabId), 1000);
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            
            // Add timeout fallback in case page doesn't load properly
            setTimeout(() => {
              if (!navigationComplete) {
                navigationComplete = true;
                chrome.tabs.onUpdated.removeListener(listener);
                crawlPage(tabId);
              }
            }, 10000);
          });
        } else {
          finishAndDownload();
        }
      }).catch(err => {
        finishAndDownload();
      });
  }).catch(err => {
    finishAndDownload();
  });
}

function finishAndDownload() {
  if (isDownloading) {
    console.log('[Background] Download already in progress, skipping');
    return; // Prevent multiple downloads
  }
  isDownloading = true;
  
  console.log(`[Background] Finishing crawl. Total products collected: ${collected.length}`);
  
  try {
    if (collected.length === 0) {
      console.log('[Background] No products collected');
      return;
    }
    
    // Store extracted products in chrome.storage for the Bayesian selection page
    chrome.storage.local.set({ extractedProducts: collected }, () => {
      console.log('[Background] Products stored, opening Bayesian selection page');
      
      // Open the Bayesian selection page
      chrome.tabs.create({
        url: chrome.runtime.getURL('bayes_selection.html'),
        active: true
      }, (tab) => {
        console.log(`[Background] Bayesian selection page opened in tab ${tab.id}`);
      });
    });
    
  } catch (error) {
    console.error('[Background] Error during finish process:', error);
  }
}

