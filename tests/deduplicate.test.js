const { deduplicate } = require('../utils/csv');

test('removes duplicate product entries', () => {
  const items = [
    { title: 'A', description: 'x', rating: 4.5, reviews: 10, price: '$1', bayescore: '4.0' },
    { title: 'A', description: 'x', rating: 4.5, reviews: 10, price: '$1', bayescore: '4.0' },
    { title: 'B', description: 'y', rating: 3.0, reviews: 5,  price: '$2', bayescore: '3.5' }
  ];

  const result = deduplicate(items);
  expect(result).toHaveLength(2);
  expect(result[0].title).toBe('A');
  expect(result[1].title).toBe('B');
});
