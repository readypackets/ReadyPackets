package com.readypackets.mobile.ui

sealed interface AppState { data object SignedOut : AppState; data object Locked : AppState; data object BiometricRequired : AppState; data object SignedIn : AppState; data class Error(val message: String) : AppState }
