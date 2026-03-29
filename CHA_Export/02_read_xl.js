import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

export const convertExcelToJson = () => {
  const excelDir = './input_excel';
  const jsonDir = './input_json';

  if (!fs.existsSync(jsonDir)) {
    fs.mkdirSync(jsonDir, { recursive: true });
  }

  const files = fs.readdirSync(excelDir).filter(f =>
    f.endsWith('.xlsx') || f.endsWith('.xls')
  );

  console.log(`📊 Found ${files.length} Excel files`);

  for (const file of files) {
    const filePath = path.join(excelDir, file);
    const fileName = path.basename(file, path.extname(file));

    const workbook = xlsx.readFile(filePath);

    const allSheets = {};

    workbook.SheetNames.forEach(sheet => {
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], {
        defval: null
      });
      allSheets[sheet] = data;
    });

    fs.writeFileSync(
      path.join(jsonDir, `${fileName}.json`),
      JSON.stringify(allSheets, null, 2)
    );

    console.log(`✅ Converted: ${file}`);
  }
};