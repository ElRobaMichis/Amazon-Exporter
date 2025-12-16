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
let totalPagesToExport = 0;
let currentPageNumber = 0;
let isCancelled = false;
let firstPageUrl = null;
let crawlTabId = null;

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
  
  if (msg.action === 'cancelExport') {
    console.log('[Background] Export cancellation requested');
    isCancelled = true;
    sendResponse({ success: true });
    return true;
  }
  
  if (msg.action === 'startCrawl') {
    console.log('[Background] Processing startCrawl action');
    
    // Simple test response first
    sendResponse({ success: true, message: 'Background script is working!' });
    
    pagesRemaining = parseInt(msg.pages, 10);
    if (isNaN(pagesRemaining) || pagesRemaining < 1) pagesRemaining = Infinity;
    
    // Initialize progress tracking
    totalPagesToExport = pagesRemaining === Infinity ? msg.pages || 1 : pagesRemaining;
    currentPageNumber = 0;
    isCancelled = false;
    
    console.log(`[Background] Starting crawl for ${pagesRemaining === Infinity ? 'all' : pagesRemaining} pages`);
    
    // Initialize progress data storage
    chrome.storage.local.set({
      exportProgress: {
        totalPages: totalPagesToExport,
        currentPage: 0,
        totalProducts: 0
      }
    });
    
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab?.id) {
        console.error('[Background] No active tab found');
        return;
      }
      
      console.log(`[Background] Active tab found: ${tab.id}, URL: ${tab.url}`);

      collected = [];
      isDownloading = false;
      crawlTabId = tab.id;
      
      // Progress tracking will be handled via popup and notifications
      
      // Start progress notification system
      showProgressNotification('start');
      updateBadgeText(0, totalPagesToExport);
      
      // Start the crawl
      crawlPage(tab.id);
    });
    
    return true;
  }
  
  return false;
});

function crawlPage(tabId) {
  // Check if export was cancelled
  if (isCancelled) {
    console.log('[Background] Export cancelled, stopping crawl');
    return;
  }
  
  if (pagesRemaining !== Infinity) pagesRemaining--;
  currentPageNumber++;
  
  console.log(`[Background] Starting crawl on tab ${tabId}, page ${currentPageNumber}, pages remaining: ${pagesRemaining}`);
  
  // Update progress
  updateProgress(tabId);

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
          
          // Normalize product format - include all fields for proper deduplication
          return filtered.map(product => ({
            title: product.title,
            rating: product.rating,
            reviews: product.reviews,
            price: product.price,
            link: product.link,
            asin: product.asin,
            imageUrl: product.imageUrl,
            listPrice: product.listPrice,
            discount: product.discount,
            monthlyPurchases: product.monthlyPurchases,
            isPrime: product.isPrime,
            deliveryDate: product.deliveryDate,
            unitPrice: product.unitPrice,
            installmentPrice: product.installmentPrice,
            hasSubscribeSave: product.hasSubscribeSave
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

      // Deduplicate while adding - use ASIN as primary key, fallback to title
      const existingKeys = new Set(collected.map(p => p.asin || p.title));
      const newProducts = pageProducts.filter(p => {
        const key = p.asin || p.title;
        if (existingKeys.has(key)) {
          console.log(`[Background] Skipping duplicate: ${key}`);
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      console.log(`[Background] Added ${newProducts.length} new products (${pageProducts.length - newProducts.length} duplicates skipped)`);
      collected = collected.concat(newProducts);

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
        if (nextUrl && pagesRemaining > 0 && !isCancelled) {
          chrome.tabs.update(tabId, { url: nextUrl }, () => {
            if (chrome.runtime.lastError) {
              finishAndDownload();
              return;
            }
            
            let navigationComplete = false;
            
            const listener = (updatedId, info) => {
              if (updatedId === tabId && info.status === 'complete' && !navigationComplete && !isCancelled) {
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

// Notification and badge progress functions
function showProgressNotification(type, data = {}) {
  const notificationId = 'amazon-exporter-progress';
  
  switch (type) {
    case 'start':
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '🚀 Amazon Products Exporter',
        message: `Iniciando extracción de ${totalPagesToExport} páginas...`,
        priority: 1
      });
      break;
      
    case 'progress':
      const { currentPage, totalPages, totalProducts } = data;
      if (currentPage % 2 === 0 || currentPage === totalPages) { // Update every 2 pages or on last page
        chrome.notifications.create(notificationId, {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '📦 Amazon Products Exporter',
          message: `Página ${currentPage}/${totalPages} - ${totalProducts} productos encontrados`,
          priority: 1
        });
      }
      break;
      
    case 'complete':
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '✅ Extracción completada',
        message: `${data.totalProducts} productos exportados. Configurando Bayesian scores...`,
        priority: 2
      });

      // Clear notification after 5 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 5000);
      break;
      
    case 'error':
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '❌ Error en la extracción',
        message: data.error || 'Error inesperado durante la extracción',
        priority: 2
      });
      break;
  }
}

function updateBadgeText(current, total) {
  const badgeText = total > 0 ? `${current}/${total}` : '';
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
  
  if (current === total && total > 0) {
    // Show completion badge briefly
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#007bff' });
    
    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }
}

// Function to update progress indicator
function updateProgress(tabId) {
  const progressData = {
    totalPages: totalPagesToExport,
    currentPage: currentPageNumber,
    totalProducts: collected.length,
    currentUrl: ''
  };
  
  // Get current tab URL for side panel
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) {
      progressData.currentUrl = tab.url;
    }
    
    // Store progress data
    chrome.storage.local.set({ exportProgress: progressData });
    
    // Send progress update to popup (if open)
    chrome.runtime.sendMessage({
      action: 'progressUpdate',
      data: progressData
    }).catch(() => {
      // Popup might not be open, ignore errors
    });
  });
  
  // Update badge text
  updateBadgeText(currentPageNumber, totalPagesToExport);
  
  // Show progress notification
  showProgressNotification('progress', {
    currentPage: currentPageNumber,
    totalPages: totalPagesToExport,
    totalProducts: collected.length
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
      const errorMsg = 'No se encontraron productos para exportar';
      
      showProgressNotification('error', { error: errorMsg });
      
      // Send error to popup (if open)
      chrome.runtime.sendMessage({
        action: 'exportError',
        error: errorMsg
      }).catch(() => {
        // Popup might not be open, ignore errors
      });
      
      return;
    }
    
    // Show completion notification and update badge
    showProgressNotification('complete', { 
      totalProducts: collected.length 
    });
    updateBadgeText(totalPagesToExport, totalPagesToExport);
    
    // Send completion to popup (if open)
    chrome.runtime.sendMessage({
      action: 'exportComplete',
      data: { totalProducts: collected.length }
    }).catch(() => {
      // Popup might not be open, ignore errors
    });
    
    // Store extracted products in chrome.storage for the Bayesian selection page
    chrome.storage.local.set({ extractedProducts: collected }, () => {
      console.log('[Background] Products stored, navigating to first page before opening Bayesian selection');

      // Click on page 1 button before opening the Bayesian selection page
      if (crawlTabId) {
        chrome.scripting.executeScript({
          target: { tabId: crawlTabId },
          func: () => {
            // Find and click the "1" page button in Amazon pagination
            // Primary selector: the exact button class used by Amazon
            const pageOneButton = document.querySelector('a.s-pagination-button[aria-label="Ir a la página 1"]') ||
                                  document.querySelector('a.s-pagination-button[aria-label="Go to page 1"]') ||
                                  document.querySelector('a.s-pagination-item.s-pagination-button');

            if (pageOneButton) {
              pageOneButton.click();
              console.log('[Content] Clicked on page 1 button');
              return true;
            }

            // Fallback: search through all pagination buttons for one with text "1"
            const allPaginationLinks = document.querySelectorAll('a.s-pagination-item, a.s-pagination-button');
            for (const link of allPaginationLinks) {
              if (link.textContent.trim() === '1') {
                link.click();
                console.log('[Content] Clicked on page 1 button (fallback)');
                return true;
              }
            }

            console.log('[Content] Page 1 button not found');
            return false;
          }
        }).then(() => {
          console.log('[Background] Navigated to page 1, now opening Bayesian selection page');

          // Small delay to let the page start loading, then open Bayesian selection
          setTimeout(() => {
            chrome.tabs.create({
              url: chrome.runtime.getURL('bayes_selection.html'),
              active: true
            }, (tab) => {
              console.log(`[Background] Bayesian selection page opened in tab ${tab.id}`);
            });
          }, 500);
        }).catch((error) => {
          console.error('[Background] Error clicking page 1:', error);
          // Still open Bayesian selection page even if clicking failed
          chrome.tabs.create({
            url: chrome.runtime.getURL('bayes_selection.html'),
            active: true
          }, (tab) => {
            console.log(`[Background] Bayesian selection page opened in tab ${tab.id}`);
          });
        });
      } else {
        // No tab ID stored, just open Bayesian selection page
        chrome.tabs.create({
          url: chrome.runtime.getURL('bayes_selection.html'),
          active: true
        }, (tab) => {
          console.log(`[Background] Bayesian selection page opened in tab ${tab.id}`);
        });
      }
    });
    
  } catch (error) {
    console.error('[Background] Error during finish process:', error);
    const errorMsg = error.message || 'Error inesperado durante la extracción';
    
    showProgressNotification('error', { error: errorMsg });
    
    // Send error to popup (if open)
    chrome.runtime.sendMessage({
      action: 'exportError',
      error: errorMsg
    }).catch(() => {
      // Popup might not be open, ignore errors
    });
  }
}

