// Tests for ProductExtractor utility used by both content.js and background.js
const { JSDOM } = require('jsdom');
const ProductExtractor = require('../utils/productExtractor');

// Helper to create a mock DOM
function createMockDOM(html) {
  const dom = new JSDOM(html);
  global.document = dom.window.document;
  global.window = dom.window;
}

describe('ProductExtractor - Shared Utility', () => {
  describe('Enhanced Title Extraction', () => {
    test('should extract title using aria-label from separated brand structure', () => {
      const html = `
        <div data-component-type="s-search-result">
          <div data-cy="title-recipe" class="a-section a-spacing-none a-spacing-top-small s-title-instructions-style">
            <div class="a-row a-color-secondary">
              <h2 class="a-size-mini s-line-clamp-1">
                <span class="a-size-base-plus a-color-base">Apple</span>
              </h2>
            </div>
            <a class="a-link-normal s-line-clamp-4 s-link-style a-text-normal" href="/iPhone-14-Pro/dp/B0ABC123/">
              <h2 aria-label="iPhone 14 Pro 256GB Space Gray" class="a-size-base-plus a-spacing-none a-color-base a-text-normal">
                <span>iPhone 14 Pro 256GB Space...</span>
              </h2>
            </a>
          </div>
        </div>
      `;
      
      createMockDOM(html);
      const container = document.querySelector('[data-component-type="s-search-result"]');
      const productName = ProductExtractor.extractProductName(container);
      
      expect(productName).toBe('Apple - iPhone 14 Pro 256GB Space Gray');
    });

    test('should extract title using fallback methods', () => {
      const html = `
        <div data-component-type="s-search-result">
          <h2>
            <a title="Samsung Galaxy S23 Ultra 256GB Phantom Black">
              <span>Samsung Galaxy S23 Ul...</span>
            </a>
          </h2>
        </div>
      `;
      
      createMockDOM(html);
      const container = document.querySelector('[data-component-type="s-search-result"]');
      const productName = ProductExtractor.extractProductName(container);
      
      expect(productName).toBe('Samsung Galaxy S23 Ultra 256GB Phantom Black');
    });
  });

  describe('Product Data Extraction', () => {
    test('should extract complete product data with all fields', () => {
      const html = `
        <div data-component-type="s-search-result" data-asin="B0ABC123XY">
          <div class="s-product-image-container">
            <img class="s-image" src="https://m.media-amazon.com/images/I/test.jpg" alt="Sony WH-1000XM5" />
          </div>
          <h2>
            <a aria-label="Sony WH-1000XM5 Wireless Noise Canceling Headphones" href="/dp/B0ABC123XY">
              <span>Sony WH-1000XM5 Wireless...</span>
            </a>
          </h2>
          <div class="a-row">
            <i class="a-icon a-icon-star-small a-star-small-4-5">
              <span class="a-icon-alt">4.5 out of 5 stars</span>
            </i>
            <a href="/product-reviews/B0ABC123#customerReviews">
              <span>2,345</span>
            </a>
          </div>
          <span class="a-color-secondary">3k+ comprados el mes pasado</span>
          <div data-cy="price-recipe">
            <span class="a-price">
              <span class="a-offscreen">$399.99</span>
            </span>
            <span class="a-text-price" data-a-strike="true">
              <span class="a-offscreen">$499.99</span>
            </span>
            <span class="a-color-secondary">($0.50/ml)</span>
            <span class="a-color-secondary">$35.00 x 12 meses</span>
          </div>
          <i class="a-icon a-icon-prime" aria-label="Prime"></i>
          <div class="udm-primary-delivery-message">Entrega GRATIS mañana, 15 de dic</div>
          <span>Suma y Ahorra</span>
        </div>
      `;

      createMockDOM(html);
      const container = document.querySelector('[data-component-type="s-search-result"]');
      const productData = ProductExtractor.extractProductData(container);

      expect(productData.name).toBe('Sony WH-1000XM5 Wireless Noise Canceling Headphones');
      expect(productData.rating).toBe('4.5');
      expect(productData.reviews).toBe('2345');
      expect(productData.price).toBe('399.99');
      expect(productData.asin).toBe('B0ABC123XY');
      expect(productData.imageUrl).toBe('https://m.media-amazon.com/images/I/test.jpg');
      expect(productData.listPrice).toBe('499.99');
      expect(productData.discount).toBe('20');
      expect(productData.monthlyPurchases).toBe('3k+');
      expect(productData.isPrime).toBe(true);
      expect(productData.deliveryDate).toBe('Entrega GRATIS mañana, 15 de dic');
      expect(productData.unitPrice).toBe('$0.50/ml');
      expect(productData.installmentPrice).toBe('$35.00 x 12 meses');
      expect(productData.hasSubscribeSave).toBe(true);
    });

    test('should handle missing optional fields gracefully', () => {
      const html = `
        <div data-component-type="s-search-result">
          <h2>
            <a aria-label="Basic Product Without Extra Fields">
              <span>Basic Product</span>
            </a>
          </h2>
          <div class="a-row">
            <i class="a-icon a-icon-star-small">
              <span class="a-icon-alt">4.0 out of 5 stars</span>
            </i>
            <a href="/product-reviews/B0ABC123#customerReviews">
              <span>100</span>
            </a>
          </div>
          <span class="a-price">
            <span class="a-offscreen">$29.99</span>
          </span>
        </div>
      `;

      createMockDOM(html);
      const container = document.querySelector('[data-component-type="s-search-result"]');
      const productData = ProductExtractor.extractProductData(container);

      expect(productData.name).toBe('Basic Product Without Extra Fields');
      expect(productData.asin).toBe('');
      expect(productData.imageUrl).toBe('');
      expect(productData.listPrice).toBe('');
      expect(productData.discount).toBe('');
      expect(productData.monthlyPurchases).toBe('');
      expect(productData.isPrime).toBe(false);
      expect(productData.deliveryDate).toBe('');
      expect(productData.unitPrice).toBe('');
      expect(productData.installmentPrice).toBe('');
      expect(productData.hasSubscribeSave).toBe(false);
    });
  });

  describe('Collection Strategies', () => {
    test('should collect products using multiple strategies', () => {
      const html = `
        <div>
          <!-- Strategy 1: data-component-type -->
          <div data-component-type="s-search-result">
            <h2>
              <a aria-label="Product A - High Quality Item">Product A</a>
            </h2>
            <i><span class="a-icon-alt">4.0 out of 5 stars</span></i>
            <a href="#customerReviews"><span>100</span></a>
            <span class="a-price"><span class="a-offscreen">$29.99</span></span>
          </div>
          
          <!-- Strategy 2: data-asin -->
          <div data-asin="B123456789">
            <h2>
              <a aria-label="Product B - Premium Quality">Product B</a>
            </h2>
            <i><span class="a-icon-alt">3.5 out of 5 stars</span></i>
            <a href="#customerReviews"><span>50</span></a>
            <span class="a-price"><span class="a-offscreen">$49.99</span></span>
          </div>
          
          <!-- Strategy 2: data-asin without data-component-type -->
          <div data-asin="B987654321">
            <h2>
              <a aria-label="Product C - Excellent Value for Money">Product C</a>
            </h2>
            <i><span class="a-icon-alt">5.0 out of 5 stars</span></i>
            <a href="#customerReviews"><span>200</span></a>
            <span class="a-price"><span class="a-offscreen">$19.99</span></span>
          </div>
        </div>
      `;
      
      createMockDOM(html);
      const products = ProductExtractor.collectAllProducts(document);
      
      expect(products).toHaveLength(3);
      expect(products[0].name).toBe('Product A - High Quality Item');
      expect(products[1].name).toBe('Product B - Premium Quality');
      expect(products[2].name).toBe('Product C - Excellent Value for Money');
    });

    test('should extract simple products for background.js format with all fields', () => {
      const html = `
        <div class="s-main-slot">
          <div data-component-type="s-search-result" data-asin="B0TEST123">
            <h2>
              <a aria-label="Background Test Product">Background Test</a>
            </h2>
            <img class="s-image" src="https://example.com/test.jpg" alt="Background Test Product - Complete Description" />
            <i><span class="a-icon-alt">4.2 out of 5 stars</span></i>
            <a href="#customerReviews"><span>150</span></a>
            <span class="a-price"><span class="a-offscreen">$79.99</span></span>
            <i class="a-icon-prime"></i>
          </div>
        </div>
      `;

      createMockDOM(html);
      const products = ProductExtractor.extractSimpleProducts(document);

      expect(products).toHaveLength(1);
      expect(products[0].title).toBe('Background Test Product');
      expect(products[0].description).toBe('- Complete Description');
      expect(products[0].rating).toBe('4.2');
      expect(products[0].reviews).toBe('150');
      expect(products[0].price).toBe('79.99');
      expect(products[0].asin).toBe('B0TEST123');
      expect(products[0].imageUrl).toBe('https://example.com/test.jpg');
      expect(products[0].isPrime).toBe(true);
    });
  });

  describe('New Field Extraction Methods', () => {
    test('extractAsin should get ASIN from data attribute', () => {
      const html = `<div data-asin="B01M3R0WV7"></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractAsin(container)).toBe('B01M3R0WV7');
    });

    test('extractAsin should return empty string when no ASIN', () => {
      const html = `<div></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractAsin(container)).toBe('');
    });

    test('extractImageUrl should get image src', () => {
      const html = `<div><img class="s-image" src="https://m.media-amazon.com/images/test.jpg" /></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractImageUrl(container)).toBe('https://m.media-amazon.com/images/test.jpg');
    });

    test('extractListPrice should get strikethrough price', () => {
      const html = `<div><span class="a-text-price" data-a-strike="true"><span class="a-offscreen">$256.15</span></span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractListPrice(container)).toBe('256.15');
    });

    test('extractMonthlyPurchases should parse Spanish format', () => {
      const html = `<div><span class="a-color-secondary">3k+ comprados el mes pasado</span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractMonthlyPurchases(container)).toBe('3k+');
    });

    test('extractMonthlyPurchases should parse English format', () => {
      const html = `<div><span class="a-color-secondary">5K+ bought in past month</span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractMonthlyPurchases(container)).toBe('5K+');
    });

    test('extractIsPrime should detect Prime badge', () => {
      const html = `<div><i class="a-icon a-icon-prime"></i></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractIsPrime(container)).toBe(true);
    });

    test('extractIsPrime should return false without Prime badge', () => {
      const html = `<div><span>No Prime here</span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractIsPrime(container)).toBe(false);
    });

    test('extractDeliveryDate should get delivery text', () => {
      const html = `<div><div class="udm-primary-delivery-message">Entrega GRATIS mañana, 15 de dic</div></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractDeliveryDate(container)).toBe('Entrega GRATIS mañana, 15 de dic');
    });

    test('extractUnitPrice should parse unit price', () => {
      const html = `<div><div data-cy="price-recipe"><span class="a-color-secondary">($0.03/mililitro)</span></div></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractUnitPrice(container)).toBe('$0.03/mililitro');
    });

    test('extractInstallmentPrice should parse installment info', () => {
      const html = `<div><div data-cy="price-recipe">$14.41 x 12 meses</div></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractInstallmentPrice(container)).toBe('$14.41 x 12 meses');
    });

    test('extractHasSubscribeSave should detect Spanish Subscribe & Save', () => {
      const html = `<div><span>Hasta 10% más con Suma y Ahorra</span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractHasSubscribeSave(container)).toBe(true);
    });

    test('extractHasSubscribeSave should detect English Subscribe & Save', () => {
      const html = `<div><span>Save more with Subscribe & Save</span></div>`;
      createMockDOM(html);
      const container = document.querySelector('div');
      expect(ProductExtractor.extractHasSubscribeSave(container)).toBe(true);
    });

    test('calculateDiscount should compute discount percentage', () => {
      expect(ProductExtractor.calculateDiscount('142', '256.15')).toBe('45');
      expect(ProductExtractor.calculateDiscount('80', '100')).toBe('20');
      expect(ProductExtractor.calculateDiscount('100', '100')).toBe('');
      expect(ProductExtractor.calculateDiscount('100', '')).toBe('');
    });
  });

  describe('Data Validation and Cleaning', () => {
    test('should reject invalid product names', () => {
      expect(ProductExtractor.isValidProductName('Short')).toBe(false);
      expect(ProductExtractor.isValidProductName('$19.99')).toBe(false);
      expect(ProductExtractor.isValidProductName('Add to Cart')).toBe(false);
      expect(ProductExtractor.isValidProductName('Real Product Name That Is Long Enough')).toBe(true);
    });

    test('should clean product names properly', () => {
      expect(ProductExtractor.cleanProductName('Sponsored: Apple iPhone 14')).toBe('Apple iPhone 14');
      expect(ProductExtractor.cleanProductName('Patrocinado - Samsung Galaxy')).toBe('Samsung Galaxy');
      expect(ProductExtractor.cleanProductName('APPLE IPHONE 14 PRO MAX')).toBe('Apple IPHONE 14 PRO MAX');
    });
  });

  describe('Duplicate Detection', () => {
    test('should handle duplicate detection in collectAllProducts', () => {
      const html = `
        <div>
          <div data-component-type="s-search-result">
            <h2><a aria-label="Apple iPhone 14 Pro">iPhone 14 Pro</a></h2>
            <i><span class="a-icon-alt">4.5 out of 5 stars</span></i>
            <a href="#customerReviews"><span>1000</span></a>
            <span class="a-price"><span class="a-offscreen">$999.99</span></span>
          </div>
          
          <div data-asin="B987654321">
            <h2><a aria-label="Apple iPhone 14 Pro">iPhone 14 Pro</a></h2>
            <i><span class="a-icon-alt">4.5 out of 5 stars</span></i>
            <a href="#customerReviews"><span>1000</span></a>
            <span class="a-price"><span class="a-offscreen">$999.99</span></span>
          </div>
        </div>
      `;
      
      createMockDOM(html);
      const products = ProductExtractor.collectAllProducts(document);
      
      // Should only have one product due to duplicate detection
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Apple iPhone 14 Pro');
    });
  });
});

describe('Integration - Content vs Background Extraction', () => {
  test('should produce consistent results between collection methods', () => {
    const html = `
      <div class="s-main-slot">
        <div data-component-type="s-search-result">
          <h2>
            <a aria-label="Integration Test Product - Complete Name">Integration Test</a>
          </h2>
          <img class="s-image" alt="Integration Test Product - Complete Name" />
          <i><span class="a-icon-alt">4.8 out of 5 stars</span></i>
          <a href="#customerReviews"><span>500</span></a>
          <span class="a-price"><span class="a-offscreen">$159.99</span></span>
        </div>
      </div>
    `;
    
    createMockDOM(html);
    
    // Test content.js style collection
    const contentProducts = ProductExtractor.collectAllProducts(document);
    
    // Test background.js style collection  
    const backgroundProducts = ProductExtractor.extractSimpleProducts(document);
    
    // Both should extract the same core data
    expect(contentProducts).toHaveLength(1);
    expect(backgroundProducts).toHaveLength(1);
    
    // Compare core fields
    expect(contentProducts[0].name).toBe(backgroundProducts[0].title);
    expect(contentProducts[0].rating).toBe(backgroundProducts[0].rating);
    expect(contentProducts[0].reviews).toBe(backgroundProducts[0].reviews);
    expect(contentProducts[0].price).toBe(backgroundProducts[0].price);
  });
});