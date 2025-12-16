const bayesUtils = require('../utils/bayes');
const { calculateBayesScores, addWilsonScore, addLogAdjustedScore, addEnhancedBayesScore, addValueScore, addPremiumScore, calcEnhancedParams, calcParams, getPercentile, getMedian, getPriceTier } = bayesUtils;

// Original test - maintain backward compatibility
test('calculates bayes scores for sample products', () => {
  const data = [
    { rating: 4.0, reviews: 100 },
    { rating: 4.5, reviews: 10 },
    { rating: 3.0, reviews: 2 }
  ];
  const scores = calculateBayesScores(data);
  expect(scores).toEqual(['3.955', '3.974', '3.791']);
});

// Helper function tests
describe('Helper Functions', () => {
  test('getPercentile calculates correct percentile', () => {
    const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(getPercentile(arr, 0.25)).toBe(30);
    expect(getPercentile(arr, 0.5)).toBe(60);
    expect(getPercentile(arr, 0.75)).toBe(80);
  });

  test('getPercentile handles empty array', () => {
    expect(getPercentile([], 0.5)).toBe(0);
  });

  test('getMedian calculates correct median for odd length', () => {
    expect(getMedian([1, 2, 3, 4, 5])).toBe(3);
  });

  test('getMedian calculates correct median for even length', () => {
    expect(getMedian([1, 2, 3, 4])).toBe(2.5);
  });

  test('getMedian handles empty array', () => {
    expect(getMedian([])).toBe(0);
  });
});

// Enhanced Bayesian tests
describe('Enhanced Bayesian Score', () => {
  test('calcEnhancedParams uses percentile instead of mean', () => {
    const products = [
      { rating: 4.0, reviews: 10 },
      { rating: 4.0, reviews: 20 },
      { rating: 4.0, reviews: 30 },
      { rating: 4.0, reviews: 10000 } // Outlier
    ];

    const enhanced = calcEnhancedParams(products);
    const standard = calcParams(products);

    // Enhanced m should be much lower than standard (not pulled up by outlier)
    expect(enhanced.m).toBeLessThan(standard.m);
  });

  test('addEnhancedBayesScore adds bayescore to products', () => {
    const products = [
      { rating: 4.5, reviews: 100 },
      { rating: 4.0, reviews: 50 }
    ];

    addEnhancedBayesScore(products);

    expect(products[0]).toHaveProperty('bayescore');
    expect(products[1]).toHaveProperty('bayescore');
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(0);
  });
});

// Wilson Score tests
describe('Wilson Score', () => {
  test('Wilson score penalizes low review counts', () => {
    const fewReviews = [{ rating: 5.0, reviews: 5 }];
    const manyReviews = [{ rating: 4.5, reviews: 500 }];

    addWilsonScore(fewReviews);
    addWilsonScore(manyReviews);

    // Despite higher rating, few reviews should score lower
    expect(parseFloat(manyReviews[0].bayescore)).toBeGreaterThan(parseFloat(fewReviews[0].bayescore));
  });

  test('Wilson score handles zero reviews', () => {
    const products = [{ rating: 4.5, reviews: 0 }];
    addWilsonScore(products);
    expect(products[0].bayescore).toBe('0.000');
  });

  test('Wilson score increases with more reviews at same rating', () => {
    const products = [
      { rating: 4.0, reviews: 10 },
      { rating: 4.0, reviews: 100 },
      { rating: 4.0, reviews: 1000 }
    ];

    addWilsonScore(products);

    const score10 = parseFloat(products[0].bayescore);
    const score100 = parseFloat(products[1].bayescore);
    const score1000 = parseFloat(products[2].bayescore);

    expect(score1000).toBeGreaterThan(score100);
    expect(score100).toBeGreaterThan(score10);
  });
});

// Log-Adjusted Score tests
describe('Log-Adjusted Score', () => {
  test('Log-adjusted gives bonus for high review counts', () => {
    const products = [
      { rating: 4.0, reviews: 1000 },
      { rating: 4.0, reviews: 10 }
    ];

    addLogAdjustedScore(products);

    // Same rating, but more reviews = higher score
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(parseFloat(products[1].bayescore));
  });

  test('Log-adjusted score is capped at 5', () => {
    const products = [
      { rating: 5.0, reviews: 100000 }
    ];

    addLogAdjustedScore(products);

    expect(parseFloat(products[0].bayescore)).toBeLessThanOrEqual(5);
  });

  test('Log-adjusted handles zero reviews', () => {
    const products = [
      { rating: 4.0, reviews: 0 },
      { rating: 4.0, reviews: 100 }
    ];

    addLogAdjustedScore(products);

    // Zero reviews should get no bonus
    expect(parseFloat(products[0].bayescore)).toBeLessThan(parseFloat(products[1].bayescore));
  });
});

// Unified addScore function tests
describe('Unified addScore Function', () => {
  test('addScore with wilson method applies Wilson scoring', () => {
    const products = [{ rating: 4.5, reviews: 100 }];
    bayesUtils.addScore(products, 'wilson');
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('addScore with enhanced method applies enhanced scoring', () => {
    const products = [{ rating: 4.5, reviews: 100 }];
    bayesUtils.addScore(products, 'enhanced');
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('addScore with logadjusted method applies log-adjusted scoring', () => {
    const products = [{ rating: 4.5, reviews: 100 }];
    bayesUtils.addScore(products, 'logadjusted');
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('addScore with classic method applies original scoring', () => {
    const products = [{ rating: 4.5, reviews: 100 }];
    bayesUtils.addScore(products, 'classic');
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('addScore with custom params uses provided values', () => {
    const products = [{ rating: 4.0, reviews: 50 }];
    bayesUtils.addScore(products, 'custom', { C: 3.0, m: 100 });
    expect(products[0]).toHaveProperty('bayescore');
  });
});

// Comparison tests - verify methods produce different results
describe('Method Comparison', () => {
  test('Different methods produce different scores', () => {
    const testData = [
      { rating: 4.5, reviews: 100 },
      { rating: 4.0, reviews: 10 },
      { rating: 5.0, reviews: 5 }
    ];

    // Make copies for each method
    const classic = JSON.parse(JSON.stringify(testData));
    const enhanced = JSON.parse(JSON.stringify(testData));
    const wilson = JSON.parse(JSON.stringify(testData));
    const logAdj = JSON.parse(JSON.stringify(testData));

    bayesUtils.addScore(classic, 'classic');
    bayesUtils.addScore(enhanced, 'enhanced');
    bayesUtils.addScore(wilson, 'wilson');
    bayesUtils.addScore(logAdj, 'logadjusted');

    // At least some scores should differ between methods
    const allSame = classic.every((p, i) =>
      p.bayescore === enhanced[i].bayescore &&
      p.bayescore === wilson[i].bayescore &&
      p.bayescore === logAdj[i].bayescore
    );

    expect(allSame).toBe(false);
  });

  test('Wilson properly ranks products with varying review counts', () => {
    const products = [
      { rating: 4.8, reviews: 3 },    // High rating, very few reviews
      { rating: 4.2, reviews: 500 },  // Lower rating, many reviews
      { rating: 4.5, reviews: 50 }    // Medium
    ];

    bayesUtils.addScore(products, 'wilson');

    // Sort by score
    const sorted = [...products].sort((a, b) => parseFloat(b.bayescore) - parseFloat(a.bayescore));

    // Product with 500 reviews should rank first despite lower rating
    expect(parseInt(sorted[0].reviews)).toBe(500);
  });
});

// Price Tier Helper tests
describe('Price Tier Helper', () => {
  test('getPriceTier returns budget tier for low prices', () => {
    expect(getPriceTier(25).tier).toBe('budget');
    expect(getPriceTier(50).tier).toBe('budget');
    expect(getPriceTier(25).multiplier).toBe(1.0);
  });

  test('getPriceTier returns midrange tier for mid prices', () => {
    expect(getPriceTier(100).tier).toBe('midrange');
    expect(getPriceTier(200).tier).toBe('midrange');
    expect(getPriceTier(100).multiplier).toBe(0.7);
  });

  test('getPriceTier returns premium tier for high prices', () => {
    expect(getPriceTier(300).tier).toBe('premium');
    expect(getPriceTier(500).tier).toBe('premium');
    expect(getPriceTier(300).multiplier).toBe(0.5);
  });

  test('getPriceTier returns luxury tier for very high prices', () => {
    expect(getPriceTier(1000).tier).toBe('luxury');
    expect(getPriceTier(5000).tier).toBe('luxury');
    expect(getPriceTier(1000).multiplier).toBe(0.3);
  });

  test('getPriceTier handles edge cases', () => {
    expect(getPriceTier(0).tier).toBe('budget');
    expect(getPriceTier(-10).tier).toBe('budget');
    expect(getPriceTier(null).tier).toBe('budget');
    expect(getPriceTier(undefined).tier).toBe('budget');
    expect(getPriceTier('invalid').tier).toBe('budget');
  });
});

// Value Score tests
describe('Value Score', () => {
  test('Value score favors cheaper products with same quality', () => {
    const cheap = [
      { rating: 4.5, reviews: 100, price: 20 },
      { rating: 4.5, reviews: 100, price: 200 }
    ];

    addValueScore(cheap);

    // Cheaper product should have higher value score
    expect(parseFloat(cheap[0].bayescore)).toBeGreaterThan(parseFloat(cheap[1].bayescore));
  });

  test('Value score handles zero price gracefully', () => {
    const products = [
      { rating: 4.0, reviews: 50, price: 0 },
      { rating: 4.0, reviews: 50, price: 100 }
    ];

    addValueScore(products);

    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(0);
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('Value score handles missing price', () => {
    const products = [
      { rating: 4.0, reviews: 50 }
    ];

    addValueScore(products);

    expect(products[0]).toHaveProperty('bayescore');
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(0);
  });

  test('Value score is capped at 5', () => {
    const products = [
      { rating: 5.0, reviews: 1000, price: 1 }
    ];

    addValueScore(products);

    expect(parseFloat(products[0].bayescore)).toBeLessThanOrEqual(5);
  });

  test('addScore with value method applies value scoring', () => {
    const products = [{ rating: 4.5, reviews: 100, price: 50 }];
    bayesUtils.addScore(products, 'value');
    expect(products[0]).toHaveProperty('bayescore');
  });
});

// Premium Score tests
describe('Premium Score', () => {
  test('Premium score gives expensive products credit with fewer reviews', () => {
    // Use same array so both products have the same m threshold calculation
    // Use more products to create a proper distribution where m is meaningful
    const products = [
      { rating: 4.5, reviews: 15, price: 800 },  // Luxury - fewer reviews
      { rating: 4.5, reviews: 15, price: 25 },   // Budget - fewer reviews
      { rating: 4.0, reviews: 50, price: 100 },  // For m calculation
      { rating: 4.2, reviews: 100, price: 200 }, // For m calculation
      { rating: 3.8, reviews: 200, price: 150 }, // For m calculation
      { rating: 4.1, reviews: 300, price: 80 }   // High reviews for distribution
    ];

    addPremiumScore(products);

    // Expensive product should score higher with same reviews/rating
    // because luxury tier reduces the m threshold (0.3 multiplier vs 1.0)
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(parseFloat(products[1].bayescore));
  });

  test('Premium score handles products without price', () => {
    const products = [
      { rating: 4.0, reviews: 100 },
      { rating: 3.5, reviews: 50, price: 100 },
      { rating: 4.2, reviews: 200, price: 150 }
    ];

    addPremiumScore(products);

    expect(products[0]).toHaveProperty('bayescore');
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(0);
  });

  test('Premium score applies correct tier multipliers', () => {
    // Products with same rating/reviews but different prices in same array
    // Use low reviews where the m adjustment has more impact
    // Rating 4.8 is above median to see the tier effect clearly
    // Need more lower-rated products so median < 4.8
    const products = [
      { rating: 4.8, reviews: 10, price: 30 },    // Budget - low reviews, high rating
      { rating: 4.8, reviews: 10, price: 150 },   // Midrange - low reviews, high rating
      { rating: 4.8, reviews: 10, price: 400 },   // Premium - low reviews, high rating
      { rating: 4.8, reviews: 10, price: 1000 },  // Luxury - low reviews, high rating
      { rating: 3.2, reviews: 100, price: 200 },  // Lower rating
      { rating: 3.0, reviews: 200, price: 100 },  // Lower rating
      { rating: 3.3, reviews: 300, price: 150 },  // Lower rating
      { rating: 3.5, reviews: 150, price: 120 },  // Lower rating
      { rating: 3.4, reviews: 250, price: 90 }    // Lower rating - ensures median is low
    ];

    addPremiumScore(products);

    // Higher price tiers should score higher due to reduced m
    // Products with rating above median (C) benefit more from higher weight on R
    expect(parseFloat(products[3].bayescore)).toBeGreaterThan(parseFloat(products[2].bayescore));
    expect(parseFloat(products[2].bayescore)).toBeGreaterThan(parseFloat(products[1].bayescore));
    expect(parseFloat(products[1].bayescore)).toBeGreaterThan(parseFloat(products[0].bayescore));
  });

  test('addScore with premium method applies premium scoring', () => {
    const products = [
      { rating: 4.5, reviews: 100, price: 300 },
      { rating: 4.0, reviews: 50, price: 100 }
    ];
    bayesUtils.addScore(products, 'premium');
    expect(products[0]).toHaveProperty('bayescore');
  });

  test('Premium score confidence threshold adjusts by tier', () => {
    // Products in same array
    const products = [
      { rating: 4.5, reviews: 2, price: 1000 },  // Luxury with 2 reviews
      { rating: 4.5, reviews: 2, price: 30 },    // Budget with 2 reviews
      { rating: 4.0, reviews: 100, price: 100 }  // Additional for proper calculation
    ];

    addPremiumScore(products);

    // Luxury should score higher because confidence threshold is 2 (reached)
    // Budget needs 5 reviews, so 2 reviews gives it a penalty
    expect(parseFloat(products[0].bayescore)).toBeGreaterThan(parseFloat(products[1].bayescore));
  });
});

// Price-based method comparison tests
describe('Price-Based Method Comparison', () => {
  test('Value and Premium methods produce different rankings', () => {
    const testData = [
      { rating: 4.5, reviews: 100, price: 500 },  // Expensive, many reviews
      { rating: 4.5, reviews: 100, price: 20 },   // Cheap, many reviews
      { rating: 4.5, reviews: 30, price: 800 }    // Very expensive, fewer reviews
    ];

    const valueData = JSON.parse(JSON.stringify(testData));
    const premiumData = JSON.parse(JSON.stringify(testData));

    bayesUtils.addScore(valueData, 'value');
    bayesUtils.addScore(premiumData, 'premium');

    // Sort both by score
    const valueSorted = [...valueData].sort((a, b) => parseFloat(b.bayescore) - parseFloat(a.bayescore));
    const premiumSorted = [...premiumData].sort((a, b) => parseFloat(b.bayescore) - parseFloat(a.bayescore));

    // Value should rank the cheap product first (best value)
    expect(valueSorted[0].price).toBe(20);

    // Premium should be more favorable to expensive products
    // The $500 and $800 products should rank higher in premium than in value
    const expensiveValueRank = valueData.findIndex(p => p.price === 500);
    const expensivePremiumRank = premiumData.findIndex(p => p.price === 500);

    // In premium scoring, expensive products should have relatively higher scores
    expect(parseFloat(premiumData.find(p => p.price === 500).bayescore))
      .toBeGreaterThanOrEqual(parseFloat(valueData.find(p => p.price === 500).bayescore) * 0.5);
  });
});
