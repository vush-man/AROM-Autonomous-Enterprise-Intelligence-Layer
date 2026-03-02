const db = require("../db/sqlite");
const { cosineSimilarity } = require("../utils/cosineSimilarity");
const logger = require("../utils/logger");

/**
 * Search for similar document chunks based on a query embedding vector.
 *
 * Reads all stored embeddings from SQLite (populated by export_to_sqlite.py),
 * computes cosine similarity against the query embedding, and returns the
 * top-K most similar chunks.
 *
 * @param {number[]} queryEmbedding - Query embedding vector (from Ollama)
 * @param {number}   topK          - Number of top results to return
 * @returns {Promise<object[]>}    - Top-K chunks with similarity scores
 */
const similaritySearch = async (queryEmbedding, topK = 5) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT e.id        AS embedding_id,
                e.chunk_id,
                e.embedding,
                dc.chunk_text,
                dc.chunk_index,
                dc.source_file
         FROM embeddings e
         JOIN document_chunks dc ON dc.id = e.chunk_id`,
        (err, rows) => {
          if (err) {
            logger.error("Error fetching embeddings:", err);
            return reject(err);
          }
          resolve(rows || []);
        }
      );
    });

    if (rows.length === 0) {
      logger.warn(
        "No embeddings found in SQLite. Run export_to_sqlite.py to populate the DB first."
      );
      return [];
    }

    // Calculate similarity scores
    const scored = rows
      .map((row) => {
        let storedEmbedding;
        try {
          storedEmbedding = JSON.parse(row.embedding.toString());
        } catch {
          logger.warn(`Skipping malformed embedding chunk_id=${row.chunk_id}`);
          return null;
        }

        const score = cosineSimilarity(queryEmbedding, storedEmbedding);

        return {
          chunk_id: row.chunk_id,
          chunk_index: row.chunk_index,
          chunk_text: row.chunk_text,
          source_file: row.source_file,
          similarity_score: score,
        };
      })
      .filter(Boolean);

    // Sort descending and return top K
    const topResults = scored
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, topK);

    logger.info(
      `Similarity search: ${topResults.length} results (top score: ${topResults[0]?.similarity_score?.toFixed(4) ?? "N/A"})`
    );

    return topResults;
  } catch (error) {
    logger.error("Error in similarity search:", error);
    throw error;
  }
};

module.exports = { similaritySearch };
