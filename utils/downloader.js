(function(root,factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.downloadUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){
  function downloadBlob(blob, filename){
    // For MV3 service workers we convert the blob to a data URL because
    // chrome.downloads.download does not support blob URLs directly.
    if(typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download){
      const reader = new FileReader();
      reader.onload = function(){
        const url = reader.result; // data: URL
        chrome.downloads.download({ url, filename, saveAs: true }, () => {
          if(chrome.runtime.lastError){
            console.error('Error al descargar:', chrome.runtime.lastError);
          }
        });
      };
      reader.readAsDataURL(blob);
    } else {
      const url = URL.createObjectURL(blob);
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
