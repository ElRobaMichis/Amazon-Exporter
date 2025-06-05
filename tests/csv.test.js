const { toCsv } = require('../utils/csv');

test('generates CSV with BOM and headers', () => {
  const products = [
    {
      title: 'Prod 1',
      rating: 4.5,
      reviews: 10,
      price: '$20',
      bayescore: '4.123'
    },
    {
      title: 'Prod 2',
      rating: 3.0,
      reviews: 5,
      price: '$15',
      bayescore: '3.456'
    }
  ];
  const csv = toCsv(products);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('Name,Rating,Reviews,Price,Bayescore');
});

test('escapes quotes within fields', () => {
  const data = [
    {
      title: 'Prod "2" with, comma',
      rating: 4,
      reviews: 5,
      price: '$10',
      bayescore: '3.500'
    }
  ];
  const csv = toCsv(data);
  const line = csv.split('\n')[1];
  expect(line).toContain('"Prod ""2"" with, comma"');
});
