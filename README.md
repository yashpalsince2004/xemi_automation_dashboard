# XEMI Automation Dashboard

A React + TypeScript dashboard for comparing flat files and Excel/CSV datasets, with shipping-bill-specific comparison flows and automated CHA export workflows.

---

## What This Project Does

This repository provides three main comparison experiences:

### 1. **Generic Compare**
- Upload two CSV or Excel files
- Auto-detect common columns
- Choose a key column for row alignment
- Compare rows, schema, and cell values
- View mismatch summaries and analytics

### 2. **SB Flat File Compare**
- Compare two shipping bill flat files
- Parse segment-based data using `SB_Tables.xlsx`
- Review table-by-table differences
- Export issue reports to Excel

### 3. **Export Compare (500+)**
- UI for running bulk shipping bill comparisons
- Displays file-level results and mismatch details
- Currently expects a backend endpoint at `/api/bulk-compare`

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | React 18, TypeScript, Vite |
| UI | Tailwind CSS, shadcn/ui, Radix UI |
| Charts | Recharts |
| File Parsing | xlsx (SheetJS) |
| Testing | Vitest, Testing Library |
| Automation | Node.js + Playwright (`cha_export/`) |

---

## Repository Structure

```
.
├── src/
│   ├── components/
│   │   ├── dashboard/          # Generic file comparison UI
│   │   │   ├── UploadZone.tsx
│   │   │   ├── KeyColumnSelector.tsx
│   │   │   ├── SummaryFunnel.tsx
│   │   │   ├── DetailPanel.tsx
│   │   │   └── AnalyticsWidgets.tsx
│   │   ├── sb-compare/         # Shipping-bill comparison UI
│   │   │   ├── SbUploadZone.tsx
│   │   │   ├── SbComparison.tsx
│   │   │   ├── SbGrid.tsx
│   │   │   ├── ExportSbDashboard.tsx
│   │   │   └── ImportSbDashboard.tsx
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── comparisonEngine.ts # Generic row/column comparison logic
│   │   ├── fileParser.ts       # CSV/XLS/XLSX parsing
│   │   └── sbParser.ts         # SB flat-file parsing and issue export
│   ├── pages/
│   │   └── Index.tsx           # Main app entry page
│   └── test/                   # Vitest tests
├── cha_export/                 # Playwright automation scripts
│   ├── auto_export_xl.js       # Batch export automation (500+ files)
│   ├── xl_to_json.js           # Excel to JSON conversion
│   ├── user_login.js           # Session management
│   ├── utils.js                # Shared utilities (retry, smartWait, etc.)
│   └── google_drive.js         # Google Drive integration (optional)
├── public/
│   └── SB_Tables.xlsx          # SB specification workbook
├── playwright.config.ts
├── vite.config.ts
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build
```

For development mode build:

```bash
npm run build:dev
```

### Test

```bash
npm run test
```

---

## Process & Flow

### Generic Compare Flow

```
1. Upload Files (File A + File B)
   ↓
2. Detect Common Columns
   ↓
3. Select Key Column (for row alignment)
   ↓
4. Compare Files
   ↓
5. Display Results
   ├── Summary Funnel (matched/mismatched/missing/extra)
   ├── Detail Panel (column-by-column mismatches)
   └── Analytics (match rates, failure categories)
```

### SB Flat File Compare Flow

```
1. Upload SB Flat Files (File A + File B)
   ↓
2. Load SB_Tables.xlsx Specification
   ↓
3. Parse Flat Files by <TABLE> Segments
   ↓
4. Compare Row-by-Row Within Each Segment
   ├── Mandatory Field Validation
   ├── Data Type Validation
   ├── Length Validation
   └── Value Comparison
   ↓
5. Export Issues (Excel format)
```

### CHA Export Automation Flow

```
auto_export_xl.js - Batch Processing Workflow

1. Read Input Files (from ./input_excel)
   ↓
2. Convert Excel → JSON (xl_to_json.js)
   ↓
3. Login to Xemi Portal (persistent session)
   ↓
4. For Each File:
   ├── Navigate to Export CCM
   ├── Click "Add Job"
   ├── Select Exporter (dropdown search)
   ├── Select Transport Mode (Sea/Air)
   ├── Upload Excel File
   ├── Handle Exchange Rates Popup
   ├── Multi-Step Form Navigation:
   │   ├── Shipment Details
   │   ├── Order Details
   │   ├── Product Details
   │   ├── Supporting Document
   │   └── Review
   ├── Download .sb Flat File Output
   └── Log Results (success/failed/missing fields)
   ↓
5. Generate Reports:
   ├── error_log.txt (step-level errors)
   ├── missing_fields_log.json
   └── Summary (files processed, success rate, duration)
```

---

## Comparison Engine Details

### Generic Comparison Logic (`comparisonEngine.ts`)

The comparison engine performs:

1. **Row Alignment**: Maps rows using the selected key column
2. **Schema Diff**: Identifies columns present in one file but not the other
3. **Mismatch Detection**: Compares cell values and categorizes failures:
   - **Type Mismatch**: Different data types in same column
   - **Value Mismatch**: Different values (same type)
   - **Null vs Value**: One file has null, other has value
   - **Row Missing**: Key exists in File A but not File B
   - **Extra Row**: Key exists in File B but not File A

4. **Metrics**:
   - Match rate per row
   - Column-wise mismatch counts
   - Failure category breakdown

### SB Comparison Logic (`sbParser.ts`)

The SB parser handles flat file format with segment tables:

1. **Spec Loading**: Reads `SB_Tables.xlsx` for field definitions
   - Field name, type (N=number), length, mandatory flag

2. **Flat File Parsing**: Parses `<TABLE>` delimited sections
   - Uses RS (Record Separator `\x1D`) as field delimiter

3. **Validation**:
   - Mandatory fields: Must not be empty for "M" flagged fields
   - Data type: Numeric validation for "N" type fields
   - Length: Field must not exceed defined length
   - Value comparison: Exact string match

4. **Issue Export**: Generates Excel with columns:
   - Segment, Field Name, Invoice Sr. Number, Item Sr Number, Serial No, A Value, B Value, Status

---

## CHA Export Automation

### Running the Automation

```bash
# Batch mode (all files in input directory)
node cha_export/auto_export_xl.js

# Single file mode
node cha_export/auto_export_xl.js --file=myfile.xlsx

# Google Drive setup instructions
node cha_export/auto_export_xl.js --google-setup

# Help
node cha_export/auto_export_xl.js --help
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | 0 | Max files per run (0 = all) |
| `INPUT_DIR` | `./input_excel` | Input folder path |
| `OUTPUT_SB_DIR` | `./output_sb` | SB output folder |
| `HEADLESS` | `false` | Run browser headless |
| `UPLOAD_WAIT_MS` | 60000 | Pause after upload (ms) |
| `BASE_URL` | - | Xemi portal base URL |

### Google Drive Integration (Optional)

To use Google Drive as input/output for your automation:

1. **Create Google Cloud Project** and enable Google Drive API
2. **Create OAuth 2.0 Credentials** (Desktop app type)
3. **Download credentials** and save as `cha_export/client_secret.json`

Set these environment variables:

| Variable | Description |
|----------|-------------|
| `USE_GOOGLE_DRIVE` | Set to `true` to enable Google Drive integration |
| `GOOGLE_INPUT_FOLDER_ID` | Google Drive folder ID containing input Excel files |
| `GOOGLE_OUTPUT_FOLDER_ID` | Google Drive folder ID for .sb output files |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (from credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (from credentials) |

**Setup command:**
```bash
node cha_export/auto_export_xl.js --google-setup
```

**Features:**
- Fetch Excel files from Google Drive automatically
- Upload .sb output files back to Google Drive
- Persistent token storage (first-time auth only)

### Automation Features

- **Persistent Session**: Login once, auto-relogin if expired
- **Fault Tolerant**: Skips problematic steps, never stops entire batch
- **Smart Waits**: Spinner/network detection instead of hardcoded delays
- **Retry Logic**: Exponential backoff on transient failures
- **Progress Tracking**: Real-time progress bar and summary
- **Missing Field Detection**: Logs fields required but missing from input

---

## License

Private - Xemi Technologies
