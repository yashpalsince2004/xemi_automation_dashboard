import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

// =====================================================
// 📂 PATHS
// =====================================================
const inputPath = './input_json/SB_output.json';
const outputPath = './Output_json/xSB_output.json';
const reportPath = './comparison/final_report.xlsx';

// =====================================================
// 🔑 MAPPINGS
// =====================================================

// GENERAL Mapping
const generalMapping = {
    Exporter_Name: 'impExpName',
    Branch_Name_Sr_No: 'branchSrNo',
    AD_Code: 'authorizedDealerCode',
    Exporter_Type: 'typeOfExporter',
    Mode_Of_Transport: 'modeOfTransport',
    Custom_House: 'portOfLoading',
    Port_of_Discharge: 'portOfDischarge',
    Country_of_Discharge: 'countryOfDischarge',
    Port_of_Destination: 'destinationPort',
    Country_of_Destination: 'countryOfDestination',
    SB_Type: 'sbType',
    Consignee_Name: 'consigneeName',
    Consignee_Address: 'consigneeAddress1',
    Consignee_Country: 'consigneeCountry',
    Consignee_Buyer_Same: 'consigneeBuyerSame',
    Consignor_Manufacturer_Same_for_All_Items: 'consignorManufacturerSameForAllItems',
    NFEI: 'nfeiCategory',
    Warehouse_Code: 'warehouseCode',
    SEZ_Unit_Code: 'sezUnitCode',
    Drawback_Beneficiary: 'drawbackBeneficiary',
    Nature_of_Cargo: 'natureOfCargo',
    Seal_Type: 'sealType',
    Gross_Weight: 'grossWeight',
    Type: 'type',
    Net_Weight: 'netWeight',
    RBI_Waiver_No: 'rbiWaiverNumber',
    RBI_Waiver_Date: 'rbiWaiverDate',
    EPZ_Code: 'epzCode',
    No_of_Packages: 'totalNoOfPackages',
    Pkg_Unit: 'unitOfMeasurement',
    Loose_Packages: 'loosePackages',
    Rotation_No: 'rotationNo',
    Rotation_Date: 'rotationDate',
    Is_Factory_Stuffed: 'isFactoryStuffed',
    Is_Sample_Accompanied: 'isSampleAccompanied',
    'Marks_&_Numbers': 'marksAndNumbers',
    EOU_Company_Name: 'eouCompanyName',
    EOU_IEC_Number: 'eouIecNumber',
    EOU_Company_Address: 'eouCompanyAddress',
    Examiner: 'examiner',
    Examiner_Designation: 'examinerDesignation',
    Examination_Date: 'examinationDate',
    Supervisor: 'supervisor',
    Supervisor_Designation: 'supervisorDesignation',
    Seal_No: 'sealNo',
    Commissionerate: 'commissionerate',
    Division: 'division',
    Range: 'range',
    Is_Verified_by_Examining_Officer: 'isVerifiedByExaminingOfficer',
    Sample_Forward: 'sampleForward'
};

// ORDERS Mapping
const orderMapping = {
    Inv_Sr_No: 'invoiceSerialNumber',
    Invoice_Number: 'invoiceNumber',
    Date: 'invoiceDate',
    TOI: 'termsOfInvoice',
    Currency: 'currency'
};

// ITEMS Mapping
const itemMapping = {
    Inv_Sr_No: 'invoiceSerialNumber',
    Item_Sr_No: 'itemSerialNumberInvoice',
    Qty: 'quantity',
    Unit_Price: 'unitPrice',
    Per: 'per',
    HSN_Code: 'hsCode',
    Unit: 'hsnUnit'
};

// =====================================================
// 🔥 NORMALIZE VALUE
// =====================================================
const normalize = (v) => {
    if (v === null || v === undefined) return '';
    return String(v).trim().toLowerCase();
};

// =====================================================
// 🔥 MAP KEYS
// =====================================================
function mapKeys(obj, mapping) {
    const res = {};
    for (let key in obj) {
        const mapped = mapping[key] || key;
        res[mapped] = obj[key];
    }
    return res;
}

// =====================================================
// 🔥 GENERAL NORMALIZATION
// =====================================================
function normalizeGeneralInput(data) {
    return mapKeys(data.GENERAL?.[0] || {}, generalMapping);
}

function normalizeGeneralOutput(data) {
    return data.master?.sbModel?.[0] || {};
}

// =====================================================
// 🔥 ORDER NORMALIZATION
// =====================================================
function normalizeOrdersInput(data) {
    const result = {};
    (data.ORDERS || []).forEach(order => {
        const key = `INV_${order.Inv_Sr_No}`;
        result[key] = mapKeys(order, orderMapping);
    });
    return result;
}

function normalizeOrdersOutput(data) {
    const result = {};
    (data.master?.invoiceModel || []).forEach(order => {
        const key = `INV_${order.invoiceSerialNumber}`;
        result[key] = order;
    });
    return result;
}

// =====================================================
// 🔥 ITEM NORMALIZATION
// =====================================================
function normalizeItemsInput(data) {
    const result = {};
    (data.ITEMS || []).forEach(item => {
        const key = `INV_${item.Inv_Sr_No}_ITEM_${item.Item_Sr_No}`;
        result[key] = mapKeys(item, itemMapping);
    });
    return result;
}

function normalizeItemsOutput(data) {
    const result = {};
    (data.master?.itemModel || []).forEach(item => {
        const key = `INV_${item.invoiceSerialNumber}_ITEM_${item.itemSerialNumberInvoice}`;
        result[key] = item;
    });
    return result;
}

// =====================================================
// 🔥 GENERIC COMPARE FUNCTION
// =====================================================
function compareSection(sectionName, input, output) {
    const diffs = [];
    const matches = [];

    const allGroups = new Set([
        ...Object.keys(input),
        ...Object.keys(output)
    ]);

    for (let group of allGroups) {
        const inObj = input[group] || {};
        const outObj = output[group] || {};

        const allKeys = new Set([
            ...Object.keys(inObj),
            ...Object.keys(outObj)
        ]);

        for (let key of allKeys) {
            const valA = inObj[key];
            const valB = outObj[key];

            if (normalize(valA) === normalize(valB)) {
                matches.push({
                    Section: sectionName,
                    Group: group,
                    Field: key,
                    Input: valA || '',
                    Output: valB || '',
                    Status: 'MATCH'
                });
            } else {
                diffs.push({
                    Section: sectionName,
                    Group: group,
                    Field: key,
                    Input: valA ?? '⚠️ MISSING',
                    Output: valB ?? '⚠️ MISSING',
                    Status:
                        valA === undefined
                            ? 'Missing in Input'
                            : valB === undefined
                            ? 'Missing in Output'
                            : 'Mismatch'
                });
            }
        }
    }

    return { diffs, matches };
}

// =====================================================
// 📊 GENERATE EXCEL
// =====================================================
function generateExcel(allDiffs, summary) {
    const wb = xlsx.utils.book_new();

    // Create folder if missing
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // -------- SUMMARY --------
    const summarySheet = xlsx.utils.json_to_sheet([
        { Metric: 'Total Differences', Value: allDiffs.length },
        { Metric: 'Match %', Value: summary.matchPercentage + '%' }
    ]);

    xlsx.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // -------- DIFFERENCES --------
    const diffSheet = xlsx.utils.json_to_sheet(allDiffs);
    xlsx.utils.book_append_sheet(wb, diffSheet, 'Differences');

    xlsx.writeFile(wb, reportPath);

    console.log(`\n📊 Excel Generated: ${reportPath}`);
}

// =====================================================
// 🚀 MAIN
// =====================================================
function main() {
    const inputJson = JSON.parse(fs.readFileSync(inputPath));
    const outputJson = JSON.parse(fs.readFileSync(outputPath));

    // Normalize all sections
    const genIn = normalizeGeneralInput(inputJson);
    const genOut = normalizeGeneralOutput(outputJson);

    const ordIn = normalizeOrdersInput(inputJson);
    const ordOut = normalizeOrdersOutput(outputJson);

    const itemIn = normalizeItemsInput(inputJson);
    const itemOut = normalizeItemsOutput(outputJson);

    // Compare
    const genRes = compareSection('GENERAL', { GENERAL: genIn }, { GENERAL: genOut });
    const ordRes = compareSection('ORDERS', ordIn, ordOut);
    const itemRes = compareSection('ITEMS', itemIn, itemOut);

    const allDiffs = [
        ...genRes.diffs,
        ...ordRes.diffs,
        ...itemRes.diffs
    ];

    const totalFields =
        genRes.matches.length +
        ordRes.matches.length +
        itemRes.matches.length +
        allDiffs.length;

    const matchPercentage = (
        ((totalFields - allDiffs.length) / totalFields) *
        100
    ).toFixed(2);

    generateExcel(allDiffs, { matchPercentage });

    console.log('\n✅ DONE');
}

main();