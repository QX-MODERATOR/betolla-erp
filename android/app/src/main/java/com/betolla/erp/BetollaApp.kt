package com.betolla.erp

import android.app.Application
import android.content.Context
import com.betolla.erp.data.storage.SessionManager
import com.betolla.erp.utils.LocaleHelper

class BetollaApp : Application() {
    override fun attachBaseContext(base: Context) {
        val sessionManager = SessionManager(base)
        val lang = sessionManager.getLanguage()
        super.attachBaseContext(LocaleHelper.applyLocale(base, lang))
    }
}