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

// Function to detect maximum pages from Amazon pagination
function detectMaxPages() {
  // Try different pagination selectors
  const paginationSelectors = [
    '.s-pagination-container .s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous)',
    'ul.a-pagination li:not(.a-last):not(.a-selected) a',
    'span.s-pagination-strip a:not(.s-pagination-next)'
  ];
  
  let maxPage = 1;
  
  for (const selector of paginationSelectors) {
    const pageElements = document.querySelectorAll(selector);
    if (pageElements.length > 0) {
      // Get all page numbers
      const pageNumbers = Array.from(pageElements).map(el => {
        const text = el.textContent.trim();
        const num = parseInt(text, 10);
        return isNaN(num) ? 0 : num;
      }).filter(num => num > 0);
      
      if (pageNumbers.length > 0) {
        maxPage = Math.max(...pageNumbers);
        break;
      }
    }
  }
  
  // Also check for "disabled" next button which might indicate last page
  const disabledNext = document.querySelector('.s-pagination-next.s-pagination-disabled, .a-last.a-disabled');
  if (disabledNext) {
    // We're on the last page, check current page number
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
    const maxPages = detectMaxPages();
    sendResponse({ maxPages });
    return true;
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
    bayescore: calculateBayesScore(product.rating, product.reviews, C, m)
  }));

  // Sort by product name
  products.sort((a, b) => a.title.localeCompare(b.title));

  sendResponse({ products });
  return true; // Keep async response handling
});