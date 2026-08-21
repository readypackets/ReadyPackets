package com.readypackets.mobile.core

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureTokenStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "readypackets_mobile_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    @Volatile var accessToken: String? = null
    @Volatile var accessExpiryEpochMillis: Long = 0L
    var refreshToken: String?
        get() = preferences.getString("refresh_token", null)
        private set(value) = preferences.edit().apply { if (value == null) remove("refresh_token") else putString("refresh_token", value) }.apply()

    fun save(tokens: TokenSet) {
        refreshToken = tokens.refreshToken
        accessToken = tokens.accessToken
        accessExpiryEpochMillis = System.currentTimeMillis() + (tokens.expiresIn - 30).coerceAtLeast(30) * 1000L
    }

    fun saveAuthorizationAttempt(state: String, verifier: String) {
        preferences.edit()
            .putString("oauth_state", state)
            .putString("oauth_verifier", verifier)
            .putLong("oauth_started_at", System.currentTimeMillis())
            .apply()
    }

    fun validAuthorizationAttempt(maxAgeMillis: Long = 10 * 60 * 1000L): Pair<String, String>? {
        val state = preferences.getString("oauth_state", null)
        val verifier = preferences.getString("oauth_verifier", null)
        val started = preferences.getLong("oauth_started_at", 0L)
        if (state.isNullOrBlank() || verifier.isNullOrBlank() || started <= 0L || System.currentTimeMillis() - started > maxAgeMillis) {
            clearAuthorizationAttempt()
            return null
        }
        return state to verifier
    }

    fun clearAuthorizationAttempt() {
        preferences.edit().remove("oauth_state").remove("oauth_verifier").remove("oauth_started_at").apply()
    }

    fun wipe() {
        accessToken = null
        accessExpiryEpochMillis = 0L
        refreshToken = null
        clearAuthorizationAttempt()
    }
}
