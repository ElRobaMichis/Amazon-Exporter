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

// === KEEP-ALIVE MECHANISM FOR MV3 SERVICE WORKER ===
let keepAliveInterval = null;
let crawlActive = false;

function startKeepAlive() {
  if (keepAliveInterval) return;

  crawlActive = true;

  // Chrome alarms API as backup keep-alive (minimum 0.5 minutes)
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

  // More aggressive keep-alive using setInterval
  // This pings chrome.runtime to keep the worker active
  keepAliveInterval = setInterval(() => {
    if (crawlActive) {
      chrome.runtime.getPlatformInfo(() => {
        console.log('[Background] Keep-alive ping at page', currentPageNumber);
      });
    }
  }, 25000); // Every 25 seconds (under 30s suspension threshold)

  console.log('[Background] Keep-alive started');
}

function stopKeepAlive() {
  crawlActive = false;
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  chrome.alarms.clear('keepAlive');
  console.log('[Background] Keep-alive stopped');
}

// Alarm listener as backup keep-alive
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && crawlActive) {
    console.log('[Background] Alarm keep-alive triggered at page', currentPageNumber);
  }
});

// === CRAWL STATE TRACKING FOR DEBUGGING ===
let crawlState = {
  startTime: null,
  lastPageTime: null,
  errors: [],
  pagesProcessed: 0,
  stopReason: null
};

function resetCrawlState() {
  crawlState = {
    startTime: Date.now(),
    lastPageTime: Date.now(),
    errors: [],
    pagesProcessed: 0,
    stopReason: null
  };
}

function logCrawlError(type, details) {
  const error = {
    type,
    details,
    timestamp: Date.now(),
    page: currentPageNumber,
    productsCollected: collected.length
  };
  crawlState.errors.push(error);
  console.error(`[Background] Crawl error (${type}):`, details);
}

// === CENTRALIZED LISTENER MANAGEMENT ===
let activeListeners = {
  onUpdated: null
};

function cleanupListeners() {
  if (activeListeners.onUpdated) {
    chrome.tabs.onUpdated.removeListener(activeListeners.onUpdated);
    activeListeners.onUpdated = null;
    console.log('[Background] Cleaned up onUpdated listener');
  }
}

// === WATCHDOG TIMER FOR STALL DETECTION ===
let watchdogTimer = null;
const WATCHDOG_TIMEOUT = 60000; // 60 seconds without progress = stalled

function resetWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
  }
  watchdogTimer = setTimeout(() => {
    if (crawlActive && !isDownloading) {
      console.error('[Background] WATCHDOG: Crawl appears stalled!');
      logCrawlError('watchdog_timeout', {
        lastPageTime: crawlState.lastPageTime,
        timeSinceLastPage: Date.now() - crawlState.lastPageTime,
        currentPage: currentPageNumber,
        productsCollected: collected.length
      });

      // Graceful shutdown with partial results
      crawlState.stopReason = 'watchdog_timeout';
      showProgressNotification('error', {
        error: `Extraccion detenida en pagina ${currentPageNumber}. ${collected.length} productos guardados.`
      });
      finishAndDownload();
    }
  }, WATCHDOG_TIMEOUT);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

// === PAGINATION CONFIGURATION WITH RETRY ===
const PAGINATION_CONFIG = {
  maxRetries: 3,
  retryDelays: [0, 500, 1000],
  selectors: [
    'a.s-pagination-next',
    'ul.a-pagination li.a-last a',
    'a[aria-label*="Next"]',
    'a[aria-label*="Siguiente"]',
    'a[aria-label*="next"]',
    'span.s-pagination-next:not(.s-pagination-disabled)',
    '.a-last a',
    'a.s-pagination-button[aria-label*="page"]',
    '.s-pagination-container a:last-child'
  ]
};

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
    crawlState.stopReason = 'user_cancelled';
    cleanupListeners();
    stopKeepAlive();
    stopWatchdog();
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

      // Reset crawl state for debugging
      resetCrawlState();

      // Start keep-alive to prevent service worker suspension
      startKeepAlive();

      // Start watchdog timer
      resetWatchdog();

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
          
          // Apply basic validation filtering
          const filtered = products.filter(product => {
            const title = product.title || '';

            // Validation for minimum length and quality
            if (title.length < 10) {
              console.log(`[Content] Filtering out short title: ${title}`);
              return false;
            }

            return true;
          });

          console.log(`[Content] After validation filtering: ${filtered.length} products (removed ${products.length - filtered.length} invalid)`);
          
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
        logCrawlError('extraction_runtime', chrome.runtime.lastError.message);
        crawlState.stopReason = 'extraction_runtime_error';
        finishAndDownload();
        return;
      }
      if (!res || !res[0] || !res[0].result) {
        console.error('[Background] No result from extraction script');
        logCrawlError('extraction_empty', 'No result from extraction script');
        crawlState.stopReason = 'extraction_empty';
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

      // Update crawl state and reset watchdog on successful page
      crawlState.pagesProcessed++;
      crawlState.lastPageTime = Date.now();
      resetWatchdog();

      chrome.scripting.executeScript({
        target: { tabId },
        func: (selectors) => {
          // Try each selector in order
          for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn) {
              // Check if it's disabled
              if (btn.classList.contains('s-pagination-disabled') ||
                  btn.classList.contains('a-disabled') ||
                  btn.hasAttribute('disabled')) {
                continue;
              }

              const href = btn.href || btn.getAttribute('href');
              if (href && href !== '#') {
                // Make relative URLs absolute
                if (!href.startsWith('http')) {
                  const currentUrl = new URL(window.location.href);
                  return new URL(href, currentUrl.origin).href;
                }
                return href;
              }
            }
          }

          // Fallback: find next page number link based on current page
          const currentPageEl = document.querySelector('.s-pagination-selected, .a-selected');
          if (currentPageEl) {
            const currentPage = parseInt(currentPageEl.textContent.trim(), 10);
            if (!isNaN(currentPage)) {
              const nextPageLink = document.querySelector(
                `a.s-pagination-button[aria-label*="${currentPage + 1}"], ` +
                `a[aria-label*="page ${currentPage + 1}"], ` +
                `a[aria-label*="página ${currentPage + 1}"]`
              );
              if (nextPageLink?.href) {
                return nextPageLink.href;
              }
            }
          }

          return null;
        },
        args: [PAGINATION_CONFIG.selectors]
      }).then(nextRes => {
        if (chrome.runtime.lastError) {
          logCrawlError('pagination_runtime', chrome.runtime.lastError.message);
          crawlState.stopReason = 'pagination_runtime_error';
          finishAndDownload();
          return;
        }
        if (!nextRes || !nextRes[0]) {
          logCrawlError('pagination_empty', 'No pagination result');
          crawlState.stopReason = 'pagination_empty';
          finishAndDownload();
          return;
        }
        const nextUrl = nextRes[0].result;
        if (nextUrl && pagesRemaining > 0 && !isCancelled) {
          chrome.tabs.update(tabId, { url: nextUrl }, () => {
            if (chrome.runtime.lastError) {
              logCrawlError('navigation_error', chrome.runtime.lastError.message);
              crawlState.stopReason = 'navigation_error';
              finishAndDownload();
              return;
            }

            // Clean up any existing listener first
            cleanupListeners();

            let navigationComplete = false;

            const listener = (updatedId, info) => {
              if (updatedId === tabId && info.status === 'complete' && !navigationComplete && !isCancelled) {
                navigationComplete = true;
                cleanupListeners();
                setTimeout(() => crawlPage(tabId), 1000);
              }
            };

            activeListeners.onUpdated = listener;
            chrome.tabs.onUpdated.addListener(listener);

            // Timeout fallback in case page doesn't load properly
            setTimeout(() => {
              if (!navigationComplete) {
                navigationComplete = true;
                cleanupListeners();
                console.log('[Background] Page load timeout, continuing anyway');
                crawlPage(tabId);
              }
            }, 10000);
          });
        } else {
          // Determine why we're stopping
          if (!nextUrl) {
            crawlState.stopReason = pagesRemaining > 0 ? 'no_next_page_found' : 'page_limit_reached';
          } else if (pagesRemaining <= 0) {
            crawlState.stopReason = 'page_limit_reached';
          } else if (isCancelled) {
            crawlState.stopReason = 'user_cancelled';
          }
          finishAndDownload();
        }
      }).catch(err => {
        logCrawlError('pagination_exception', err.message || String(err));
        crawlState.stopReason = 'pagination_exception';
        finishAndDownload();
      });
  }).catch(err => {
    logCrawlError('extraction_exception', err.message || String(err));
    crawlState.stopReason = 'extraction_exception';
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
  // Stop all timers and listeners first
  stopKeepAlive();
  cleanupListeners();
  stopWatchdog();

  if (isDownloading) {
    console.log('[Background] Download already in progress, skipping');
    return; // Prevent multiple downloads
  }
  isDownloading = true;

  // Log crawl summary
  const duration = Date.now() - (crawlState.startTime || Date.now());
  console.log('[Background] === CRAWL SUMMARY ===');
  console.log(`[Background] Duration: ${Math.round(duration / 1000)}s`);
  console.log(`[Background] Pages processed: ${crawlState.pagesProcessed}`);
  console.log(`[Background] Products collected: ${collected.length}`);
  console.log(`[Background] Stop reason: ${crawlState.stopReason || 'completed_normally'}`);
  console.log(`[Background] Errors: ${crawlState.errors.length}`);
  if (crawlState.errors.length > 0) {
    console.log('[Background] Error log:', crawlState.errors);
  }

  // Store debug info for later analysis
  chrome.storage.local.set({
    lastCrawlDebug: {
      ...crawlState,
      duration,
      totalProducts: collected.length,
      completedAt: Date.now()
    }
  });

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

