package com.betolla.erp.data.storage

import android.content.Context
import android.content.SharedPreferences
import com.betolla.erp.data.model.User
import com.google.gson.Gson

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val PREF_NAME = "betolla_erp_prefs"
        private const val KEY_USER = "key_user"
        private const val KEY_TOKEN = "key_jwt_token"
        private const val KEY_LANGUAGE = "key_language"
    }

    fun saveUser(user: User, token: String? = null) {
        val editor = prefs.edit()
        val finalUser = if (token != null) user.copy(token = token) else user
        editor.putString(KEY_USER, gson.toJson(finalUser))
        if (token != null) {
            editor.putString(KEY_TOKEN, token)
        }
        editor.apply()
    }

    fun getUser(): User? {
        val json = prefs.getString(KEY_USER, null) ?: return null
        return try {
            gson.fromJson(json, User::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun isLoggedIn(): Boolean = getUser() != null

    fun logout() {
        prefs.edit().remove(KEY_USER).remove(KEY_TOKEN).apply()
    }

    fun getLanguage(): String = prefs.getString(KEY_LANGUAGE, "ar") ?: "ar"

    fun setLanguage(lang: String) {
        prefs.edit().putString(KEY_LANGUAGE, lang).apply()
    }
}