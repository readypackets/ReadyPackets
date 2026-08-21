# No secrets or endpoint credentials belong in this repository. Keep Kotlin serialization model names for response decoding.
-keepclassmembers class ** { @kotlinx.serialization.SerialName <fields>; }
