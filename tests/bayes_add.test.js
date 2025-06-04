const { addBayesScore, calculateBayesScores } = require('../utils/bayes');

test('adds bayescore field to each product', () => {
  const products = [
    { rating: 4.0, reviews: 100 },
    { rating: 4.5, reviews: 10 }
  ];

  const expected = calculateBayesScores(products.map(p => ({ rating: p.rating, reviews: p.reviews })));
  const result = addBayesScore(products);

  expect(result).toBe(products); // same array mutated
  expect(products.map(p => p.bayescore)).toEqual(expected);
});
