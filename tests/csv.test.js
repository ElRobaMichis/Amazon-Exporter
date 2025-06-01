const { toCsv } = require('../utils/csv');

test('CSV output starts with BOM', () => {
  const products = [{
    title: 'Example',
    description: 'Desc',
    rating: 5,
    reviews: 10,
    price: '$10',
    bayescore: '4.5'
  }];
  const csv = toCsv(products);
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
});
