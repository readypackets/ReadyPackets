package com.readypackets.mobile.core

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.readypackets.mobile.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AuthCoordinator(
    private val context: Context,
    private val api: MobileApiClient,
    private val tokenStore: SecureTokenStore,
    private val onAuthenticated: () -> Unit,
    private val onFailure: (String) -> Unit,
) {
    private var state: String? = null
    private var verifier: String? = null
    private val installationId = context.getSharedPreferences("readypackets_installation", Context.MODE_PRIVATE)
        .getString("id", null)
        ?: java.util.UUID.randomUUID().toString().lowercase().also {
            context.getSharedPreferences("readypackets_installation", Context.MODE_PRIVATE)
                .edit().putString("id", it).apply()
        }

    fun begin() {
        val newState = Pkce.state()
        val newVerifier = Pkce.verifier()
        state = newState
        verifier = newVerifier
        tokenStore.saveAuthorizationAttempt(newState, newVerifier)
        val uri = Uri.parse(BuildConfig.PORTAL_BASE_URL.trimEnd('/') + "/api/mobile/v1/authorize")
            .buildUpon()
            .appendQueryParameter("client_id", "readypackets-native")
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("redirect_uri", BuildConfig.OAUTH_REDIRECT_URI)
            .appendQueryParameter("code_challenge", Pkce.challenge(newVerifier))
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("state", newState)
            .appendQueryParameter("device_id", installationId)
            .appendQueryParameter("platform", "android")
            .appendQueryParameter("app_version", BuildConfig.VERSION_NAME)
            .appendQueryParameter("scope", "mobile:read mobile:write")
            .build()
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, uri)
    }

    fun complete(uri: Uri) {
        val expectedRedirect = Uri.parse(BuildConfig.OAUTH_REDIRECT_URI)
        val persistedAttempt = tokenStore.validAuthorizationAttempt()
        val expectedState = state ?: persistedAttempt?.first
        val expectedVerifier = verifier ?: persistedAttempt?.second
        if (uri.scheme != expectedRedirect.scheme || uri.host != expectedRedirect.host ||
            uri.path != expectedRedirect.path || uri.getQueryParameter("state") != expectedState
        ) {
            tokenStore.clearAuthorizationAttempt()
            onFailure("The secure sign-in return could not be verified.")
            return
        }
        val code = uri.getQueryParameter("code")
        if (code.isNullOrBlank() || expectedVerifier == null) {
            tokenStore.clearAuthorizationAttempt()
            onFailure("The sign-in request expired. Please try again.")
            return
        }
        CoroutineScope(Dispatchers.Main).launch {
            api.exchangeCode(code, expectedVerifier)
                .onSuccess {
                    state = null
                    verifier = null
                    tokenStore.clearAuthorizationAttempt()
                    onAuthenticated()
                }
                .onFailure { onFailure(it.message ?: "Sign-in failed.") }
        }
    }
}
