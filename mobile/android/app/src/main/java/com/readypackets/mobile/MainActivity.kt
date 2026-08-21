package com.readypackets.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.readypackets.mobile.core.AppContainer
import com.readypackets.mobile.ui.ReadyPacketsRoot

class MainActivity : ComponentActivity() {
    private lateinit var container: AppContainer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        container = AppContainer(applicationContext)
        handleAuthIntent(intent)
        setContent {
            val state by container.state.collectAsState()
            ReadyPacketsRoot(container = container, state = state)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthIntent(intent)
    }

    private fun handleAuthIntent(intent: Intent) {
        intent.data?.let { uri -> container.completeAuthorization(uri) }
    }
}
