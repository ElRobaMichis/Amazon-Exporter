// productExtractor.js - Shared product extraction utility

const ProductExtractor = {
  // Helper function to extract product name from various sources
  extractProductName(container) {
    // Look for the title container that may have brand and product name separated
    const titleSection = container.querySelector('div[data-cy="title-recipe"], .s-title-instructions-style');
    
    if (titleSection) {
      // Extract brand name from the first H2/span
      let brand = '';
      const brandElement = titleSection.querySelector('h2 span.a-color-base');
      if (brandElement && !brandElement.closest('a')) {
        brand = brandElement.textContent.trim();
      }
      
      // Extract product name from the link
      const productLink = titleSection.querySelector('a h2');
      if (productLink) {
        // Try aria-label first as it usually has the complete name
        const ariaLabel = productLink.getAttribute('aria-label');
        if (ariaLabel) {
          // If we have a brand and it's not already in the aria-label, prepend it
          if (brand && !ariaLabel.toLowerCase().includes(brand.toLowerCase())) {
            return `${brand} - ${ariaLabel.trim()}`;
          }
          return ariaLabel.trim();
        }
        
        // Otherwise use the visible text
        const productText = productLink.textContent.trim();
        if (productText && brand && !productText.toLowerCase().includes(brand.toLowerCase())) {
          return `${brand} - ${productText}`;
        }
        return productText || '';
      }
    }
    
    // Fallback to original logic for other HTML structures
    const h2 = container.querySelector('h2');
    if (h2) {
      // Priority 1: title attribute of link
      const link = h2.querySelector('a');
      if (link?.title) return link.title.trim();
      
      // Priority 2: aria-label attribute
      if (link?.getAttribute('aria-label')) return link.getAttribute('aria-label').trim();
      
      // Priority 3: visible text content
      const textContent = h2.textContent.trim();
      if (textContent) return textContent;
    }
    
    return null;
  },

  // Helper function to validate product names
  isValidProductName(name) {
    if (!name || name.length < 10) return false;
    
    // Filter out prices
    if (/^[$€£¥₹]\s*[\d,]+/.test(name) || /^\d+[.,]\d+$/.test(name)) return false;
    
    // Comprehensive list of UI elements to exclude
    const excludePatterns = [
      // Navigation and UI
      /^(add to cart|añadir al carrito|agregar al carrito)/i,
      /^(buy now|comprar ahora)/i,
      /^(next page|página siguiente|siguiente)/i,
      /^(previous page|página anterior|anterior)/i,
      /^(see more|ver más)/i,
      /^(show results|mostrar resultados)/i,
      /^(sort by|ordenar por)/i,
      /^(filter by|filtrar por)/i,
      /^(back to top|volver arriba)/i,
      /^(go to page|ir a la página)/i,
      /^página \d+/i,
      /^page \d+/i,
      
      // Account and store
      /^(visit the|visita la tienda)/i,
      /^(hello|hola)/i,
      /^(sign in|iniciar sesión)/i,
      /^(create account|crear cuenta)/i,
      /^(shop at the store|compra en la store)/i,
      /^(visit the store|visita la tienda)/i,
      
      // Reviews and ratings
      /^(customer reviews|opiniones de clientes)/i,
      /^\d+\.?\d* out of \d+ stars/i,
      /^\d+\.?\d* de \d+ estrellas/i,
      /^estrellas/i,
      /^stars/i,
      
      // Shipping and deals
      /^(free shipping|envío gratis)/i,
      /^(prime|amazon prime)/i,
      /^(sponsored|patrocinado|publicidad|promoted)/i,
      /^(best seller|más vendido)/i,
      /^(amazon's choice|amazon choice)/i,
      /^(limited time deal|oferta por tiempo limitado)/i,
      /^(lightning deal|oferta relámpago)/i,
      /^(subscribe & save|suscríbete y ahorra)/i,
      /^(prime eligible|elegible para prime)/i,
      
      // Price related
      /^precio/i,
      /^price/i,
      /lista:/i,
      /^el precio era/i,
      /^the price was/i,
      
      // Search and recommendations
      /búsquedas relacionadas/i,
      /related searches/i,
      /más resultados/i,
      /more results/i,
      /^recomendado/i,
      /^recommended/i,
      /tu historial/i,
      /your history/i,
      
      // Options and information
      /ver opciones/i,
      /see options/i,
      /necesitas ayuda/i,
      /need help/i,
      /métodos/i,
      /methods/i,
      /información de/i,
      /information/i,
      
      // From patterns
      /^de [^"]+\"?\./i,
      /^from [^"]+\"?\./i
    ];
    
    return !excludePatterns.some(pattern => pattern.test(name));
  },

  // Helper function to clean product name
  cleanProductName(name) {
    if (!name) return '';
    
    // Remove sponsored labels in multiple languages and formats
    name = name.replace(/^(Anuncio\s+)?patrocinado\s*[-:]?\s*/i, '');
    name = name.replace(/^Sponsored\s*[-:]?\s*/i, '');
    name = name.replace(/^Publicidad\s*[-:]?\s*/i, '');
    name = name.replace(/^Promoted\s*[-:]?\s*/i, '');
    
    // Remove sponsored labels at the end too
    name = name.replace(/\s*[-:]?\s*(Sponsored|Patrocinado|Publicidad|Promoted)$/gi, '');
    
    // Remove Amazon category suffixes
    name = name.replace(/\s*:\s*Amazon\.(com\.?)?\w+\s*:\s*\w+$/i, '');
    
    // Remove leading brackets
    name = name.replace(/^[\[\]()]+/, '');
    
    // Remove trailing ellipsis
    name = name.replace(/\.{3,}$/, '');
    
    // Remove brackets with single words (often category markers)
    name = name.replace(/\s*\[[^\]]+\]\s*$/g, '');
    
    // Normalize whitespace
    name = name.replace(/\s+/g, ' ').trim();
    
    // Fix capitalization for ALL CAPS words at the beginning
    name = name.replace(/^([A-Z]{2,})(\s+)/, (match, word, space) => {
      // Convert to title case (first letter uppercase, rest lowercase)
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + space;
    });
    
    return name;
  },

  // Helper function to extract product data from container
  extractProductData(container) {
    const name = this.extractProductName(container);
    if (!name || !this.isValidProductName(name)) return null;

    // Extract rating
    const ratingEl = container.querySelector('i span.a-icon-alt');
    let rating = "0";
    if (ratingEl) {
      const ratingText = ratingEl.textContent.trim();
      // Handle both "4.5 out of 5 stars" and "4,5 de 5 estrellas" formats
      const ratingMatch = ratingText.match(/^([\d.,]+)/);
      if (ratingMatch) {
        rating = ratingMatch[1].replace(',', '.');
      }
    }

    // Extract reviews count
    const reviewsEl = container.querySelector('a[href*="#customerReviews"] span, span[aria-label*="rating"], span[aria-label*="calificaci"]');
    let reviews = "0";
    if (reviewsEl) {
      const reviewsText = reviewsEl.textContent || reviewsEl.getAttribute('aria-label') || '';
      // Extract number with k/K multiplier support
      const reviewsMatch = reviewsText.match(/([\d.,]+)\s*[kK]?/);
      if (reviewsMatch) {
        let numStr = reviewsMatch[1];
        
        // Handle different decimal separators: if there's a k/K, treat comma as decimal
        if (/[kK]/.test(reviewsText)) {
          // For k format: "1,2k" means 1.2k = 1200, "1.2k" means 1.2k = 1200  
          numStr = numStr.replace(',', '.');
          let numValue = parseFloat(numStr);
          numValue = Math.round(numValue * 1000);
          reviews = numValue.toString();
        } else {
          // For regular numbers: "1,234" means 1234 (comma as thousands separator)
          numStr = numStr.replace(/,/g, '');
          reviews = numStr;
        }
      }
    }

    // Extract price
    const priceEl = container.querySelector('span.a-price span.a-offscreen, span.a-price-whole');
    let price = "0";
    if (priceEl) {
      const priceText = priceEl.textContent.trim();
      // Extract numeric value, handling different currency formats
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        price = priceMatch[0].replace(/,/g, '');
      }
    }

    return {
      name: this.cleanProductName(name),
      rating,
      reviews,
      price
    };
  },

  // Collect all products using multiple strategies
  collectAllProducts(document) {
    const allProductData = new Map(); // Use Map to avoid duplicates by name

    // Strategy 1: Find products using data-component-type
    const searchResults = document.querySelectorAll('[data-component-type="s-search-result"]');
    searchResults.forEach(container => {
      const data = this.extractProductData(container);
      if (data) {
        allProductData.set(data.name, data);
      }
    });

    // Strategy 2: Find products using data-asin
    const asinElements = document.querySelectorAll('[data-asin]:not([data-asin=""])');
    asinElements.forEach(container => {
      // Skip if already found in strategy 1
      if (container.hasAttribute('data-component-type') && 
          container.getAttribute('data-component-type') === 's-search-result') {
        return;
      }
      
      const data = this.extractProductData(container);
      if (data && !allProductData.has(data.name)) {
        allProductData.set(data.name, data);
      }
    });

    // Strategy 3: Extract from image alt texts (for names only, then find the container)
    const productImages = document.querySelectorAll('[data-component-type="s-search-result"] img[alt], [data-asin] img[alt]');
    productImages.forEach(img => {
      const altText = img.alt.trim();
      const cleanedAlt = this.cleanProductName(altText);
      
      if (cleanedAlt && this.isValidProductName(cleanedAlt)) {
        // Enhanced duplicate detection
        const isDuplicate = Array.from(allProductData.keys()).some(existing => {
          const shortExisting = existing.substring(0, 30).toLowerCase();
          const shortAlt = cleanedAlt.substring(0, 30).toLowerCase();
          return existing.toLowerCase().includes(shortAlt) || 
                 cleanedAlt.toLowerCase().includes(shortExisting);
        });
        
        if (!isDuplicate) {
          // Try to find the parent container with product data
          let container = img.closest('[data-component-type="s-search-result"]') || 
                         img.closest('[data-asin]');
          
          if (container) {
            const data = this.extractProductData(container);
            if (data) {
              // Use the alt text as the name if it's more complete
              if (cleanedAlt.length > data.name.length) {
                data.name = cleanedAlt;
              }
              allProductData.set(data.name, data);
            }
          } else {
            // If no container found, add with default values
            allProductData.set(cleanedAlt, {
              name: cleanedAlt,
              rating: "0",
              reviews: "0",
              price: "0"
            });
          }
        }
      }
    });

    // Convert Map to array
    return Array.from(allProductData.values());
  },

  // Simple extraction for background.js (single strategy)
  extractSimpleProducts(document) {
    const items = Array.from(
      document.querySelectorAll('div.s-main-slot [data-component-type="s-search-result"]')
    );
    
    return items.map(el => {
      const data = this.extractProductData(el);
      if (!data) return null;
      
      // For backward compatibility with background.js format
      const img = el.querySelector('img.s-image');
      const rawAlt = (img?.alt || '').replace(/^Anuncio patrocinado:\s*/i, '').trim();
      const description = rawAlt.startsWith(data.name) && rawAlt !== data.name
        ? rawAlt.slice(data.name.length).trim()
        : 'No aplica';
      
      return {
        title: data.name,
        description,
        rating: data.rating,
        reviews: data.reviews,
        price: data.price
      };
    }).filter(Boolean);
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductExtractor;
} else if (typeof window !== 'undefined') {
  // Browser environment
  window.ProductExtractor = ProductExtractor;
} else {
  // Service worker environment
  self.ProductExtractor = ProductExtractor;
}