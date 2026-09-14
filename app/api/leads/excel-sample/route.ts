import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface ExcelLeadRow {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  source: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const targetRep = searchParams.get("rep") || "";

    const filePath = path.join(process.cwd(), "MD&ZAID.xlsx");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: "ملف الإكسل MD&ZAID.xlsx غير موجود في النظام." },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });

    const leads: ExcelLeadRow[] = [];
    const seenPhones = new Set<string>();

    // Scan sheets in reverse to get the freshest data first
    const sheetNames = [...wb.SheetNames].reverse();

    for (const sname of sheetNames) {
      if (leads.length >= limit) break;
      const sheet = wb.Sheets[sname];
      if (!sheet) continue;

      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Identify header index
      let headerRowIndex = 1;
      for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const row = rawRows[i];
        if (row && (row.includes("رقم الهاتف") || row.includes("اسم الزبون") || row.includes("اسم العميل"))) {
          headerRowIndex = i;
          break;
        }
      }

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        if (leads.length >= limit) break;
        const row = rawRows[r];
        if (!row) continue;

        const rawName = row[5];
        const rawPhone = row[6] ? String(row[6]).trim() : "";
        const rawRep = row[7] ? String(row[7]).trim() : "";
        const rawAddress = row[10] ? String(row[10]).trim() : "";
        const rawNotes = row[15] ? String(row[15]).trim() : (row[9] ? String(row[9]).trim() : "");

        // Filter by rep if specified and valid
        if (targetRep && rawRep && !rawRep.includes(targetRep)) {
          // keep scanning
        }

        const cleanPhone = rawPhone.replace(/[^\d+]/g, "");
        if (rawName && cleanPhone.length >= 9 && !seenPhones.has(cleanPhone)) {
          seenPhones.add(cleanPhone);

          // Extract probable city from address
          let city = "عمان";
          const cities = ["عمان", "الزرقاء", "إربد", "العقبة", "السلط", "المفرق", "مادبا", "جرش", "عجلون", "الكرك", "الطفيلة", "معان", "دير علا", "طبربور", "صويلح", "الرصيفة", "سحاب"];
          for (const c of cities) {
            if (rawAddress.includes(c)) {
              city = c;
              break;
            }
          }

          leads.push({
            id: `excel_${Date.now()}_${leads.length + 1}`,
            name: String(rawName).trim(),
            phone: cleanPhone,
            city,
            address: rawAddress || "عمان",
            notes: rawNotes ? `طلب سابق: ${rawNotes}` : "ليد مستورد من شيت إكسل",
            source: `Excel (${sname})`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: leads.length,
      limit,
      leads,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "فشل قراءة بيانات الإكسل: " + error.message },
      { status: 500 }
    );
  }
}
