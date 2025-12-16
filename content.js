// content.js

// Import Bayes utilities
function calcBayesParams(products) {
  const ratings = products.map(p => parseFloat(p.rating) || 0);
  const counts = products.map(p => parseInt(p.reviews, 10) || 0);
  const C = ratings.reduce((a, b) => a + b, 0) / (ratings.length || 1);
  const m = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
  return { C, m };
}

function calculateBayesScore(rating, reviews, C, m) {
  const R = parseFloat(rating) || 0;
  const v = parseInt(reviews, 10) || 0;
  return ((v / (v + m)) * R + (m / (v + m)) * C).toFixed(3);
}

// Function to detect maximum pages from Amazon pagination with DOM waiting
async function detectMaxPages() {
  // Try immediate detection first
  let maxPage = detectMaxPagesSync();

  // If pagination found, return immediately
  if (maxPage > 1) {
    console.log(`[Content] Pagination detected immediately: ${maxPage} pages`);
    return maxPage;
  }

  // Otherwise, wait for pagination to load (up to 2 seconds)
  console.log('[Content] Pagination not found, waiting for dynamic content...');
  maxPage = await waitForPagination(2000);

  console.log(`[Content] Final detection result: ${maxPage} pages`);
  return maxPage;
}

// Wait for pagination to appear in DOM
function waitForPagination(timeout = 2000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = 200; // ms

    // Periodic check for pagination
    const intervalId = setInterval(() => {
      const maxPage = detectMaxPagesSync();

      // If found pagination, resolve immediately
      if (maxPage > 1) {
        clearInterval(intervalId);
        observer.disconnect();
        resolve(maxPage);
        return;
      }

      // If timeout reached, resolve with current value
      if (Date.now() - startTime >= timeout) {
        clearInterval(intervalId);
        observer.disconnect();
        console.log('[Content] Pagination detection timeout');
        resolve(maxPage);
      }
    }, checkInterval);

    // Also use MutationObserver for faster detection
    const observer = new MutationObserver(() => {
      const maxPage = detectMaxPagesSync();
      if (maxPage > 1) {
        clearInterval(intervalId);
        observer.disconnect();
        console.log('[Content] Pagination detected via MutationObserver');
        resolve(maxPage);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

// Synchronous pagination detection (immediate DOM check)
function detectMaxPagesSync() {
  let maxPage = 1;

  // Strategy 1: Look for the disabled span showing max page (e.g., "7" at the end)
  // This is typically: <span class="s-pagination-item s-pagination-disabled">7</span>
  const disabledPageSpan = document.querySelector(
    '.s-pagination-strip > span.s-pagination-item.s-pagination-disabled:not(.s-pagination-ellipsis)'
  );
  if (disabledPageSpan) {
    const num = parseInt(disabledPageSpan.textContent.trim(), 10);
    if (!isNaN(num) && num > 0) {
      maxPage = Math.max(maxPage, num);
    }
  }

  // Strategy 2: Check all pagination items (selected, buttons, disabled)
  const paginationSelectors = [
    // Selected page
    '.s-pagination-container .s-pagination-selected',
    // Page number buttons (links)
    '.s-pagination-container .s-pagination-button',
    // All pagination items except next/previous/ellipsis
    '.s-pagination-container .s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous):not(.s-pagination-ellipsis)',
    // Legacy Amazon pagination
    'ul.a-pagination li a',
    'ul.a-pagination li.a-selected'
  ];

  for (const selector of paginationSelectors) {
    const pageElements = document.querySelectorAll(selector);
    if (pageElements.length > 0) {
      const pageNumbers = Array.from(pageElements).map(el => {
        const text = el.textContent.trim();
        // Only parse if it looks like a number (avoid "Siguiente", "Anterior", etc.)
        if (/^\d+$/.test(text)) {
          return parseInt(text, 10);
        }
        return 0;
      }).filter(num => num > 0);

      if (pageNumbers.length > 0) {
        maxPage = Math.max(maxPage, ...pageNumbers);
      }
    }
  }

  // Strategy 3: If on last page, check current selected page
  const disabledNext = document.querySelector('.s-pagination-next.s-pagination-disabled, .a-last.a-disabled');
  if (disabledNext) {
    const currentPageEl = document.querySelector('.s-pagination-selected, .a-selected');
    if (currentPageEl) {
      const currentPage = parseInt(currentPageEl.textContent.trim(), 10);
      if (!isNaN(currentPage)) {
        maxPage = Math.max(maxPage, currentPage);
      }
    }
  }

  return maxPage;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "detectMaxPages") {
    // Handle async detection
    detectMaxPages().then(maxPages => {
      sendResponse({ maxPages });
    }).catch(error => {
      console.error('[Content] Error detecting max pages:', error);
      sendResponse({ maxPages: 1 });
    });
    return true; // Keep channel open for async response
  }

  if (request.action !== "export") return true;

  // Use shared product extractor utility
  const productsArray = ProductExtractor.collectAllProducts(document);

  // Calculate Bayes scores
  const { C, m } = calcBayesParams(productsArray);
  
  // Add Bayes score to each product
  const products = productsArray.map(product => ({
    title: product.name, // Keep as 'title' for backward compatibility
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
    hasSubscribeSave: product.hasSubscribeSave,
    bayescore: calculateBayesScore(product.rating, product.reviews, C, m)
  }));

  // Sort by product name
  products.sort((a, b) => a.title.localeCompare(b.title));

  sendResponse({ products });
  return true; // Keep async response handling
});