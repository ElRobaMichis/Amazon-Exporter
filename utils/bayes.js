(function(root,factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.bayesUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){

  // Helper: Get percentile value from sorted array
  function getPercentile(arr, percentile) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  // Helper: Get median value
  function getMedian(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Helper: Get price tier and multiplier for review expectations
  // Premium products naturally have fewer buyers/reviews, so we reduce the threshold
  function getPriceTier(price) {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) return { tier: 'budget', multiplier: 1.0 };
    if (p <= 50) return { tier: 'budget', multiplier: 1.0 };
    if (p <= 200) return { tier: 'midrange', multiplier: 0.7 };
    if (p <= 500) return { tier: 'premium', multiplier: 0.5 };
    return { tier: 'luxury', multiplier: 0.3 };
  }

  // Original params calculation (arithmetic mean)
  function calcParams(products){
    const ratings = products.map(p => parseFloat(p.rating)).filter(r => !isNaN(r));
    const counts = products.map(p => parseInt(p.reviews,10) || 0);
    const C = ratings.reduce((a,b)=>a+b,0) / (ratings.length || 1);
    const m = counts.reduce((a,b)=>a+b,0) / (counts.length || 1);
    return {C,m};
  }

  // Enhanced params: 25th percentile for m, median for C (resistant to outliers)
  function calcEnhancedParams(products) {
    const ratings = products.map(p => parseFloat(p.rating)).filter(r => !isNaN(r) && r > 0);
    const counts = products.map(p => parseInt(p.reviews, 10) || 0).filter(c => c > 0);
    const prices = products.map(p => parseFloat(p.price) || 0).filter(p => p > 0);

    const C = getMedian(ratings) || 3.5;
    const m = Math.max(getPercentile(counts, 0.25), 10); // Minimum threshold of 10

    // Calculate max reviews for review volume bonus (used by value score)
    let maxReviews = 1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > maxReviews) maxReviews = counts[i];
    }

    // Calculate 25th percentile price for value scoring (aggressively favors cheap products)
    // Using 25th percentile means only the cheapest 25% get bonuses, 75% get penalties
    const p25Price = prices.length > 0 ? getPercentile(prices, 0.25) : 100;
    const refPrice = Math.max(p25Price, 1); // Ensure minimum of 1 to avoid division issues

    return { C, m, maxReviews, refPrice };
  }

  // Original Bayesian score
  function addBayesScore(products){
    const {C,m} = calcParams(products);
    products.forEach(p => {
      const R = parseFloat(p.rating);
      const v = parseInt(p.reviews,10);
      p.bayescore = (((v/(v+m))*R + (m/(v+m))*C) || 0).toFixed(3);
    });
    return products;
  }

  function addBayesScoreWithParams(products, params){
    const {C, m} = params;
    products.forEach(p => {
      const R = parseFloat(p.rating) || 0;
      const v = parseInt(p.reviews, 10) || 0;
      p.bayescore = (((v/(v+m))*R + (m/(v+m))*C) || 0).toFixed(3);
    });
    return products;
  }

  function calculateBayesScores(products){
    const {C,m} = calcParams(products);
    return products.map(p => {
      const R = parseFloat(p.rating);
      const v = parseInt(p.reviews,10) || 0;
      return ((v/(v+m))*R + (m/(v+m))*C).toFixed(3);
    });
  }

  // Enhanced Bayesian v2: Hybrid approach with rating quality multiplier
  // Fixes issue where 1-star products with few reviews get high scores
  function addEnhancedBayesScore(products) {
    const { C, m } = calcEnhancedParams(products);

    products.forEach(p => {
      const R = parseFloat(p.rating) || 0;
      const v = parseInt(p.reviews, 10) || 0;

      // Base Bayesian score
      const bayesian = ((v / (v + m)) * R + (m / (v + m)) * C) || 0;

      // Rating quality multiplier: penalizes ratings below 3.0
      // - Rating 5.0 → multiplier 1.0
      // - Rating 4.0 → multiplier 1.0
      // - Rating 3.0 → multiplier 1.0
      // - Rating 2.0 → multiplier 0.6
      // - Rating 1.0 → multiplier 0.2
      let ratingMultiplier = 1.0;
      if (R < 3.0) {
        // Smooth penalty curve: (R / 3)^2 ensures gradual penalty
        ratingMultiplier = Math.pow(R / 3, 2);
      }

      // Confidence factor: products with very few reviews (< 5) get reduced score
      // This prevents gaming with fake 5-star single reviews
      let confidenceFactor = 1.0;
      if (v < 5) {
        confidenceFactor = 0.5 + (v / 10); // 0.5 at 0 reviews, 0.9 at 4 reviews
      }

      // Final score: Bayesian × rating quality × confidence
      const finalScore = bayesian * ratingMultiplier * confidenceFactor;

      p.bayescore = Math.max(0, Math.min(5, finalScore)).toFixed(3);
    });
    return products;
  }

  // Wilson Score Lower Bound: Statistical confidence interval
  // Used by Reddit, accounts for uncertainty in ratings
  function addWilsonScore(products) {
    const z = 1.96; // 95% confidence

    products.forEach(p => {
      const rating = parseFloat(p.rating) || 0;
      const n = parseInt(p.reviews, 10) || 0;

      if (n === 0) {
        p.bayescore = '0.000';
        return;
      }

      // Convert 5-star rating to positive ratio (0-1)
      const phat = rating / 5;

      // Wilson Score Lower Bound formula
      const denominator = 1 + (z * z) / n;
      const center = phat + (z * z) / (2 * n);
      const spread = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);

      const lowerBound = (center - spread) / denominator;

      // Scale back to 5-star range
      p.bayescore = (lowerBound * 5).toFixed(3);
    });
    return products;
  }

  // Log-Adjusted: Bayesian + logarithmic bonus for review count
  function addLogAdjustedScore(products) {
    const { C, m } = calcParams(products);
    const counts = products.map(p => parseInt(p.reviews, 10) || 0);
    const maxReviews = Math.max(...counts, 1);

    products.forEach(p => {
      const R = parseFloat(p.rating) || 0;
      const v = parseInt(p.reviews, 10) || 0;

      // Standard Bayesian component
      const bayesian = ((v / (v + m)) * R + (m / (v + m)) * C) || 0;

      // Log-based review bonus (0 to 0.5 scale)
      const reviewBonus = v > 0
        ? 0.5 * (Math.log10(v + 1) / Math.log10(maxReviews + 1))
        : 0;

      // Combined score (capped at 5)
      p.bayescore = Math.min(5, bayesian + reviewBonus).toFixed(3);
    });
    return products;
  }

  // Value Score: Quality-per-dollar scoring for budget shoppers
  // Favors products with: many reviews, high ratings, low price
  // Two-phase: calculate raw scores, then normalize to 0-5 range
  function addValueScore(products) {
    const { C, m, maxReviews, refPrice } = calcEnhancedParams(products);
    const refOffset = refPrice * 0.1;

    // Phase 1: Calculate raw scores (no capping)
    const rawScores = [];
    products.forEach((p, idx) => {
      const R = parseFloat(p.rating) || 0;
      const v = parseInt(p.reviews, 10) || 0;
      const price = parseFloat(p.price) || 0;

      // Base quality: Enhanced Bayesian score
      const bayesian = ((v / (v + m)) * R + (m / (v + m)) * C) || 0;

      // Rating quality multiplier (penalizes ratings below 3.0)
      let ratingMultiplier = 1.0;
      if (R < 3.0) {
        ratingMultiplier = Math.pow(R / 3, 2);
      }

      // Confidence factor (reduces score for very few reviews)
      let confidenceFactor = 1.0;
      if (v < 5) {
        confidenceFactor = 0.5 + (v / 10);
      }

      // Review volume bonus
      const reviewBonus = v > 0
        ? 1 + 0.3 * (Math.log10(v + 1) / Math.log10(maxReviews + 1))
        : 1;

      const quality = bayesian * ratingMultiplier * confidenceFactor * reviewBonus;

      // Price adjustment (no capping yet)
      let rawScore = quality;
      if (price > 0) {
        const priceRatio = refPrice / (price + refOffset);
        const priceAdjustment = Math.log(priceRatio) * 0.8;
        rawScore = quality + priceAdjustment;
      }

      rawScores.push({ idx, rawScore, hasPrice: price > 0 });
    });

    // Phase 2: Normalize to 0-5 range based on actual min/max
    const scoresWithPrice = rawScores.filter(s => s.hasPrice);
    if (scoresWithPrice.length === 0) {
      // No products with price, just use quality scores
      products.forEach(p => {
        p.bayescore = Math.max(0, Math.min(5, parseFloat(p.rating) || 0)).toFixed(3);
      });
      return products;
    }

    const minScore = Math.min(...scoresWithPrice.map(s => s.rawScore));
    const maxScore = Math.max(...scoresWithPrice.map(s => s.rawScore));
    const range = maxScore - minScore || 1;

    rawScores.forEach(({ idx, rawScore, hasPrice }) => {
      if (hasPrice) {
        // Normalize to 0-5 range
        const normalized = ((rawScore - minScore) / range) * 5;
        products[idx].bayescore = Math.max(0, Math.min(5, normalized)).toFixed(3);
      } else {
        // No price: use quality score directly
        products[idx].bayescore = Math.max(0, Math.min(5, rawScore)).toFixed(3);
      }
    });

    return products;
  }

  // Premium Score: Adjusts review expectations based on price tier
  // Expensive products need fewer reviews to score well
  function addPremiumScore(products) {
    const { C, m } = calcEnhancedParams(products);

    products.forEach(p => {
      const R = parseFloat(p.rating) || 0;
      const v = parseInt(p.reviews, 10) || 0;
      const price = parseFloat(p.price) || 0;

      // Price tier adjustment for m (minimum review threshold)
      const tier = getPriceTier(price);
      const adjustedM = m * tier.multiplier;

      // Bayesian with adjusted m - expensive products need fewer reviews
      const bayesian = ((v / (v + adjustedM)) * R + (adjustedM / (v + adjustedM)) * C) || 0;

      // Rating quality multiplier (same as Enhanced)
      let ratingMultiplier = 1.0;
      if (R < 3.0) {
        ratingMultiplier = Math.pow(R / 3, 2);
      }

      // Confidence threshold also adjusts by price tier
      // Budget: need 5 reviews, Premium: need 3, Luxury: need 2
      let confidenceThreshold = 5;
      if (tier.tier === 'premium' || tier.tier === 'midrange') confidenceThreshold = 3;
      if (tier.tier === 'luxury') confidenceThreshold = 2;

      let confidenceFactor = 1.0;
      if (v < confidenceThreshold) {
        confidenceFactor = 0.5 + (v / (confidenceThreshold * 2));
      }

      const finalScore = bayesian * ratingMultiplier * confidenceFactor;

      p.bayescore = Math.max(0, Math.min(5, finalScore)).toFixed(3);
    });
    return products;
  }

  // Unified entry point for scoring
  function addScore(products, method, customParams) {
    switch (method) {
      case 'wilson':
        return addWilsonScore(products);
      case 'logadjusted':
        return addLogAdjustedScore(products);
      case 'enhanced':
        return addEnhancedBayesScore(products);
      case 'value':
        return addValueScore(products);
      case 'premium':
        return addPremiumScore(products);
      case 'custom':
        return addBayesScoreWithParams(products, customParams || { C: 3.5, m: 100 });
      case 'classic':
      default:
        return addBayesScore(products);
    }
  }

  // Calculate score for a single product (for previews) - DEPRECATED: use calculateSingleScoreWithCache
  function calculateSingleScore(product, method, allProducts, customParams) {
    // For backward compatibility, calculate params here (slow for large datasets)
    const cachedParams = calcParams(allProducts);
    const cachedEnhancedParams = calcEnhancedParams(allProducts);

    // Calculate max reviews with loop (avoid stack overflow)
    let cachedMaxReviews = 1;
    for (let i = 0; i < allProducts.length; i++) {
      const reviews = parseInt(allProducts[i].reviews, 10) || 0;
      if (reviews > cachedMaxReviews) cachedMaxReviews = reviews;
    }

    return calculateSingleScoreWithCache(product, method, cachedParams, cachedEnhancedParams, cachedMaxReviews, customParams);
  }

  // Optimized: Calculate score using pre-cached params (fast)
  function calculateSingleScoreWithCache(product, method, cachedParams, cachedEnhancedParams, cachedMaxReviews, customParams) {
    const tempProduct = { ...product };

    switch (method) {
      case 'wilson':
        // Wilson doesn't need dataset params - calculate directly
        const z = 1.96;
        const rating = parseFloat(tempProduct.rating) || 0;
        const n = parseInt(tempProduct.reviews, 10) || 0;
        if (n === 0) {
          tempProduct.bayescore = '0.000';
        } else {
          const phat = rating / 5;
          const denominator = 1 + (z * z) / n;
          const center = phat + (z * z) / (2 * n);
          const spread = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
          const lowerBound = (center - spread) / denominator;
          tempProduct.bayescore = (lowerBound * 5).toFixed(3);
        }
        break;

      case 'logadjusted':
        const { C, m } = cachedParams;
        const R = parseFloat(tempProduct.rating) || 0;
        const v = parseInt(tempProduct.reviews, 10) || 0;
        const bayesian = ((v / (v + m)) * R + (m / (v + m)) * C) || 0;
        const reviewBonus = v > 0 ? 0.5 * (Math.log10(v + 1) / Math.log10(cachedMaxReviews + 1)) : 0;
        tempProduct.bayescore = Math.min(5, bayesian + reviewBonus).toFixed(3);
        break;

      case 'enhanced': {
        const { C: eC, m: eM } = cachedEnhancedParams;
        const eR = parseFloat(tempProduct.rating) || 0;
        const eV = parseInt(tempProduct.reviews, 10) || 0;
        const eBayesian = ((eV / (eV + eM)) * eR + (eM / (eV + eM)) * eC) || 0;
        let eRatingMult = eR < 3.0 ? Math.pow(eR / 3, 2) : 1.0;
        let eConfidence = eV < 5 ? 0.5 + (eV / 10) : 1.0;
        tempProduct.bayescore = Math.max(0, Math.min(5, eBayesian * eRatingMult * eConfidence)).toFixed(3);
        break;
      }

      case 'value': {
        const { C: vC, m: vM, refPrice: vRefPrice } = cachedEnhancedParams;
        const vRef = vRefPrice || 100;
        const vRefOffset = vRef * 0.1;
        const vR = parseFloat(tempProduct.rating) || 0;
        const vV = parseInt(tempProduct.reviews, 10) || 0;
        const vPrice = parseFloat(tempProduct.price) || 0;
        const vBayesian = ((vV / (vV + vM)) * vR + (vM / (vV + vM)) * vC) || 0;
        let vRatingMult = vR < 3.0 ? Math.pow(vR / 3, 2) : 1.0;
        let vConfidence = vV < 5 ? 0.5 + (vV / 10) : 1.0;
        // Review volume bonus: reward products with many reviews
        const vReviewBonus = vV > 0
          ? 1 + 0.3 * (Math.log10(vV + 1) / Math.log10(cachedMaxReviews + 1))
          : 1;
        // Cap quality at 5 BEFORE price adjustment
        const vRawQuality = vBayesian * vRatingMult * vConfidence * vReviewBonus;
        const vQuality = Math.min(5, vRawQuality);
        if (vPrice <= 0) {
          tempProduct.bayescore = Math.max(0, vQuality).toFixed(3);
        } else {
          // Additive price adjustment using 25th percentile as reference
          const vPriceRatio = vRef / (vPrice + vRefOffset);
          const vPriceAdjustment = Math.log(vPriceRatio) * 0.8;
          tempProduct.bayescore = Math.max(0, Math.min(5, vQuality + vPriceAdjustment)).toFixed(3);
        }
        break;
      }

      case 'premium': {
        const { C: pC, m: pM } = cachedEnhancedParams;
        const pR = parseFloat(tempProduct.rating) || 0;
        const pV = parseInt(tempProduct.reviews, 10) || 0;
        const pPrice = parseFloat(tempProduct.price) || 0;
        const pTier = getPriceTier(pPrice);
        const pAdjustedM = pM * pTier.multiplier;
        const pBayesian = ((pV / (pV + pAdjustedM)) * pR + (pAdjustedM / (pV + pAdjustedM)) * pC) || 0;
        let pRatingMult = pR < 3.0 ? Math.pow(pR / 3, 2) : 1.0;
        let pConfThreshold = 5;
        if (pTier.tier === 'premium' || pTier.tier === 'midrange') pConfThreshold = 3;
        if (pTier.tier === 'luxury') pConfThreshold = 2;
        let pConfidence = pV < pConfThreshold ? 0.5 + (pV / (pConfThreshold * 2)) : 1.0;
        tempProduct.bayescore = Math.max(0, Math.min(5, pBayesian * pRatingMult * pConfidence)).toFixed(3);
        break;
      }

      case 'custom':
        addBayesScoreWithParams([tempProduct], customParams || { C: 3.5, m: 100 });
        break;

      case 'classic':
      default:
        addBayesScoreWithParams([tempProduct], cachedParams);
        break;
    }

    return tempProduct.bayescore;
  }

  return {
    // Original exports (backward compatibility)
    addBayesScore,
    addBayesScoreWithParams,
    calculateBayesScores,
    calcParams,
    // New exports
    calcEnhancedParams,
    addEnhancedBayesScore,
    addWilsonScore,
    addLogAdjustedScore,
    addValueScore,
    addPremiumScore,
    addScore,
    calculateSingleScore,
    calculateSingleScoreWithCache,
    getPercentile,
    getMedian,
    getPriceTier
  };
}));
