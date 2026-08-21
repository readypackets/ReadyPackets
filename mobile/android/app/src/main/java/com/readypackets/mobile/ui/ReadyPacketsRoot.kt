package com.readypackets.mobile.ui

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.readypackets.mobile.core.AppContainer
import java.util.concurrent.Executor

@Composable
fun ReadyPacketsRoot(container: AppContainer, state: AppState) {
    ReadyPacketsTheme {
        when (state) {
            AppState.SignedOut -> WelcomeScreen(onSignIn = { container.beginAuthorization() })
            AppState.Locked -> LockedScreen(container)
            AppState.BiometricRequired -> BiometricScreen(container)
            AppState.SignedIn -> MainNavigation(container)
            is AppState.Error -> WelcomeScreen(onSignIn = { container.beginAuthorization() }, error = state.message)
        }
    }
}

@Composable private fun WelcomeScreen(onSignIn: () -> Unit, error: String? = null) { Surface(color = Navy, modifier = Modifier.fillMaxSize()) { Column(Modifier.padding(32.dp).fillMaxWidth(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.BusinessCenter, null, tint = Gold, modifier = Modifier.size(56.dp)); Spacer(Modifier.height(20.dp)); Text("ReadyPackets", style = MaterialTheme.typography.displaySmall, color = Color.White); Text("Your Business, Professionally Packeted", color = Color.White.copy(alpha = 0.82f)); Spacer(Modifier.height(28.dp)); Text("Securely manage authorized orders, workflow activity, documents, and support.", color = Color.White, style = MaterialTheme.typography.bodyLarge); error?.let { Spacer(Modifier.height(16.dp)); Text(it, color = Color(0xFFFFB4AB)) }; Spacer(Modifier.height(24.dp)); Button(onClick = onSignIn, colors = ButtonDefaults.buttonColors(containerColor = Teal), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Sign in securely") }; Spacer(Modifier.height(12.dp)); Text("ReadyPackets never asks you to enter your password in this app.", color = Color.White.copy(alpha = 0.72f), style = MaterialTheme.typography.bodySmall) } } }

@Composable private fun LockedScreen(container: AppContainer) { val context = LocalContext.current; LaunchedEffect(Unit) { container.authenticate(context as FragmentActivity) }; Surface(color = Navy, modifier = Modifier.fillMaxSize()) { Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) { CircularProgressIndicator(color = Teal) } } }
@Composable private fun BiometricScreen(container: AppContainer) { val activity = LocalContext.current as FragmentActivity; val executor = remember(activity) { Executor { it.run() } }; LaunchedEffect(Unit) { BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() { override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { container.onBiometricSuccess() } }).authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock ReadyPackets").setSubtitle("Use your device biometric authentication to continue.").setNegativeButtonText("Sign out").build()) }; Surface(color = Navy, modifier = Modifier.fillMaxSize()) { Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) { Text("Waiting for biometric authentication", color = Color.White) } } }

@Composable private fun MainNavigation(container: AppContainer) { var selected by rememberSaveable { mutableIntStateOf(0) }; val titles = listOf("Home", "Orders", "Messages", "Notifications", "Profile"); Scaffold(bottomBar = { NavigationBar { titles.forEachIndexed { index, title -> NavigationBarItem(selected = selected == index, onClick = { selected = index }, icon = { Icon(listOf(Icons.Default.Home, Icons.Default.Inventory2, Icons.Default.Forum, Icons.Default.Notifications, Icons.Default.Person)[index], title) }, label = { Text(title) }) } } }) { padding -> Box(Modifier.padding(padding)) { when (selected) { 0 -> HomeScreen(container); 1 -> OrdersScreen(container); 2 -> ReservedScreen("Messages", "Your secure message inbox will appear here when its server contract is released."); 3 -> ReservedScreen("Notifications", "Your generic notification inbox will appear here when device registration is enabled."); else -> ProfileScreen(container) } } } }
@Composable private fun ReservedScreen(title: String, body: String) { Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { Text(title, style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(12.dp)); Text(body, style = MaterialTheme.typography.bodyLarge) } }
