import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

/**
 * Convert a single Excel file to JSON.
 * @param {string} filePath - Absolute or relative path to the Excel file.
 * @param {string} outputDir - Directory to write the JSON output.
 * @returns {{ success: boolean, outputPath?: string, error?: string }}
 */
export const convertSingleExcelToJson = (filePath, outputDir = './input_json') => {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = path.basename(filePath, path.extname(filePath));
    const workbook = xlsx.readFile(filePath);

    const allSheets = {};
    workbook.SheetNames.forEach(sheet => {
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], {
        defval: null
      });
      allSheets[sheet] = data;
    });

    const outputPath = path.join(outputDir, `${fileName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(allSheets, null, 2));

    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Bulk-convert all Excel files in a directory to JSON.
 * Retained for backward compatibility.
 */
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
    const result = convertSingleExcelToJson(filePath, jsonDir);

    if (result.success) {
      console.log(`✅ Converted: ${file}`);
    } else {
      console.error(`❌ Failed to convert: ${file} — ${result.error}`);
    }
  }
};