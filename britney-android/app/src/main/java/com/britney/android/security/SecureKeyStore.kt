package com.britney.android.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.util.UUID

/**
 * Secure key store using EncryptedSharedPreferences.
 * Stores API keys, settings, and device credentials.
 */
class SecureKeyStore private constructor(context: Context) {

    companion object {
        private const val PREFS_FILE = "britney_secure_prefs"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_SETTINGS = "settings"
        private const val KEY_MIMO_API_KEY = "mimo_api_key"
        private const val KEY_AGNES_API_KEY = "agnes_api_key"

        @Volatile
        private var instance: SecureKeyStore? = null

        fun getInstance(context: Context): SecureKeyStore {
            return instance ?: synchronized(this) {
                instance ?: SecureKeyStore(context.applicationContext).also { instance = it }
            }
        }
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    /**
     * Get or create a unique device ID.
     */
    fun getDeviceId(): String {
        var deviceId = securePrefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            securePrefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
    }

    /**
     * Get the API key.
     */
    fun getApiKey(): String? = securePrefs.getString(KEY_API_KEY, null)

    /**
     * Save the API key.
     */
    fun saveApiKey(apiKey: String) {
        securePrefs.edit().putString(KEY_API_KEY, apiKey).apply()
    }

    /**
     * Get MiMo API key.
     */
    fun getMimoApiKey(): String? = securePrefs.getString(KEY_MIMO_API_KEY, null)

    /**
     * Save MiMo API key.
     */
    fun saveMimoApiKey(apiKey: String) {
        securePrefs.edit().putString(KEY_MIMO_API_KEY, apiKey).apply()
    }

    /**
     * Get Agnes API key.
     */
    fun getAgnesApiKey(): String? = securePrefs.getString(KEY_AGNES_API_KEY, null)

    /**
     * Save Agnes API key.
     */
    fun saveAgnesApiKey(apiKey: String) {
        securePrefs.edit().putString(KEY_AGNES_API_KEY, apiKey).apply()
    }

    /**
     * Get app settings as JSON string.
     */
    fun getSettings(): String {
        return securePrefs.getString(KEY_SETTINGS, "{}") ?: "{}"
    }

    /**
     * Save app settings.
     * @param settings JSON string of settings
     * @return true if saved successfully
     */
    fun saveSettings(settings: String): Boolean {
        return try {
            // Validate JSON
            JSONObject(settings)
            securePrefs.edit().putString(KEY_SETTINGS, settings).apply()
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Get a specific setting value.
     */
    fun getSetting(key: String, defaultValue: String? = null): String? {
        val settings = JSONObject(getSettings())
        return if (settings.has(key)) settings.getString(key) else defaultValue
    }

    /**
     * Update a specific setting.
     */
    fun updateSetting(key: String, value: Any) {
        val settings = JSONObject(getSettings())
        settings.put(key, value)
        saveSettings(settings.toString())
    }

    /**
     * Clear all secure data.
     */
    fun clearAll() {
        securePrefs.edit().clear().apply()
    }
}
