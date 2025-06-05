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
    test('should extract complete product data', () => {
      const html = `
        <div data-component-type="s-search-result">
          <h2>
            <a aria-label="Sony WH-1000XM5 Wireless Noise Canceling Headphones">
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
          <span class="a-price">
            <span class="a-offscreen">$399.99</span>
          </span>
        </div>
      `;
      
      createMockDOM(html);
      const container = document.querySelector('[data-component-type="s-search-result"]');
      const productData = ProductExtractor.extractProductData(container);
      
      expect(productData).toEqual({
        name: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
        rating: '4.5',
        reviews: '2345',
        price: '399.99'
      });
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

    test('should extract simple products for background.js format', () => {
      const html = `
        <div class="s-main-slot">
          <div data-component-type="s-search-result">
            <h2>
              <a aria-label="Background Test Product">Background Test</a>
            </h2>
            <img class="s-image" alt="Background Test Product - Complete Description" />
            <i><span class="a-icon-alt">4.2 out of 5 stars</span></i>
            <a href="#customerReviews"><span>150</span></a>
            <span class="a-price"><span class="a-offscreen">$79.99</span></span>
          </div>
        </div>
      `;
      
      createMockDOM(html);
      const products = ProductExtractor.extractSimpleProducts(document);
      
      expect(products).toHaveLength(1);
      expect(products[0]).toEqual({
        title: 'Background Test Product',
        description: '- Complete Description',
        rating: '4.2',
        reviews: '150',
        price: '79.99'
      });
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