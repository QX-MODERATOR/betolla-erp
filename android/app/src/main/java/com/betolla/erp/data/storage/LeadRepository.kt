package com.betolla.erp.data.storage

import android.content.Context
import com.betolla.erp.data.model.Lead
import com.betolla.erp.data.model.Order
import com.betolla.erp.data.model.Product
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class LeadRepository(context: Context) {
    private val prefs = context.getSharedPreferences("betolla_leads_data", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val defaultLeads = listOf(
        Lead(
            id = "lead-01",
            name = "سدين غنايم",
            phone = "0793937385",
            city = "عمان - طبربور",
            address = "قرب دوار المشاغل، عمارة 14، الطابق الثاني",
            scheduledTime = "10:30 AM",
            lastCall = "أمس 04:15 PM",
            totalCalls = 3,
            notes = "مهتمة ببروتين الشعر وسيروم الأرجان، طلبت معرفة طريقة التقسيط عبر كليك",
            nextCallDate = "اليوم 10:30 AM"
        ),
        Lead(
            id = "lead-02",
            name = "رانية العبداللات",
            phone = "0788123456",
            city = "عمان - خلدا",
            address = "بجانب مجمع النعيمات التجاري",
            scheduledTime = "11:15 AM",
            lastCall = "منذ يومين",
            totalCalls = 2,
            notes = "طلبت إعادة الاتصال للتأكيد على تفاصيل شامبو الكيراتين الخالي من السلفات",
            nextCallDate = "اليوم 11:15 AM"
        ),
        Lead(
            id = "lead-03",
            name = "هدى الزعبي",
            phone = "0795554321",
            city = "إربد - الحي الشرقي",
            address = "شارع الجامعة، بناية الأمل",
            scheduledTime = "12:00 PM",
            lastCall = "03/09/2026",
            totalCalls = 4,
            notes = "صالون تجميل - استفسار عن بكج المشاغل والبروتين العلاجي 1000 مل",
            nextCallDate = "اليوم 12:00 PM"
        ),
        Lead(
            id = "lead-04",
            name = "ميسون حداد",
            phone = "0776789012",
            city = "الزرقاء - الزرقاء الجديدة",
            address = "شارع 36، مقابل مدرسة الإخوة",
            scheduledTime = "01:30 PM",
            lastCall = "05/09/2026",
            totalCalls = 1,
            notes = "عميلة سابقة، استفسار عن عروض التوصيل المجاني للزرقاء",
            nextCallDate = "اليوم 01:30 PM"
        ),
        Lead(
            id = "lead-05",
            name = "فرح النجار",
            phone = "0792223344",
            city = "عمان - عبدون",
            address = "قرب السفارة البريطانية",
            scheduledTime = "02:45 PM",
            lastCall = "07/09/2026",
            totalCalls = 2,
            notes = "تجهيز طلبية ماسك وسيروم أرجان قبل نهاية الأسبوع",
            nextCallDate = "اليوم 02:45 PM"
        )
    )

    fun getLeads(): MutableList<Lead> {
        val json = prefs.getString("leads_list", null) ?: return defaultLeads.toMutableList()
        val type = object : TypeToken<MutableList<Lead>>() {}.type
        return try {
            gson.fromJson(json, type) ?: defaultLeads.toMutableList()
        } catch (e: Exception) {
            defaultLeads.toMutableList()
        }
    }

    fun saveLeads(leads: List<Lead>) {
        prefs.edit().putString("leads_list", gson.toJson(leads)).apply()
    }

    fun updateLeadNotes(leadId: String, notes: String, nextCallDate: String) {
        val leads = getLeads()
        val lead = leads.find { it.id == leadId }
        if (lead != null) {
            lead.notes = notes
            lead.nextCallDate = nextCallDate
            lead.totalCalls += 1
            saveLeads(leads)
        }
    }

    fun addLead(lead: Lead) {
        val leads = getLeads()
        leads.add(0, lead)
        saveLeads(leads)
    }

    fun getProducts(): List<Product> = listOf(
        Product(
            id = "prod-01",
            sku = "PL-PROT-01",
            nameEn = "Betolla Protein Treatment 1000ml",
            nameAr = "بروتين بيفولا العلاجي للشعر 1000 مل",
            priceJd = 45.000,
            stockQty = 120
        ),
        Product(
            id = "prod-02",
            sku = "PL-SHAMP-02",
            nameEn = "Sulfate-Free Shampoo 500ml",
            nameAr = "شامبو خالي من السلفات والأملاح 500 مل",
            priceJd = 14.500,
            stockQty = 340
        ),
        Product(
            id = "prod-03",
            sku = "PL-MASK-03",
            nameEn = "Keratin Repair Hair Mask 500ml",
            nameAr = "ماسك الكيراتين المركز لترميم الشعر 500 مل",
            priceJd = 18.000,
            stockQty = 210
        ),
        Product(
            id = "prod-04",
            sku = "PL-SERUM-04",
            nameEn = "Pure Moroccan Argan Serum 100ml",
            nameAr = "سيروم الأرجان المغربي النقي 100 مل",
            priceJd = 12.000,
            stockQty = 185
        )
    )

    fun saveOrder(order: Order) {
        val ordersJson = prefs.getString("orders_list", "[]")
        val type = object : TypeToken<MutableList<Order>>() {}.type
        val orders: MutableList<Order> = gson.fromJson(ordersJson, type) ?: mutableListOf()
        orders.add(0, order)
        prefs.edit().putString("orders_list", gson.toJson(orders)).apply()
    }
}