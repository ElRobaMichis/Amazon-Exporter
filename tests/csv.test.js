const { toCsv } = require('../utils/csv');

test('generates CSV with BOM and headers', () => {
  const products = [
    {
      title: 'Prod 1',
      asin: 'B0TEST001',
      rating: 4.5,
      reviews: 10,
      price: '20',
      listPrice: '30',
      discount: '33',
      monthlyPurchases: '1k+',
      isPrime: true,
      unitPrice: '$1/unit',
      installmentPrice: '$5 x 4',
      hasSubscribeSave: true,
      deliveryDate: 'Tomorrow',
      link: 'https://amazon.com/dp/B0TEST001',
      imageUrl: 'https://images.amazon.com/test1.jpg',
      bayescore: '4.123'
    },
    {
      title: 'Prod 2',
      asin: 'B0TEST002',
      rating: 3.0,
      reviews: 5,
      price: '15',
      isPrime: false,
      hasSubscribeSave: false,
      bayescore: '3.456'
    }
  ];
  const csv = toCsv(products);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('Name,ASIN,Rating,Reviews,Price,List Price,Discount %,Monthly Purchases,Prime,Unit Price,Installment,Subscribe & Save,Delivery,Link,Image URL,Bayescore');
  // Check first product data
  expect(csv).toContain('"Prod 1"');
  expect(csv).toContain('"B0TEST001"');
  expect(csv).toContain('"Yes"'); // Prime
  // Check second product data
  expect(csv).toContain('"Prod 2"');
  expect(csv).toContain('"No"'); // No Prime
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
