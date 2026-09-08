package com.betolla.erp.ui.sales

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.LinearLayoutManager
import com.betolla.erp.R
import com.betolla.erp.data.model.Lead
import com.betolla.erp.data.storage.LeadRepository
import com.betolla.erp.data.storage.SessionManager
import com.betolla.erp.databinding.ActivitySalesMainBinding
import com.betolla.erp.ui.auth.LoginActivity
import com.betolla.erp.utils.LocaleHelper

class SalesMainActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySalesMainBinding
    private lateinit var sessionManager: SessionManager
    private lateinit var leadRepository: LeadRepository
    private lateinit var leadAdapter: LeadAdapter
    private var allLeads: MutableList<Lead> = mutableListOf()

    override fun attachBaseContext(newBase: Context) {
        val sm = SessionManager(newBase)
        super.attachBaseContext(LocaleHelper.applyLocale(newBase, sm.getLanguage()))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)
        leadRepository = LeadRepository(this)

        val currentUser = sessionManager.getUser()
        if (currentUser == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivitySalesMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.tvWelcomeUser.text = "${currentUser.fullName} (${getString(R.string.role_sales_badge)})"

        setupLanguageSwitcher()
        setupLogout()
        setupRecyclerView()
        setupSearch()
        setupAddLeadFab()

        binding.swipeRefresh.setColorSchemeResources(R.color.primary, R.color.accent)
        binding.swipeRefresh.setOnRefreshListener {
            loadLeads()
            binding.swipeRefresh.isRefreshing = false
        }

        loadLeads()
    }

    private fun setupLanguageSwitcher() {
        val currentLang = sessionManager.getLanguage()
        binding.btnLangToggle.text = if (currentLang == "ar") "English" else "العربية"
        binding.btnLangToggle.setOnClickListener {
            val nextLang = if (sessionManager.getLanguage() == "ar") "en" else "ar"
            sessionManager.setLanguage(nextLang)
            recreate()
        }
    }

    private fun setupLogout() {
        binding.btnLogout.setOnClickListener {
            sessionManager.logout()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }

    private fun setupRecyclerView() {
        leadAdapter = LeadAdapter(
            leads = mutableListOf(),
            onCallClicked = { lead -> launchCall(lead.phone) },
            onWhatsappClicked = { lead -> launchWhatsapp(lead.phone, lead.name) },
            onNotesClicked = { lead -> showRecordCallSheet(lead) },
            onOrderClicked = { lead -> showCreateOrderSheet(lead) }
        )
        binding.rvLeads.layoutManager = LinearLayoutManager(this)
        binding.rvLeads.adapter = leadAdapter
    }

    private fun loadLeads() {
        allLeads = leadRepository.getLeads()
        leadAdapter.updateLeads(allLeads)
        binding.tvQueueCount.text = "${allLeads.size} عملاء"
        binding.tvStatCalls.text = allLeads.size.toString()
    }

    private fun setupSearch() {
        binding.etSearch.doAfterTextChanged { text ->
            val query = text?.toString()?.trim().orEmpty().lowercase()
            if (query.isEmpty()) {
                leadAdapter.updateLeads(allLeads)
            } else {
                val filtered = allLeads.filter {
                    it.name.lowercase().contains(query) || it.phone.contains(query) || it.city.lowercase().contains(query)
                }
                leadAdapter.updateLeads(filtered)
            }
        }
    }

    private fun setupAddLeadFab() {
        binding.fabAddLead.setOnClickListener {
            val dialog = AddLeadDialog(this) {
                loadLeads()
            }
            dialog.show()
        }
    }

    private fun launchCall(phone: String) {
        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "تعذر فتح تطبيق الاتصال", Toast.LENGTH_SHORT).show()
        }
    }

    private fun launchWhatsapp(phone: String, customerName: String) {
        val cleanPhone = phone.replace("[^0-9]".toRegex(), "")
        val intlPhone = if (cleanPhone.startsWith("0")) "962" + cleanPhone.substring(1) else cleanPhone
        val message = "مرحباً $customerName، معك رحمة من شركة بيفولا كوزمتكس. بخصوص استفسارك عن منتجات العناية بالشعر..."
        val url = "https://wa.me/$intlPhone?text=" + Uri.encode(message)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage("com.whatsapp")
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(fallback)
        }
    }

    private fun showRecordCallSheet(lead: Lead) {
        val sheet = RecordCallBottomSheet(lead) {
            loadLeads()
        }
        sheet.show(supportFragmentManager, "RecordCallBottomSheet")
    }

    private fun showCreateOrderSheet(lead: Lead) {
        val sheet = CreateOrderBottomSheet(lead) {
            loadLeads()
            Toast.makeText(this, "تم حفظ الطلب وإضافته للمبيعات!", Toast.LENGTH_SHORT).show()
        }
        sheet.show(supportFragmentManager, "CreateOrderBottomSheet")
    }
}