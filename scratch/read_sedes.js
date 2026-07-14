const XLSX = require('xlsx');
const path = require('path');

const regPath = path.join(__dirname, '..', 'docs', 'sede_regional.xlsx');
const jurisPath = path.join(__dirname, '..', 'docs', 'sede_jurisdiccional.xlsx');

console.log('Reading Sede Regional...');
const regWb = XLSX.readFile(regPath);
const regSheet = regWb.Sheets[regWb.SheetNames[0]];
const regData = XLSX.utils.sheet_to_json(regSheet);
console.log('Sede Regional count:', regData.length);
console.log('First 3 Regional:', regData.slice(0, 3));

console.log('Reading Sede Jurisdiccional...');
const jurisWb = XLSX.readFile(jurisPath);
const jurisSheet = jurisWb.Sheets[jurisWb.SheetNames[0]];
const jurisData = XLSX.utils.sheet_to_json(jurisSheet);
console.log('Sede Jurisdiccional count:', jurisData.length);
console.log('First 3 Juris:', jurisData.slice(0, 3));
