package com.betolla.erp.data.security

import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object CryptoHelper {
    private const val PASSPHRASE = "BETOLLA_ERP_SECURE_PAYLOAD_KEY_2026_JORDAN_AMMAN"
    private const val GCM_IV_LENGTH = 12
    private const val GCM_TAG_LENGTH = 128

    private val aesKey: SecretKeySpec by lazy {
        val digest = MessageDigest.getInstance("SHA-256")
        val keyBytes = digest.digest(PASSPHRASE.toByteArray(StandardCharsets.UTF_8))
        SecretKeySpec(keyBytes, "AES")
    }

    /**
     * Encrypts username and password with a fresh random 96-bit IV and timestamp.
     * Produces a JSON string with hex-encoded iv and ciphertext matching lib/security.ts
     */
    fun encryptCredentials(username: String, password: String): String {
        val payloadObj = JSONObject().apply {
            put("username", username.trim())
            put("password", password)
            put("timestamp", System.currentTimeMillis())
        }
        val plaintext = payloadObj.toString().toByteArray(StandardCharsets.UTF_8)

        val iv = ByteArray(GCM_IV_LENGTH).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, spec)
        val ciphertext = cipher.doFinal(plaintext)

        return JSONObject().apply {
            put("iv", bytesToHex(iv))
            put("ciphertext", bytesToHex(ciphertext))
        }.toString()
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val hexChars = "0123456789abcdef"
        val result = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val i = b.toInt() and 0xff
            result.append(hexChars[i shr 4])
            result.append(hexChars[i and 0x0f])
        }
        return result.toString()
    }
}