package com.readypackets.mobile.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Navy = Color(0xFF0D1B2A); val NavyRaised = Color(0xFF12263A); val Teal = Color(0xFF20A090); val Gold = Color(0xFFC9A84C); val Danger = Color(0xFFB42318)
private val Dark = darkColorScheme(primary = Teal, secondary = Gold, background = Navy, surface = NavyRaised)
private val Light = lightColorScheme(primary = Teal, secondary = Color(0xFF1A7A6E), background = Color(0xFFF8FAFC), surface = Color.White)
@Composable fun ReadyPacketsTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = if (androidx.compose.foundation.isSystemInDarkTheme()) Dark else Light, typography = androidx.compose.material3.Typography(), content = content) }
