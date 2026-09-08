package com.betolla.erp.ui.auth

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.betolla.erp.R
import com.betolla.erp.data.network.ApiClient
import com.betolla.erp.data.security.CryptoHelper
import com.betolla.erp.data.storage.SessionManager
import com.betolla.erp.databinding.ActivityLoginBinding
import com.betolla.erp.ui.admin.AdminDashboardActivity
import com.betolla.erp.ui.sales.SalesMainActivity
import com.betolla.erp.utils.LocaleHelper
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var sessionManager: SessionManager

    override fun attachBaseContext(newBase: Context) {
        val sm = SessionManager(newBase)
        super.attachBaseContext(LocaleHelper.applyLocale(newBase, sm.getLanguage()))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)

        // Check if already logged in
        val currentUser = sessionManager.getUser()
        if (currentUser != null) {
            navigateBasedOnRole(currentUser.role)
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupLanguageSwitcher()
        setupLoginButton()
    }

    private fun setupLanguageSwitcher() {
        val currentLang = sessionManager.getLanguage()
        binding.btnLanguageToggle.text = if (currentLang == "ar") "English" else "العربية"

        binding.btnLanguageToggle.setOnClickListener {
            val newLang = if (sessionManager.getLanguage() == "ar") "en" else "ar"
            sessionManager.setLanguage(newLang)
            recreate()
        }
    }

    private fun setupLoginButton() {
        binding.btnLogin.setOnClickListener {
            val username = binding.etUsername.text?.toString()?.trim().orEmpty()
            val password = binding.etPassword.text?.toString()?.trim().orEmpty()

            if (username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, getString(R.string.login_empty_error), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            setLoading(true)

            lifecycleScope.launch {
                try {
                    // Encrypt payload via AES-256-GCM WebCrypto equivalent
                    val encryptedPayload = CryptoHelper.encryptCredentials(username, password)
                    val (user, error) = ApiClient.authenticate(encryptedPayload, username, password)

                    if (user != null) {
                        sessionManager.saveUser(user, user.token)
                        navigateBasedOnRole(user.role)
                    } else {
                        Toast.makeText(this@LoginActivity, error ?: getString(R.string.login_failed), Toast.LENGTH_LONG).show()
                        setLoading(false)
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@LoginActivity, getString(R.string.login_failed), Toast.LENGTH_SHORT).show()
                    setLoading(false)
                }
            }
        }
    }

    private fun setLoading(isLoading: Boolean) {
        binding.btnLogin.isEnabled = !isLoading
        binding.pbLoading.visibility = if (isLoading) View.VISIBLE else View.GONE
    }

    private fun navigateBasedOnRole(role: String) {
        if (role.equals("sales_rep", ignoreCase = true)) {
            val intent = Intent(this, SalesMainActivity::class.java)
            startActivity(intent)
        } else {
            val intent = Intent(this, AdminDashboardActivity::class.java)
            startActivity(intent)
        }
        finish()
    }
}