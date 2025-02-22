const { Pool } = require('pg');

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway's PostgreSQL
  }
});

// Initialize tables
async function initializeTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS liked_messages (
        id SERIAL PRIMARY KEY,
        message_content TEXT NOT NULL,
        assistant_id TEXT NOT NULL,
        assistant_name TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        context TEXT,
        tags TEXT
      );
    `);
  } finally {
    client.release();
  }
}

// Initialize tables on startup
initializeTables().catch(console.error);

// Function to like a message
async function likeMessage(message, assistantId, assistantName, context = null, tags = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO liked_messages (message_content, assistant_id, assistant_name, context, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [message, assistantId, assistantName, context, tags.join(',')]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Function to get all liked messages
async function getLikedMessages() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM liked_messages ORDER BY timestamp DESC'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Function to get liked messages by assistant
async function getLikedMessagesByAssistant(assistantId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM liked_messages WHERE assistant_id = $1 ORDER BY timestamp DESC',
      [assistantId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Function to search liked messages
async function searchLikedMessages(query) {
  const client = await pool.connect();
  try {
    const searchPattern = `%${query}%`;
    const result = await client.query(
      `SELECT * FROM liked_messages 
       WHERE message_content ILIKE $1 
          OR context ILIKE $1 
          OR tags ILIKE $1
       ORDER BY timestamp DESC`,
      [searchPattern]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  likeMessage,
  getLikedMessages,
  getLikedMessagesByAssistant,
  searchLikedMessages
}; 