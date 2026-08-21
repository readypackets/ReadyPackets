package com.readypackets.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.readypackets.mobile.core.*
import kotlinx.coroutines.launch

@Composable fun HomeScreen(container: AppContainer) { var dashboard by remember { mutableStateOf<Dashboard?>(null) }; var profile by remember { mutableStateOf<Profile?>(null) }; var error by remember { mutableStateOf<String?>(null) }; val scope = rememberCoroutineScope(); fun load() { scope.launch { container.api().get<Profile>("/me").onSuccess { profile = it }.onFailure { error = it.message }; container.api().get<Dashboard>("/dashboard").onSuccess { dashboard = it }.onFailure { error = it.message } } }; LaunchedEffect(Unit) { load() }; LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { item { Text("Welcome${profile?.displayName?.let { ", $it" } ?: ""}", style = MaterialTheme.typography.headlineMedium); Text("Your ReadyPackets work at a glance.", style = MaterialTheme.typography.bodyLarge) }; dashboard?.let { data -> item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) { Metric("Orders", data.orderCount.toString(), Modifier.weight(1f)); Metric("Needs attention", data.attentionCount.toString(), Modifier.weight(1f)) } }; item { Text("Current work", style = MaterialTheme.typography.titleLarge) }; items(data.currentOrders) { order -> ElevatedCard { Column(Modifier.padding(16.dp)) { Text(order.projectName ?: order.publicOrderId, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.height(8.dp)); LinearProgressIndicator(progress = { order.completionPercent / 100f }, modifier = Modifier.fillMaxWidth(), color = Teal); Text(order.currentStage ?: order.status, style = MaterialTheme.typography.bodyMedium); if (order.attention != "none") Text("Action needed", color = Danger, style = MaterialTheme.typography.labelLarge) } } } }; error?.let { item { Text(it, color = Danger) } } } }
@Composable private fun Metric(title: String, value: String, modifier: Modifier) { ElevatedCard(modifier) { Column(Modifier.padding(16.dp)) { Text(value, style = MaterialTheme.typography.headlineMedium); Text(title, style = MaterialTheme.typography.labelLarge) } } }
