package com.britney.android.sync

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Manages device pairing state and credentials.
 */
class PairingManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "britney_pairing"
        private const val KEY_PAIRED = "is_paired"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_PAIR_CODE = "pair_code"
        private const val KEY_PAIRED_AT = "paired_at"
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * Check if device is paired.
     */
    fun isPaired(): Boolean = prefs.getBoolean(KEY_PAIRED, false)

    /**
     * Get the device ID.
     */
    fun getDeviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)

    /**
     * Get the server URL.
     */
    fun getServerUrl(): String? = prefs.getString(KEY_SERVER_URL, null)

    /**
     * Get the auth token.
     */
    fun getAuthToken(): String? = prefs.getString(KEY_AUTH_TOKEN, null)

    /**
     * Start pairing process with a code.
     * @param pairCode 6-digit code from PC
     * @param serverUrl The PC server URL
     * @return JSONObject with pairing result
     */
    fun startPairing(pairCode: String, serverUrl: String): JSONObject {
        val syncClient = SyncClient()
        syncClient.configure(serverUrl)
        
        val result = syncClient.pair(pairCode)
        
        // Save pairing info
        val deviceId = result.optString("deviceId")
        val authToken = result.optString("token")
        
        prefs.edit().apply {
            putBoolean(KEY_PAIRED, true)
            putString(KEY_DEVICE_ID, deviceId)
            putString(KEY_SERVER_URL, serverUrl)
            putString(KEY_AUTH_TOKEN, authToken)
            putString(KEY_PAIR_CODE, pairCode)
            putLong(KEY_PAIRED_AT, System.currentTimeMillis())
            apply()
        }
        
        return result
    }

    /**
     * Unpair the device.
     */
    fun unpair() {
        prefs.edit().clear().apply()
    }

    /**
     * Get pairing info as JSON.
     */
    fun getPairingInfo(): JSONObject {
        return JSONObject().apply {
            put("isPaired", isPaired())
            put("deviceId", getDeviceId())
            put("serverUrl", getServerUrl())
            put("pairedAt", prefs.getLong(KEY_PAIRED_AT, 0))
        }
    }
}
