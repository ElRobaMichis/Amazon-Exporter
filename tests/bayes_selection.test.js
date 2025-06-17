const { addBayesScoreWithParams, calcParams } = require('../utils/bayes');

describe('Bayesian Score Selection', () => {
  const sampleProducts = [
    { rating: '4.0', reviews: '100' },
    { rating: '4.5', reviews: '10' },
    { rating: '3.0', reviews: '2' },
    { rating: '5.0', reviews: '200' }
  ];

  test('calculates parameters correctly', () => {
    const params = calcParams(sampleProducts);
    expect(params.C).toBeCloseTo(4.125, 3); // (4.0+4.5+3.0+5.0)/4
    expect(params.m).toBeCloseTo(78, 0); // (100+10+2+200)/4
  });

  test('adds Bayesian scores with custom parameters', () => {
    const products = JSON.parse(JSON.stringify(sampleProducts)); // deep copy
    const customParams = { C: 3.5, m: 50 };
    
    addBayesScoreWithParams(products, customParams);
    
    // All products should have bayescore field
    products.forEach(product => {
      expect(product.bayescore).toBeDefined();
      expect(typeof product.bayescore).toBe('string');
      expect(parseFloat(product.bayescore)).toBeGreaterThan(0);
    });
  });

  test('handles products with high ratings differently based on method', () => {
    const highRatedProduct = [{ rating: '5.0', reviews: '1000' }];
    const lowRatedProduct = [{ rating: '2.0', reviews: '5' }];
    
    // Conservative (min) approach
    const minParams = { C: 2.0, m: 5 };
    addBayesScoreWithParams(highRatedProduct, minParams);
    addBayesScoreWithParams(lowRatedProduct, minParams);
    
    const highScoreMin = parseFloat(highRatedProduct[0].bayescore);
    const lowScoreMin = parseFloat(lowRatedProduct[0].bayescore);
    
    // Optimistic (high) approach  
    const maxParams = { C: 5.0, m: 1000 };
    const highRatedProduct2 = [{ rating: '5.0', reviews: '1000' }];
    const lowRatedProduct2 = [{ rating: '2.0', reviews: '5' }];
    
    addBayesScoreWithParams(highRatedProduct2, maxParams);
    addBayesScoreWithParams(lowRatedProduct2, maxParams);
    
    const highScoreMax = parseFloat(highRatedProduct2[0].bayescore);
    const lowScoreMax = parseFloat(lowRatedProduct2[0].bayescore);
    
    // High-rated products should benefit more from optimistic parameters
    expect(highScoreMax).toBeGreaterThan(highScoreMin);
    // Low-rated products should be pulled up more by optimistic parameters
    expect(lowScoreMax).toBeGreaterThan(lowScoreMin);
  });

  test('handles edge cases gracefully', () => {
    const edgeCaseProducts = [
      { rating: '', reviews: '' },
      { rating: '0', reviews: '0' },
      { rating: 'invalid', reviews: 'invalid' }
    ];
    
    const params = { C: 3.0, m: 100 };
    addBayesScoreWithParams(edgeCaseProducts, params);
    
    edgeCaseProducts.forEach(product => {
      expect(product.bayescore).toBeDefined();
      expect(parseFloat(product.bayescore)).not.toBeNaN();
    });
  });
});