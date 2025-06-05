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
      const key = [p.title,p.rating,p.reviews,p.price,p.bayescore].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function toCsv(products){
    const bom = '﻿';
    
    // Excel table headers with proper formatting for auto-filtering
    const header = ['Name','Rating','Reviews','Price','Bayescore'];
    
    // Format data for Excel with proper data types
    const rows = products.map(p => [
      p.title || '',
      parseFloat(p.rating) || 0,  // Numeric for proper sorting
      parseInt(p.reviews) || 0,   // Numeric for proper sorting
      parseFloat(p.price) || 0,   // Numeric for proper sorting
      parseFloat(p.bayescore) || 0 // Numeric for proper sorting
    ].map(v => {
      // Handle different data types for CSV
      if (typeof v === 'number') {
        return v.toString();
      }
      return `"${v.toString().replace(/"/g,'""')}"`;
    }).join(','));
    
    // Create CSV content with BOM for proper Excel encoding
    const csvContent = bom + header.join(',') + '\n' + rows.join('\n');
    
    return csvContent;
  }

  function toTable(products){
    const header = ['Name','Description','Rating','Reviews','Price','Bayescore'];
    
    const headerRow = header.map(h => `<th>${h}</th>`).join('');
    
    const rows = products.map(p => {
      const cells = [
        p.title || '',
        p.description || 'No aplica',
        p.rating || '0',
        p.reviews || '0',
        p.price || '0',
        p.bayescore || '0'
      ].map(v => `<td>${v.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('');
      
      return `<tr>${cells}</tr>`;
    }).join('\n');
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Amazon Products Export</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        tr:hover { background-color: #f5f5f5; }
        .title { color: #333; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1 class="title">Amazon Products Export</h1>
    <table>
        <thead>
            <tr>${headerRow}</tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>
</body>
</html>`;
  }

  function toExcel(products) {
    // Create Excel XML format with native table formatting
    const header = ['Name','Description','Rating','Reviews','Price','Bayescore'];
    
    // XML header for Excel workbook
    const xmlHeader = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">`;

    // Define styles for header and data
    const styles = `<Styles>
 <Style ss:ID="HeaderStyle">
  <Font ss:Bold="1"/>
  <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
  <Font ss:Color="#FFFFFF"/>
  <Borders>
   <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
 </Style>
 <Style ss:ID="DataStyle">
  <Borders>
   <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
 </Style>
 <Style ss:ID="NumberStyle">
  <NumberFormat ss:Format="0.00"/>
  <Borders>
   <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
   <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
 </Style>
</Styles>`;

    // Create worksheet with table
    const worksheetHeader = `<Worksheet ss:Name="Amazon Products">
 <Table>`;

    // Create header row
    const headerRow = `  <Row>
${header.map(h => `   <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${h}</Data></Cell>`).join('\n')}
  </Row>`;

    // Create data rows
    const dataRows = products.map(p => {
      const cells = [
        `   <Cell ss:StyleID="DataStyle"><Data ss:Type="String">${(p.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`,
        `   <Cell ss:StyleID="DataStyle"><Data ss:Type="String">${(p.description || 'No aplica').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`,
        `   <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${parseFloat(p.rating) || 0}</Data></Cell>`,
        `   <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${parseInt(p.reviews) || 0}</Data></Cell>`,
        `   <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${parseFloat(p.price) || 0}</Data></Cell>`,
        `   <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${parseFloat(p.bayescore) || 0}</Data></Cell>`
      ];
      return `  <Row>\n${cells.join('\n')}\n  </Row>`;
    }).join('\n');

    // Add AutoFilter to make it a native Excel table
    const autoFilter = `  <AutoFilter x:Range="R1C1:R${products.length + 1}C${header.length}" xmlns="urn:schemas-microsoft-com:office:excel">
  </AutoFilter>`;

    const worksheetFooter = ` </Table>
 <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
  <Selected/>
  <FreezePanes/>
  <FrozenNoSplit/>
  <SplitHorizontal>1</SplitHorizontal>
  <TopRowBottomPane>1</TopRowBottomPane>
  <ActivePane>2</ActivePane>
 </WorksheetOptions>
</Worksheet>`;

    const xmlFooter = `</Workbook>`;

    // Combine all parts
    const excelXml = [
      xmlHeader,
      styles,
      worksheetHeader,
      headerRow,
      dataRows,
      autoFilter,
      worksheetFooter,
      xmlFooter
    ].join('\n');

    return excelXml;
  }

  return { deduplicate, toCsv, toTable, toExcel };
}));
