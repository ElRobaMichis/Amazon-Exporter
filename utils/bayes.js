(function(root,factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.bayesUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){
  function calcParams(products){
    const ratings = products.map(p => parseFloat(p.rating));
    const counts = products.map(p => parseInt(p.reviews,10) || 0);
    const C = ratings.reduce((a,b)=>a+b,0) / (ratings.length || 1);
    const m = counts.reduce((a,b)=>a+b,0) / (counts.length || 1);
    return {C,m};
  }

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

  return { addBayesScore, addBayesScoreWithParams, calculateBayesScores, calcParams };
}));
