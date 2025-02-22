const { Pool } = require('pg');

// Initialize PostgreSQL pool with retry logic
const createPool = () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Railway's PostgreSQL
    }
  });

  // Add error handler
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  return pool;
};

const pool = createPool();

// Initialize tables with retry logic
async function initializeTables(retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
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
        console.log('Database tables initialized successfully');
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`Failed to initialize tables (attempt ${i + 1}/${retries}):`, err);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

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

// Function to update a liked message
async function updateLikedMessage(id, updates) {
  const client = await pool.connect();
  try {
    const setClause = Object.entries(updates)
      .map(([key, _], index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [id, ...Object.values(updates)];
    
    const result = await client.query(
      `UPDATE liked_messages 
       SET ${setClause}
       WHERE id = $1
       RETURNING *`,
      values
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Function to delete a liked message
async function deleteLikedMessage(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM liked_messages WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeTables,
  likeMessage,
  getLikedMessages,
  getLikedMessagesByAssistant,
  searchLikedMessages,
  updateLikedMessage,
  deleteLikedMessage
}; 