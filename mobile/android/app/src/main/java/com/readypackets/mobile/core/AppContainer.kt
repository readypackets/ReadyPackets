package com.readypackets.mobile.core

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.readypackets.mobile.ui.AppState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AppContainer(private val context: Context) : ViewModel() {
    private val tokenStore = SecureTokenStore(context)
    private val api = MobileApiClient(tokenStore)
    private lateinit var coordinator: AuthCoordinator
    private val mutableState = MutableStateFlow<AppState>(if (tokenStore.refreshToken == null) AppState.SignedOut else AppState.Locked)
    val state = mutableState.asStateFlow()

    fun authenticate(activity: FragmentActivity) {
        if (tokenStore.refreshToken == null) { beginAuthorization(); return }
        if (BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS) mutableState.value = AppState.BiometricRequired else mutableState.value = AppState.SignedIn
    }
    fun onBiometricSuccess() { mutableState.value = AppState.SignedIn }
    fun beginAuthorization() {
        coordinator = AuthCoordinator(
            context,
            api,
            tokenStore,
            { mutableState.value = AppState.SignedIn },
            { mutableState.value = AppState.SignedOut; mutableState.value = AppState.Error(it) },
        )
        coordinator.begin()
    }
    fun completeAuthorization(uri: android.net.Uri) { if (::coordinator.isInitialized) coordinator.complete(uri) }
    fun logout() { viewModelScope.launch { api.revoke(); tokenStore.wipe(); mutableState.value = AppState.SignedOut } }
    fun api(): MobileApiClient = api
}
