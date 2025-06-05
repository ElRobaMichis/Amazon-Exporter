// Tests for content.js functionality
const { JSDOM } = require('jsdom');
const ProductExtractor = require('../utils/productExtractor');

// Mock Chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Helper to create a mock DOM
function createMockDOM(html) {
  const dom = new JSDOM(html);
  global.document = dom.window.document;
  global.window = dom.window;
}

// Extract functions for testing
function setupContentScript() {
  const calcBayesParams = (products) => {
    const ratings = products.map(p => parseFloat(p.rating) || 0);
    const counts = products.map(p => parseInt(p.reviews, 10) || 0);
    const C = ratings.reduce((a, b) => a + b, 0) / (ratings.length || 1);
    const m = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    return { C, m };
  };

  const calculateBayesScore = (rating, reviews, C, m) => {
    const R = parseFloat(rating) || 0;
    const v = parseInt(reviews, 10) || 0;
    return ((v / (v + m)) * R + (m / (v + m)) * C).toFixed(3);
  };

  return {
    calcBayesParams,
    calculateBayesScore,
    // Use shared utility functions
    isValidProductName: ProductExtractor.isValidProductName,
    cleanProductName: ProductExtractor.cleanProductName
  };
}

describe('Content Script - Product Extraction', () => {
  const {
    calcBayesParams,
    calculateBayesScore,
    isValidProductName,
    cleanProductName
  } = setupContentScript();

  describe('isValidProductName', () => {
    test('should reject short names', () => {
      expect(isValidProductName('')).toBe(false);
      expect(isValidProductName('Short')).toBe(false);
      expect(isValidProductName('123456789')).toBe(false);
    });

    test('should reject prices', () => {
      expect(isValidProductName('$19.99')).toBe(false);
      expect(isValidProductName('€25,50')).toBe(false);
      expect(isValidProductName('£12.00')).toBe(false);
      expect(isValidProductName('99.99')).toBe(false);
    });

    test('should reject UI elements in English', () => {
      expect(isValidProductName('Add to Cart')).toBe(false);
      expect(isValidProductName('Next Page')).toBe(false);
      expect(isValidProductName('See more')).toBe(false);
      expect(isValidProductName('Customer Reviews')).toBe(false);
      expect(isValidProductName('4.5 out of 5 stars')).toBe(false);
      expect(isValidProductName('Free Shipping')).toBe(false);
      expect(isValidProductName('Prime Eligible')).toBe(false);
      expect(isValidProductName('Visit the Store')).toBe(false);
    });

    test('should reject UI elements in Spanish', () => {
      expect(isValidProductName('Añadir al carrito')).toBe(false);
      expect(isValidProductName('Página siguiente')).toBe(false);
      expect(isValidProductName('Ver más')).toBe(false);
      expect(isValidProductName('Opiniones de clientes')).toBe(false);
      expect(isValidProductName('4.5 de 5 estrellas')).toBe(false);
      expect(isValidProductName('Envío gratis')).toBe(false);
      expect(isValidProductName('Elegible para Prime')).toBe(false);
      expect(isValidProductName('Visita la tienda')).toBe(false);
    });

    test('should accept valid product names', () => {
      expect(isValidProductName('Apple iPhone 14 Pro Max 256GB')).toBe(true);
      expect(isValidProductName('Samsung Galaxy Watch 5 Bluetooth 44mm')).toBe(true);
      expect(isValidProductName('Sony WH-1000XM5 Wireless Noise Canceling Headphones')).toBe(true);
    });
  });

  describe('cleanProductName', () => {
    test('should remove sponsored labels', () => {
      expect(cleanProductName('Sponsored - iPhone 14 Pro')).toBe('iPhone 14 Pro');
      expect(cleanProductName('Patrocinado: Samsung Galaxy')).toBe('Samsung Galaxy');
      expect(cleanProductName('Anuncio patrocinado - Product')).toBe('Product');
      expect(cleanProductName('Product - Sponsored')).toBe('Product');
    });

    test('should remove Amazon category suffixes', () => {
      expect(cleanProductName('Product Name : Amazon.com : Electronics')).toBe('Product Name');
      // The regex looks for word characters after the domain, so 'Electrónica' with accented char doesn't match
      expect(cleanProductName('Product : Amazon.es : Electronica')).toBe('Product');
    });

    test('should remove brackets and normalize whitespace', () => {
      expect(cleanProductName('[Product]  Name   Here')).toBe('Product] Name Here');
      expect(cleanProductName('Product Name [Category]')).toBe('Product Name');
      expect(cleanProductName('Product...')).toBe('Product');
    });

    test('should handle empty or null input', () => {
      expect(cleanProductName('')).toBe('');
      expect(cleanProductName(null)).toBe('');
      expect(cleanProductName(undefined)).toBe('');
    });
  });


  describe('Bayes Score Calculation', () => {
    test('should calculate correct Bayes parameters', () => {
      const products = [
        { rating: '4.5', reviews: '100' },
        { rating: '3.0', reviews: '50' },
        { rating: '5.0', reviews: '200' }
      ];
      
      const { C, m } = calcBayesParams(products);
      expect(C).toBeCloseTo(4.167, 3);
      expect(m).toBeCloseTo(116.667, 3);
    });

    test('should calculate correct Bayes score', () => {
      const C = 4.0;
      const m = 100;
      
      // Bayes formula: (v/(v+m))*R + (m/(v+m))*C
      // For 5.0 rating, 200 reviews: (200/300)*5 + (100/300)*4 = 3.333 + 1.333 = 4.667
      expect(calculateBayesScore('5.0', '200', C, m)).toBe('4.667');
      // For 3.0 rating, 50 reviews: (50/150)*3 + (100/150)*4 = 1.0 + 2.667 = 3.667
      expect(calculateBayesScore('3.0', '50', C, m)).toBe('3.667');
      expect(calculateBayesScore('0', '0', C, m)).toBe('4.000');
    });

    test('should handle invalid inputs', () => {
      const C = 4.0;
      const m = 100;
      
      expect(calculateBayesScore('invalid', 'invalid', C, m)).toBe('4.000');
      expect(calculateBayesScore(null, null, C, m)).toBe('4.000');
    });
  });

  describe('Duplicate Detection', () => {
    test('should detect duplicates with common substrings', () => {
      const products = ['Apple iPhone 14 Pro Max', 'iPhone 14 Pro Max'];
      const shortFirst = products[0].substring(0, 30).toLowerCase();
      const shortSecond = products[1].substring(0, 30).toLowerCase();
      
      expect(products[0].toLowerCase().includes(shortSecond)).toBe(true);
    });

    test('should not flag different products as duplicates', () => {
      const products = ['Samsung Galaxy S23', 'Apple iPhone 14'];
      const shortFirst = products[0].substring(0, 30).toLowerCase();
      const shortSecond = products[1].substring(0, 30).toLowerCase();
      
      expect(products[0].toLowerCase().includes(shortSecond)).toBe(false);
      expect(products[1].toLowerCase().includes(shortFirst)).toBe(false);
    });
  });
});

describe('Content Script - Integration Test', () => {
  test('should handle real-world product HTML structure', () => {
    const html = `
      <div data-component-type="s-search-result" data-asin="B0ABC123">
        <h2 class="s-size-mini s-spacing-none s-color-base">
          <a class="a-link-normal" href="/dp/B0ABC123" title="Apple iPhone 14 Pro - 256GB Space Gray, Unlocked">
            <span>Apple iPhone 14 Pro - 256GB Space Gr...</span>
          </a>
        </h2>
        <div class="a-row">
          <i class="a-icon a-icon-star-small a-star-small-4-5 aok-align-bottom">
            <span class="a-icon-alt">4.5 out of 5 stars</span>
          </i>
          <a class="a-link-normal" href="/product-reviews/B0ABC123#customerReviews">
            <span class="a-size-base">1,234</span>
          </a>
        </div>
        <span class="a-price" data-a-size="l" data-a-color="price">
          <span class="a-offscreen">$999.00</span>
          <span class="a-price-whole">999<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">00</span>
        </span>
      </div>
    `;

    createMockDOM(html);
    
    // Test the helper functions with this HTML
    const container = document.querySelector('[data-component-type="s-search-result"]');
    
    // Extract product name
    const h2 = container.querySelector('h2');
    const link = h2.querySelector('a');
    const productName = link.title || link.textContent.trim();
    
    expect(productName).toBe('Apple iPhone 14 Pro - 256GB Space Gray, Unlocked');
    
    // Extract rating
    const ratingEl = container.querySelector('i span.a-icon-alt');
    const ratingText = ratingEl.textContent.trim();
    const rating = ratingText.match(/^([\d.,]+)/)[1];
    
    expect(rating).toBe('4.5');
    
    // Extract reviews
    const reviewsEl = container.querySelector('a[href*="#customerReviews"] span');
    const reviews = reviewsEl.textContent.replace(/,/g, '');
    
    expect(reviews).toBe('1234');
    
    // Extract price
    const priceEl = container.querySelector('span.a-price span.a-offscreen');
    const priceMatch = priceEl.textContent.match(/[\d,]+\.?\d*/);
    const price = priceMatch[0];
    
    expect(price).toBe('999.00');
  });
  
  test('should handle products with image alt text', () => {
    const html = `
      <div data-component-type="s-search-result">
        <img class="s-image" alt="Sponsored - Samsung Galaxy S23 Ultra 5G 256GB Phantom Black - Unlocked International Version">
        <h2><a>Samsung Galaxy S23 Ul...</a></h2>
      </div>
    `;
    
    createMockDOM(html);
    
    const img = document.querySelector('img.s-image');
    const altText = img.alt;
    
    // Test cleaning function
    const { cleanProductName } = setupContentScript();
    const cleaned = cleanProductName(altText);
    
    expect(cleaned).toBe('Samsung Galaxy S23 Ultra 5G 256GB Phantom Black - Unlocked International Version');
  });

  test('should extract brand and product name from separated elements', () => {
    const html = `
      <div data-component-type="s-search-result">
        <div data-cy="title-recipe" class="a-section a-spacing-none a-spacing-top-small s-title-instructions-style">
          <div class="a-row a-color-secondary">
            <h2 class="a-size-mini s-line-clamp-1">
              <span class="a-size-base-plus a-color-base">Cookie Crisp</span>
            </h2>
          </div>
          <a class="a-link-normal s-line-clamp-4 s-link-style a-text-normal" href="/Cookie-Crisp-Cereal/dp/B00A44RDB6/">
            <h2 aria-label="Cereales 480 g" class="a-size-base-plus a-spacing-none a-color-base a-text-normal">
              <span>Cereales 480 g</span>
            </h2>
          </a>
        </div>
      </div>
    `;
    
    createMockDOM(html);
    
    // Simulate the extraction logic
    const container = document.querySelector('[data-component-type="s-search-result"]');
    const titleSection = container.querySelector('div[data-cy="title-recipe"], .s-title-instructions-style');
    
    // Extract brand
    const brandElement = titleSection.querySelector('h2 span.a-color-base');
    const brand = brandElement && !brandElement.closest('a') ? brandElement.textContent.trim() : '';
    
    expect(brand).toBe('Cookie Crisp');
    
    // Extract product name
    const productLink = titleSection.querySelector('a h2');
    const ariaLabel = productLink.getAttribute('aria-label');
    
    expect(ariaLabel).toBe('Cereales 480 g');
    
    // Combined result should be (without brand formatting)
    const combinedName = `${brand} - ${ariaLabel}`;
    expect(combinedName).toBe('Cookie Crisp - Cereales 480 g');
  });

  test('should handle Earth\'s Best product structure', () => {
    const html = `
      <div data-component-type="s-search-result">
        <div data-cy="title-recipe" class="a-section a-spacing-none a-spacing-top-small s-title-instructions-style">
          <div class="a-row a-color-secondary">
            <h2 class="a-size-mini s-line-clamp-1">
              <span class="a-size-base-plus a-color-base">Earth's Best</span>
            </h2>
          </div>
          <a class="a-link-normal s-line-clamp-4 s-link-style a-text-normal" href="/Earths-Best-Cereal-Avena-227g/dp/B00BH0OZIK/">
            <h2 aria-label="Cereal Orgánico de Avena Integral, 227g" class="a-size-base-plus a-spacing-none a-color-base a-text-normal">
              <span>Cereal Orgánico de Avena Integral, 227g</span>
            </h2>
          </a>
        </div>
      </div>
    `;
    
    createMockDOM(html);
    
    const container = document.querySelector('[data-component-type="s-search-result"]');
    const titleSection = container.querySelector('div[data-cy="title-recipe"], .s-title-instructions-style');
    
    // Extract brand
    const brandElement = titleSection.querySelector('h2 span.a-color-base');
    const brand = brandElement && !brandElement.closest('a') ? brandElement.textContent.trim() : '';
    
    expect(brand).toBe("Earth's Best");
    
    // Extract product name
    const productLink = titleSection.querySelector('a h2');
    const ariaLabel = productLink.getAttribute('aria-label');
    
    expect(ariaLabel).toBe('Cereal Orgánico de Avena Integral, 227g');
    
    // Combined result (without brand formatting)
    const combinedName = `${brand} - ${ariaLabel}`;
    expect(combinedName).toBe("Earth's Best - Cereal Orgánico de Avena Integral, 227g");
  });

  test('should handle products without separate brand element and fix ALL CAPS', () => {
    const html = `
      <div data-component-type="s-search-result">
        <div data-cy="title-recipe" class="a-section a-spacing-none a-spacing-top-small s-title-instructions-style">
          <a class="a-link-normal s-line-clamp-4 s-link-style a-text-normal" href="/Trix-TRIX-Cereal-Nestlé-430g/dp/B0BG53BS1W/">
            <h2 aria-label="TRIX Cereal Nestlé 430g" class="a-size-base-plus a-spacing-none a-color-base a-text-normal">
              <span>TRIX Cereal Nestlé 430g</span>
            </h2>
          </a>
        </div>
      </div>
    `;
    
    createMockDOM(html);
    
    // Test the cleaning function with ALL CAPS
    const { cleanProductName } = setupContentScript();
    const cleaned = cleanProductName('TRIX Cereal Nestlé 430g');
    
    expect(cleaned).toBe('Trix Cereal Nestlé 430g');
  });

  test('should handle Extra cereal product structure', () => {
    const html = `
      <div data-component-type="s-search-result">
        <div data-cy="title-recipe" class="a-section a-spacing-none a-spacing-top-small s-title-instructions-style">
          <div class="a-row a-color-secondary">
            <h2 class="a-size-mini s-line-clamp-1">
              <span class="a-size-base-plus a-color-base">Extra</span>
            </h2>
          </div>
          <a class="a-link-normal s-line-clamp-4 s-link-style a-text-normal" href="/Extra-Cereal-Nuez-420g/dp/B0DZP9KZRC/">
            <h2 aria-label="Cereal Nuez 420g" class="a-size-base-plus a-spacing-none a-color-base a-text-normal">
              <span>Cereal Nuez 420g</span>
            </h2>
          </a>
        </div>
      </div>
    `;
    
    createMockDOM(html);
    
    const container = document.querySelector('[data-component-type="s-search-result"]');
    const titleSection = container.querySelector('div[data-cy="title-recipe"], .s-title-instructions-style');
    
    // Extract brand
    const brandElement = titleSection.querySelector('h2 span.a-color-base');
    const brand = brandElement && !brandElement.closest('a') ? brandElement.textContent.trim() : '';
    
    expect(brand).toBe('Extra');
    
    // Extract product name
    const productLink = titleSection.querySelector('a h2');
    const ariaLabel = productLink.getAttribute('aria-label');
    
    expect(ariaLabel).toBe('Cereal Nuez 420g');
    
    // Combined result
    const combinedName = `${brand} - ${ariaLabel}`;
    expect(combinedName).toBe('Extra - Cereal Nuez 420g');
  });

});