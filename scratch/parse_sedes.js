const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const regPath = path.join(__dirname, '..', 'docs', 'sede_regional.xlsx');
const jurisPath = path.join(__dirname, '..', 'docs', 'sede_jurisdiccional.xlsx');

const regWb = XLSX.readFile(regPath);
const regSheet = regWb.Sheets[regWb.SheetNames[0]];
const regRows = XLSX.utils.sheet_to_json(regSheet);

const regionals = regRows.map(r => ({
  id: String(r['ID SEDE REGIONAL']).trim().padStart(2, '0'),
  nombre: String(r['SEDE REGIONAL {Usuario}']).trim().toUpperCase()
}));

const jurisWb = XLSX.readFile(jurisPath);
const jurisSheet = jurisWb.Sheets[jurisWb.SheetNames[0]];
const jurisRows = XLSX.utils.sheet_to_json(jurisSheet);

const jurisdictions = jurisRows.map(r => {
  const regId = String(r['ID SEDE REGIONAL']).trim().padStart(2, '0');
  const regNombre = String(r['SEDE REGIONAL']).trim().toUpperCase();
  const jurisId = String(r['ID SEDE JURISDICCIONAL']).trim().padStart(2, '0');
  const jurisNombre = String(r['SEDE JURISDICCIONAL']).trim().toUpperCase();
  return {
    id: `${regId}-${jurisId}`,
    sede_regional_id: regId,
    sede_regional_nombre: regNombre,
    codigo_juris: jurisId,
    nombre: jurisNombre
  };
});

const data = { regionals, jurisdictions };
fs.writeFileSync(path.join(__dirname, '..', 'backend', 'src', 'data', 'sedes.json'), JSON.stringify(data, null, 2));
console.log('JSON file created with regionals count:', regionals.length, 'and jurisdictions count:', jurisdictions.length);
