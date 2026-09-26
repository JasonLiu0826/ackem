package com.britney.android.sync

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker for background sync operations.
 * Periodically syncs data with the PC server.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val WORK_NAME = "britney_sync"
        private const val SYNC_INTERVAL_MINUTES = 15L

        /**
         * Schedule periodic sync work.
         */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                SYNC_INTERVAL_MINUTES, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    5, TimeUnit.MINUTES
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
                )
        }

        /**
         * Trigger an immediate one-time sync.
         */
        fun triggerImmediate(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context)
                .enqueue(syncRequest)
        }

        /**
         * Cancel all sync work.
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context)
                .cancelUniqueWork(WORK_NAME)
        }
    }

    override suspend fun doWork(): Result {
        return try {
            val syncClient = SyncClient()
            
            // Read last sync timestamp from SharedPreferences
            val lastSyncTs = getLastSyncTimestamp()
            
            // Pull changes from server
            val changes = syncClient.pull(lastSyncTs)
            
            // Apply pulled changes to local DB
            if (changes.length() > 0) {
                applyPulledChanges(changes)
            }
            
            // Collect local changes and push to server
            val localChanges = collectLocalChanges(lastSyncTs)
            if (localChanges.length() > 0) {
                syncClient.push(localChanges)
            }
            
            // Update last sync timestamp
            updateLastSyncTimestamp(System.currentTimeMillis())
            
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    private fun getLastSyncTimestamp(): Long {
        val prefs = applicationContext.getSharedPreferences("britney_sync", Context.MODE_PRIVATE)
        return prefs.getLong("last_sync_ts", 0L)
    }

    private fun updateLastSyncTimestamp(timestamp: Long) {
        val prefs = applicationContext.getSharedPreferences("britney_sync", Context.MODE_PRIVATE)
        prefs.edit().putLong("last_sync_ts", timestamp).apply()
    }

    private fun applyPulledChanges(changes: JSONArray) {
        // Apply changes from server to local DB
        // This will be handled by BritneyDbHelper
        for (i in 0 until changes.length()) {
            val change = changes.getJSONObject(i)
            // TODO: Apply each change to the appropriate table
        }
    }

    private fun collectLocalChanges(sinceTs: Long): JSONArray {
        // Collect local changes since last sync
        // This will query each table for recent changes
        return JSONArray()
    }
}
