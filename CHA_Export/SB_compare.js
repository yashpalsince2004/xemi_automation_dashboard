import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const RS = String.fromCharCode(29);

const SKIP_COMPARE_FIELDS = new Set([
  "MESSAGE TYPE",
  "CUSTOM HOUSE CODE",
  "USER JOB NO.",
  "USER JOB DATE"
]);

function normalizeTableName(name) {
  name = name.trim().toUpperCase();
  if (name === "ITEMS" || name === "ITEM") return "ITEM";
  return name;
}

function norm(v) {
  if (v === undefined || v === null) return "";
  return v.toString().trim();
}

function isNumber(v) {
  return /^-?\d+(\.\d+)?$/.test(v);
}

function loadSbSpecs(specPath) {
  const wb = xlsx.readFile(specPath);
  const sbSpecs = {};

  wb.SheetNames.forEach(sh => {
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sh], { header: 1 });
    if (!rows.length) return;

    const h = rows[0] || [];
    let colIndexes = {
      cap: h.findIndex(v => /field/i.test(v?.toString() || "")),
      type: h.findIndex(v => /type/i.test(v?.toString() || "")),
      len: h.findIndex(v => /length?/i.test(v?.toString() || "")),
      final: h.findIndex(v => /mandatory|final/i.test(v?.toString() || "")),
    };

    if (colIndexes.cap === -1) colIndexes.cap = 0;
    if (colIndexes.type === -1) colIndexes.type = 1;
    if (colIndexes.len === -1) colIndexes.len = 2;
    if (colIndexes.final === -1) colIndexes.final = 3;

    const fields = rows.slice(1).filter(r => r && r.length).map(r => {
      const lenVal = parseInt(r[colIndexes.len]);
      return {
        cap: (r[colIndexes.cap] || "").toString(),
        type: (r[colIndexes.type] || "").toString(),
        len: isNaN(lenVal) ? null : lenVal,
        final: ("" + (r[colIndexes.final] || "")).toUpperCase().startsWith('M') ? "M" : ""
      };
    });

    const normName = normalizeTableName(sh);
    sbSpecs[normName] = fields;
    if (normName === "ITEM") sbSpecs["ITEMS"] = fields;
    if (normName === "ITEMS") sbSpecs["ITEM"] = fields;
  });

  return sbSpecs;
}

function parseSbFlat(text, specs) {
  const lines = text.split(/\r?\n/);
  const dataBySeg = {};
  let currentSeg = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    
    if (t.startsWith('<TABLE>')) {
      let segName = t.replace('<TABLE>', '').trim().toUpperCase();
      segName = normalizeTableName(segName);
      currentSeg = segName;
      if (!dataBySeg[currentSeg]) dataBySeg[currentSeg] = [];
      continue;
    }
    
    if (currentSeg && !t.startsWith('<')) {
      let row = t.split(RS);
      const expectedLen = specs[currentSeg]?.length || row.length;
      while (row.length < expectedLen) {
        row.push("");
      }
      dataBySeg[currentSeg].push(row);
    }
  }

  if (dataBySeg["ITEM"] && !dataBySeg["ITEMS"]) dataBySeg["ITEMS"] = dataBySeg["ITEM"];
  if (dataBySeg["ITEMS"] && !dataBySeg["ITEM"]) dataBySeg["ITEM"] = dataBySeg["ITEMS"];

  return dataBySeg;
}

function getDiffStatus(va, vb, s) {
  const a = norm(va);
  const b = norm(vb);

  if (s.final === "M" && (!a || !b)) return "mandatory missing";
  if (s.type === "N" && ((a && !isNumber(a)) || (b && !isNumber(b)))) return "type mismatch";
  if (s.len && ((a && a.length > s.len) || (b && b.length > s.len))) return "length exceeded";
  if (a !== b) return "value mismatch";

  return null;
}

export async function compareBulk(dirA, dirB, specPath) {
  if (!fs.existsSync(dirA)) fs.mkdirSync(dirA, { recursive: true });
  if (!fs.existsSync(dirB)) fs.mkdirSync(dirB, { recursive: true });
  
  const specs = loadSbSpecs(specPath);

  const filesA = fs.readdirSync(dirA).filter(f => f.endsWith('.sb') || f.endsWith('.txt'));
  const filesB = fs.readdirSync(dirB).filter(f => f.endsWith('.sb') || f.endsWith('.txt'));

  // Determine pairs
  const pairs = [];
  
  if (filesA.length === 1 && filesB.length === 1) {
    // Special Rule: If exactly one file exists in both, compare them regardless of naming
    pairs.push({
      fileA: filesA[0],
      fileB: filesB[0],
      displayFile: Object.is(filesA[0], filesB[0]) ? filesA[0] : `${filesA[0]} vs ${filesB[0]}`
    });
  } else {
    // Normal Rule: Match based on basename, assuming dirB has 'x' prefix
    const baseNamesA = filesA;
    const baseNamesB = filesB.map(f => f.startsWith('x') ? f.slice(1) : f);
    const allFiles = Array.from(new Set([...baseNamesA, ...baseNamesB]));
    
    for (const file of allFiles) {
      pairs.push({
        fileA: file,
        fileB: `x${file}`,
        displayFile: file
      });
    }
  }

  const results = [];

  for (const pair of pairs) {
    const pathA = path.join(dirA, pair.fileA);
    const pathB = path.join(dirB, pair.fileB);

    const existsA = fs.existsSync(pathA);
    const existsB = fs.existsSync(pathB);

    if (!existsA || !existsB) {
      results.push({
        fileName: pair.displayFile,
        hasError: true,
        summary: `Missing file in ${existsA ? `Dir B (expected ${pair.fileB})` : `Dir A (expected ${pair.fileA})`}`,
        mismatches: []
      });
      continue;
    }

    const textA = fs.readFileSync(pathA, 'utf-8');
    const textB = fs.readFileSync(pathB, 'utf-8');

    const parsedA = parseSbFlat(textA, specs);
    const parsedB = parseSbFlat(textB, specs);

    const mismatches = [];
    let hasError = false;

    // Compare
    const segmentNames = Object.keys(specs);
    segmentNames.forEach(segment => {
      const spec = specs[segment];
      const rowsA = parsedA[segment] || [];
      const rowsB = parsedB[segment] || [];
      const maxRows = Math.max(rowsA.length, rowsB.length);

      for (let i = 0; i < maxRows; i++) {
        spec.forEach((colSpec, idx) => {
          if (SKIP_COMPARE_FIELDS.has(norm(colSpec.cap).toUpperCase())) return;

          const va = rowsA[i]?.[idx] ?? "";
          const vb = rowsB[i]?.[idx] ?? "";

          const status = getDiffStatus(va, vb, colSpec);
          
          if (status) {
            hasError = true;
            mismatches.push({
              segment,
              rowIdx: i + 1,
              field: colSpec.cap,
              valA: va,
              valB: vb,
              issue: status
            });
          }
        });
      }
    });

    results.push({
      fileName: pair.displayFile,
      hasError,
      summary: hasError ? `${mismatches.length} mismatches found` : 'Perfect match',
      mismatches
    });
  }

  // Sort: errors first
  results.sort((a, b) => (a.hasError === b.hasError ? 0 : a.hasError ? -1 : 1));

  return results;
}
