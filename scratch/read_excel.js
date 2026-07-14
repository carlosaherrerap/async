const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'docs', 'MARCO06_PRUEBA_PRESELECCIÓN_V.10.xlsx');
console.log('Reading file from:', filePath);

const workbook = XLSX.readFile(filePath);
console.log('Sheet names:', workbook.SheetNames);

// Let's inspect the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
console.log('First 5 rows of sheet:', sheetName);
console.log(json.slice(0, 5));
