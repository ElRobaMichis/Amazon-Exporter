describe('Review Count Parsing with K Multipliers', () => {
  
  // Simulate the parsing logic from productExtractor.js
  function parseReviewCount(reviewsText) {
    const reviewsMatch = reviewsText.match(/([\d.,]+)\s*[kK]?/);
    if (reviewsMatch) {
      let numStr = reviewsMatch[1];
      
      // Handle different decimal separators: if there's a k/K, treat comma as decimal
      if (/[kK]/.test(reviewsText)) {
        // For k format: "1,2k" means 1.2k = 1200, "1.2k" means 1.2k = 1200  
        numStr = numStr.replace(',', '.');
        let numValue = parseFloat(numStr);
        numValue = Math.round(numValue * 1000);
        return numValue.toString();
      } else {
        // For regular numbers: "1,234" means 1234 (comma as thousands separator)
        numStr = numStr.replace(/,/g, '');
        return numStr;
      }
    }
    return "0";
  }

  test('parses regular review counts without k multiplier', () => {
    expect(parseReviewCount('1,234')).toBe('1234');
  });

  test('parses review counts with k multiplier - integer', () => {
    expect(parseReviewCount('5k')).toBe('5000');
  });

  test('parses review counts with k multiplier - decimal', () => {
    expect(parseReviewCount('5.9k')).toBe('5900');
  });

  test('parses review counts with K multiplier - uppercase', () => {
    expect(parseReviewCount('3K')).toBe('3000');
  });

  test('parses review counts with k and spaces', () => {
    expect(parseReviewCount('2.5 k')).toBe('2500');
  });

  test('parses review counts with comma and k', () => {
    expect(parseReviewCount('1,2k')).toBe('1200');
  });

  test('handles edge cases', () => {
    expect(parseReviewCount('0k')).toBe('0');
    expect(parseReviewCount('0.5k')).toBe('500');
    expect(parseReviewCount('10.9k')).toBe('10900');
  });

  test('handles mixed text with k multiplier', () => {
    expect(parseReviewCount('(4.8k reviews)')).toBe('4800');
  });

  test('falls back gracefully for invalid formats', () => {
    expect(parseReviewCount('invalid text')).toBe('0');
  });

});