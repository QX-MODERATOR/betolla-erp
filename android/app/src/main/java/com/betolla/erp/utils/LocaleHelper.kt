package com.betolla.erp.utils

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.view.View
import java.util.Locale

object LocaleHelper {
    fun applyLocale(context: Context, language: String): Context {
        val locale = Locale(language)
        Locale.setDefault(locale)

        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        config.setLayoutDirection(locale)

        return context.createConfigurationContext(config)
    }

    fun isRtl(context: Context): Boolean {
        return context.resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
    }
}