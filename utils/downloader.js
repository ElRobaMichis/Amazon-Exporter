(function(root,factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.downloadUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){
  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    if(typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download){
      chrome.downloads.download({ url, filename, saveAs: true }, () => {
        URL.revokeObjectURL(url);
        if(chrome.runtime.lastError){
          console.error('Error al descargar:', chrome.runtime.lastError);
        }
      });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  function downloadCsv(csv, filename){
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  return { downloadBlob, downloadCsv };
}));
