package com.readypackets.mobile.core

import java.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

object Pkce {
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    fun verifier(): String { val bytes = ByteArray(64); SecureRandom().nextBytes(bytes); return encoder.encodeToString(bytes) }
    fun state(): String { val bytes = ByteArray(32); SecureRandom().nextBytes(bytes); return encoder.encodeToString(bytes) }
    fun challenge(verifier: String): String = encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
}
