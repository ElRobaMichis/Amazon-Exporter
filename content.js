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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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