// bayes_selection.js - Handles Bayesian score selection after multi-page extraction

let extractedProducts = [];
let productStats = {};

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);

document.addEventListener('DOMContentLoaded', () => {
  // Load product data from storage
  chrome.storage.local.get(['extractedProducts'], (result) => {
    if (result.extractedProducts) {
      extractedProducts = result.extractedProducts;
      calculateAndDisplayStats();
      setupEventListeners();
    } else {
      alert('No se encontraron productos extraídos.');
      window.close();
    }
  });
});

function calculateAndDisplayStats() {
  if (!extractedProducts.length) return;
  
  const reviews = extractedProducts.map(p => parseInt(p.reviews, 10) || 0);
  const ratings = extractedProducts.map(p => parseFloat(p.rating) || 0);
  
  productStats = {
    total: extractedProducts.length,
    minReviews: Math.min(...reviews.filter(r => r > 0)),
    maxReviews: Math.max(...reviews),
    avgReviews: Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length),
    avgRating: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
  };
  
  // Display stats
  document.getElementById('totalProducts').textContent = productStats.total;
  document.getElementById('minReviews').textContent = productStats.minReviews || 'N/A';
  document.getElementById('maxReviews').textContent = productStats.maxReviews;
  document.getElementById('avgReviews').textContent = productStats.avgReviews;
  document.getElementById('avgRating').textContent = productStats.avgRating;
  
  // Update custom inputs with calculated values
  document.getElementById('customC').value = productStats.avgRating;
  document.getElementById('customM').value = productStats.avgReviews;
}

function setupEventListeners() {
  // Radio button selection highlighting
  document.querySelectorAll('input[name="bayesMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      // Remove selected class from all labels
      document.querySelectorAll('label').forEach(label => {
        label.classList.remove('selected');
      });
      
      // Add selected class to current label
      e.target.closest('label').classList.add('selected');
      
      // Show/hide custom inputs
      const customInputs = document.getElementById('customBayesInputs');
      customInputs.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
  });
  
  // Initial selection highlighting
  document.querySelector('input[name="bayesMethod"]:checked').closest('label').classList.add('selected');
  
  // Apply button
  document.getElementById('applyBayes').addEventListener('click', () => {
    const method = document.querySelector('input[name="bayesMethod"]:checked').value;
    applyBayesianScore(method);
  });
  
  // Cancel button
  document.getElementById('cancelBayes').addEventListener('click', () => {
    // Clean up storage
    chrome.storage.local.remove(['extractedProducts']);
    window.close();
  });
}

function applyBayesianScore(method) {
  if (!extractedProducts.length) return;
  
  let bayesParams = {};
  
  switch (method) {
    case 'min':
      const minRating = Math.min(...extractedProducts.map(p => parseFloat(p.rating) || 0));
      bayesParams = { 
        C: minRating || 1.0, 
        m: productStats.minReviews || 10 
      };
      break;
      
    case 'high':
      const maxRating = Math.max(...extractedProducts.map(p => parseFloat(p.rating) || 0));
      bayesParams = { 
        C: maxRating || 5.0, 
        m: productStats.maxReviews || 1000 
      };
      break;
      
    case 'custom':
      const customC = parseFloat(document.getElementById('customC').value) || 3.0;
      const customM = parseInt(document.getElementById('customM').value) || 100;
      bayesParams = { C: customC, m: customM };
      break;
      
    case 'average':
    default:
      bayesParams = bayesUtils.calcParams(extractedProducts);
      break;
  }
  
  console.log(`Applying Bayesian scores with method: ${method}`, bayesParams);
  
  // Apply Bayesian scores
  bayesUtils.addBayesScoreWithParams(extractedProducts, bayesParams);
  
  // Deduplicate and export
  const unique = csvUtils.deduplicate(extractedProducts);
  console.log(`After deduplication: ${unique.length} unique products`);
  
  const csv = csvUtils.toCsv(unique);
  downloadUtils.downloadCsv(csv, 'amazon_all_products.csv');
  
  // Clean up storage
  chrome.storage.local.remove(['extractedProducts']);
  
  // Close window
  setTimeout(() => {
    window.close();
  }, 500);
}