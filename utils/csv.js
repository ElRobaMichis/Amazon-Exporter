(function(root,factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.csvUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){
  function deduplicate(products){
    const seen = new Set();
    return products.filter(p => {
      const key = [p.title,p.description,p.rating,p.reviews,p.price,p.bayescore].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function toCsv(products){
    const bom = '\uFEFF';
    const header = ['title','description','rating','reviews','price','bayescore'];
    const rows = products.map(p => [
      p.title,
      p.description,
      p.rating,
      p.reviews,
      p.price,
      p.bayescore
    ].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
    return bom + header.join(',') + '\n' + rows.join('\n');
  }

  return { deduplicate, toCsv };
}));
