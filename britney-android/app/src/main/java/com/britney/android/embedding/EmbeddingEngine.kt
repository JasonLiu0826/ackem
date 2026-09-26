package com.britney.android.embedding

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.nio.LongBuffer
import kotlin.math.sqrt

/**
 * ONNX Runtime embedding engine for local vector encoding.
 * Uses a lightweight sentence-transformer model.
 */
class EmbeddingEngine(private val context: Context) {

    companion object {
        private const val MODEL_FILENAME = "embedding_model.onnx"
        private const val VOCAB_FILENAME = "vocab.txt"
        private const val DIMENSION = 384 // MiniLM-L6 default
        private const val MAX_SEQ_LENGTH = 128
    }

    private var ortEnv: OrtEnvironment? = null
    private var ortSession: OrtSession? = null
    private var vocab: Map<String, Int> = emptyMap()
    private var isInitialized = false

    fun initialize() {
        if (isInitialized) return

        try {
            ortEnv = OrtEnvironment.getEnvironment()
            
            val modelFile = copyAssetToInternal(MODEL_FILENAME)
            val sessionOptions = OrtSession.SessionOptions()
            sessionOptions.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            
            ortSession = ortEnv!!.createSession(modelFile.absolutePath, sessionOptions)
            
            val vocabFile = File(context.filesDir, VOCAB_FILENAME)
            if (vocabFile.exists()) {
                vocab = loadVocab(vocabFile)
            }
            
            isInitialized = true
        } catch (e: Exception) {
            throw Exception("Failed to initialize embedding engine: ${e.message}", e)
        }
    }

    fun encode(text: String): FloatArray {
        if (!isInitialized) initialize()
        
        val session = ortSession ?: throw Exception("ONNX session not initialized")
        val env = ortEnv ?: throw Exception("ONNX environment not initialized")
        
        val inputIds = tokenize(text)
        val attentionMask = inputIds.map { if (it > 0) 1L else 0L }.toLongArray()
        val tokenTypeIds = LongArray(inputIds.size) { 0L }
        val inputIdsLong = inputIds.map { it.toLong() }.toLongArray()
        
        val shape = longArrayOf(1, inputIds.size.toLong())
        
        // Use LongBuffer for createTensor
        val inputIdsTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(inputIdsLong), shape)
        val attentionMaskTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(attentionMask), shape)
        val tokenTypeIdsTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(tokenTypeIds), shape)
        
        val inputs = mapOf(
            "input_ids" to inputIdsTensor,
            "attention_mask" to attentionMaskTensor,
            "token_type_ids" to tokenTypeIdsTensor
        )
        
        val results = session.run(inputs)
        @Suppress("UNCHECKED_CAST")
        val output = results[0].value as Array<FloatArray> // [seq_len, hidden_dim]
        
        val embeddings = output
        val pooled = FloatArray(DIMENSION) { 0f }
        var validTokens = 0
        
        for (i in embeddings.indices) {
            if (attentionMask[i] == 1L) {
                for (j in pooled.indices) {
                    pooled[j] += embeddings[i][j]
                }
                validTokens++
            }
        }
        
        if (validTokens > 0) {
            for (j in pooled.indices) {
                pooled[j] /= validTokens.toFloat()
            }
        }
        
        val norm = sqrt(pooled.sumOf { (it * it).toDouble() }).toFloat()
        if (norm > 0f) {
            for (j in pooled.indices) {
                pooled[j] /= norm
            }
        }
        
        inputIdsTensor.close()
        attentionMaskTensor.close()
        tokenTypeIdsTensor.close()
        results.close()
        
        return pooled
    }

    fun encodeBatch(texts: List<String>): List<FloatArray> {
        return texts.map { encode(it) }
    }

    fun getDimension(): Int = DIMENSION

    fun close() {
        ortSession?.close()
        ortEnv?.close()
        isInitialized = false
    }

    private fun copyAssetToInternal(assetName: String): File {
        val outFile = File(context.filesDir, assetName)
        if (outFile.exists()) return outFile

        context.assets.open(assetName).use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output)
            }
        }
        return outFile
    }

    private fun loadVocab(file: File): Map<String, Int> {
        return file.readLines().mapIndexed { index, word -> word to index }.toMap()
    }

    private fun tokenize(text: String): IntArray {
        val tokens = mutableListOf<Int>()
        tokens.add(vocab["[CLS]"] ?: 101)
        
        text.lowercase().split(" ").forEach { word ->
            vocab[word]?.let { tokens.add(it) }
        }
        
        tokens.add(vocab["[SEP]"] ?: 102)
        
        return if (tokens.size >= MAX_SEQ_LENGTH) {
            tokens.subList(0, MAX_SEQ_LENGTH).toIntArray()
        } else {
            val padded = IntArray(MAX_SEQ_LENGTH) { 0 }
            tokens.forEachIndexed { i, v -> padded[i] = v }
            padded
        }
    }
}
