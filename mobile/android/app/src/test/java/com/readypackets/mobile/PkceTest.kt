package com.readypackets.mobile

import com.readypackets.mobile.core.Pkce
import org.junit.Assert.*
import org.junit.Test

class PkceTest {
    @Test fun verifierIsUrlSafeAndHighEntropyLength() { val verifier = Pkce.verifier(); assertTrue(verifier.length >= 43); assertFalse(verifier.contains("=")); assertFalse(verifier.contains("+")); assertFalse(verifier.contains("/")) }
    @Test fun challengeIsDeterministic() { assertEquals(Pkce.challenge("test-verifier"), Pkce.challenge("test-verifier")) }
}
