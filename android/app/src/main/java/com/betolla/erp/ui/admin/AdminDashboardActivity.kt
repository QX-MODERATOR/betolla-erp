package com.betolla.erp.ui.admin

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.betolla.erp.data.storage.SessionManager
import com.betolla.erp.databinding.ActivityAdminDashboardBinding
import com.betolla.erp.ui.auth.LoginActivity
import com.betolla.erp.ui.sales.SalesMainActivity
import com.betolla.erp.utils.LocaleHelper

class AdminDashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminDashboardBinding
    private lateinit var sessionManager: SessionManager

    override fun attachBaseContext(newBase: Context) {
        val sm = SessionManager(newBase)
        super.attachBaseContext(LocaleHelper.applyLocale(newBase, sm.getLanguage()))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)

        val currentUser = sessionManager.getUser()
        if (currentUser == null || !currentUser.isAdmin) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding = ActivityAdminDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val currentLang = sessionManager.getLanguage()
        binding.btnAdminLangToggle.text = if (currentLang == "ar") "English" else "العربية"
        binding.btnAdminLangToggle.setOnClickListener {
            val nextLang = if (sessionManager.getLanguage() == "ar") "en" else "ar"
            sessionManager.setLanguage(nextLang)
            recreate()
        }

        binding.btnAdminLogout.setOnClickListener {
            sessionManager.logout()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        binding.cardNavSales.setOnClickListener {
            startActivity(Intent(this, SalesMainActivity::class.java))
        }
    }
}