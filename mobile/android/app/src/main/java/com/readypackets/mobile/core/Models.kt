package com.readypackets.mobile.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class TokenSet(@SerialName("access_token") val accessToken: String, @SerialName("token_type") val tokenType: String, @SerialName("expires_in") val expiresIn: Int, @SerialName("refresh_token") val refreshToken: String)
@Serializable data class ApiProblem(val title: String, val code: String, val detail: String? = null)
@Serializable data class Profile(val id: String, val displayName: String, val email: String, val role: String, val capabilities: List<String>, val mfaEnabled: Boolean, val emailVerified: Boolean)
@Serializable data class Dashboard(val orderCount: Int, val attentionCount: Int, val currentOrders: List<DashboardOrder>)
@Serializable data class DashboardOrder(val publicOrderId: String, val projectName: String? = null, val status: String, val completionPercent: Int, val currentStage: String? = null, val attention: String)
@Serializable data class OrderSummary(val publicOrderId: String, val projectName: String? = null, val status: String, val paymentStatus: String, val completionPercent: Int, val currentStage: String? = null, val attention: String, val dueAt: String? = null, val deliveredAt: String? = null, val createdAt: String? = null)
@Serializable data class OrdersPage(val items: List<OrderSummary>, val nextCursor: String? = null)
@Serializable data class OrderDetail(val publicOrderId: String, val projectName: String? = null, val status: String, val paymentStatus: String, val completionPercent: Int, val currentStage: String? = null)
@Serializable data class DeviceRecord(val id: String, val platform: String, val appVersion: String, val deviceName: String? = null, val status: String, val lastSeenAt: String? = null, val current: Boolean)
@Serializable data class DevicesPage(val items: List<DeviceRecord>)
@Serializable data class DeletionRequest(val confirmPhrase: String)
@Serializable data class DeletionReply(val accepted: Boolean, val openOrders: Int, val message: String)
