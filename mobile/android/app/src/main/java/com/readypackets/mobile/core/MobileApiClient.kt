package com.readypackets.mobile.core

import com.readypackets.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID

class MobileApiClient(private val store: SecureTokenStore, private val client: OkHttpClient = OkHttpClient()) {
    @PublishedApi
    internal val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val refreshMutex = Mutex()
    private val portal = BuildConfig.PORTAL_BASE_URL.trimEnd('/')

    suspend inline fun <reified T> get(path: String): Result<T> =
        request(path, "GET", null, null, serializer<T>())

    suspend inline fun <reified T, reified B> post(path: String, body: B): Result<T> =
        request(path, "POST", json.encodeToString(body), UUID.randomUUID().toString(), serializer<T>())

    suspend fun exchangeCode(code: String, verifier: String): Result<TokenSet> = tokenRequest(
        FormBody.Builder()
            .add("grant_type", "authorization_code")
            .add("client_id", "readypackets-native")
            .add("code", code)
            .add("code_verifier", verifier)
            .add("redirect_uri", BuildConfig.OAUTH_REDIRECT_URI)
            .build(),
    )

    suspend fun revoke() {
        val token = store.refreshToken ?: return
        withContext(Dispatchers.IO) {
            client.newCall(
                Request.Builder()
                    .url("$portal/api/mobile/v1/revoke")
                    .post(FormBody.Builder().add("token", token).add("client_id", "readypackets-native").build())
                    .build(),
            ).execute().close()
        }
    }

    @PublishedApi
    internal suspend fun <T> request(
        path: String,
        method: String,
        body: String?,
        idempotency: String?,
        responseSerializer: KSerializer<T>,
        retry: Boolean = true,
    ): Result<T> = withContext(Dispatchers.IO) {
        val token = validAccessToken().getOrElse { return@withContext Result.failure(it) }
        val builder = Request.Builder()
            .url("$portal/api/mobile/v1$path")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
        if (idempotency != null) builder.header("Idempotency-Key", idempotency)
        when (method) {
            "POST" -> builder.post((body ?: "").toRequestBody("application/json".toMediaType()))
            else -> builder.get()
        }
        client.newCall(builder.build()).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            if (response.code == 401 && retry) {
                refresh().getOrElse { return@withContext Result.failure(it) }
                return@withContext request(path, method, body, idempotency, responseSerializer, retry = false)
            }
            if (!response.isSuccessful) return@withContext Result.failure(problem(payload, response.code))
            runCatching { json.decodeFromString(responseSerializer, payload) }
        }
    }

    suspend fun refresh(): Result<TokenSet> = refreshMutex.withLock {
        val token = store.refreshToken ?: return@withLock Result.failure(IllegalStateException("Sign in is required."))
        tokenRequest(
            FormBody.Builder()
                .add("grant_type", "refresh_token")
                .add("client_id", "readypackets-native")
                .add("refresh_token", token)
                .build(),
        )
    }

    private suspend fun validAccessToken(): Result<String> {
        store.accessToken?.takeIf { store.accessExpiryEpochMillis > System.currentTimeMillis() }
            ?.let { return Result.success(it) }
        return refresh().map { it.accessToken }
    }

    private suspend fun tokenRequest(body: FormBody): Result<TokenSet> = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url("$portal/api/mobile/v1/token").post(body).build()).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            if (!response.isSuccessful) Result.failure(problem(payload, response.code))
            else runCatching { json.decodeFromString<TokenSet>(payload) }.onSuccess { store.save(it) }
        }
    }

    private fun problem(payload: String, code: Int): Throwable = runCatching {
        json.decodeFromString<ApiProblem>(payload)
    }.map { IllegalStateException(it.detail ?: it.title) }
        .getOrElse { IllegalStateException("Request failed ($code).") }
}
