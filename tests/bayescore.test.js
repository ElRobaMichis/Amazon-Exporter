function calculateBayesScore(products, m = 1000) {
  const ratings = products.map(p => p.rating);
  const C = ratings.reduce((a, b) => a + b, 0) / (ratings.length || 1);
  return products.map(({ rating: R, reviews: v }) => (
    ((v / (v + m)) * R + (m / (v + m)) * C).toFixed(3)
  ));
}

test('calculates bayes scores for sample products', () => {
  const data = [
    { rating: 4.0, reviews: 100 },
    { rating: 4.5, reviews: 10 },
    { rating: 3.0, reviews: 2 }
  ];
  const scores = calculateBayesScore(data);
  expect(scores).toEqual(['3.848', '3.840', '3.832']);
});
