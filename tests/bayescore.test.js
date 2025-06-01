const { calculateBayesScores } = require('../utils/bayes');

test('calculates bayes scores for sample products', () => {
  const data = [
    { rating: 4.0, reviews: 100 },
    { rating: 4.5, reviews: 10 },
    { rating: 3.0, reviews: 2 }
  ];
  const scores = calculateBayesScores(data);
  expect(scores).toEqual(['3.955', '3.974', '3.791']);
});
