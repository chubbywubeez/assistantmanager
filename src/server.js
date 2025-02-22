const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../build')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// File path for thread storage
const THREADS_FILE = path.join(__dirname, 'threads.json');

// Initialize thread storage
let activeThreads = new Map();

// Load threads from file
async function loadThreads() {
  try {
    const data = await fs.readFile(THREADS_FILE, 'utf8');
    const threads = JSON.parse(data);
    activeThreads = new Map(Object.entries(threads));
    console.log('Loaded threads from storage:', activeThreads.size);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No threads file found, starting fresh');
      await saveThreads();
    } else {
      console.error('Error loading threads:', error);
    }
  }
}

// Save threads to file
async function saveThreads() {
  try {
    const threads = Object.fromEntries(activeThreads);
    await fs.writeFile(THREADS_FILE, JSON.stringify(threads, null, 2));
    console.log('Saved threads to storage:', activeThreads.size);
  } catch (error) {
    console.error('Error saving threads:', error);
  }
}

// Load threads on startup
loadThreads();

// Cleanup old threads periodically
setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const [threadId, data] of activeThreads) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeThreads.delete(threadId);
      changed = true;
    }
  }
  if (changed) {
    await saveThreads();
  }
}, 60 * 60 * 1000); // Check every hour

// Add a basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get assistant names
app.get('/api/assistants', async (req, res) => {
  try {
    console.log('Fetching assistants...');
    const assistantIds = [
      'asst_IKDRxcCVeSx55rtDbl9Gv2sU',
      'asst_nMBoUm3KOLqMPwyHfnQB0hPr',
      'asst_KpVt3IbaX91ccQw8jVexfXff'
    ];
    
    const assistants = await Promise.all(
      assistantIds.map(async (id) => {
        const assistant = await openai.beta.assistants.retrieve(id);
        return {
          id: assistant.id,
          name: assistant.name || 'Unnamed Assistant'
        };
      })
    );

    res.json(assistants);
  } catch (error) {
    console.error('Error fetching assistants:', error);
    res.status(500).json({ error: 'Failed to fetch assistants', details: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { assistantId, message, threadId, previousMessages, isContextOnly } = req.body;
    
    console.log('Request received:', {
      assistantId,
      message: message.substring(0, 100),
      threadId,
      previousMessagesCount: previousMessages?.length,
      isContextOnly
    });

    let currentThreadId = threadId;

    // Check if we're switching assistants but have previous messages
    const isAssistantSwitch = !threadId && previousMessages && previousMessages.length > 0 && 
      previousMessages[previousMessages.length - 1].assistantId !== assistantId;

    // Create a new thread if none exists
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create();
      currentThreadId = thread.id;

      if (previousMessages && previousMessages.length > 0) {
        // Create a more natural conversation summary
        const recentMessages = previousMessages.slice(-5); // Only use last 5 messages for context
        const topics = recentMessages
          .filter(msg => msg.role === 'assistant')
          .map(msg => msg.content.substring(0, 100))
          .join('\n');

        const conversationSummary = `
CONVERSATION HISTORY
===================
${recentMessages.map((msg, index) => {
  const speaker = msg.role === 'user' ? 'Human' : msg.assistantId === assistantId ? 'You' : 'Previous Assistant';
  return `${speaker}: ${msg.content}`;
}).join('\n\n')}

CURRENT CONTEXT
==============
${isContextOnly 
  ? 'Continue the conversation about ' + 
    (recentMessages.find(msg => msg.role === 'user' && msg.content !== 'Please continue the conversation, referencing previous points.')?.content || 'the current topic')
  : message}`;

        // First, add the context
        await openai.beta.threads.messages.create(currentThreadId, {
          role: "user",
          content: conversationSummary
        });
      }
    }

    // Add the new message if it's not just a context transfer
    if (!isContextOnly) {
      await openai.beta.threads.messages.create(currentThreadId, {
        role: "user",
        content: message
      });
    }

    // Update thread timestamp and save to storage
    activeThreads.set(currentThreadId, {
      assistantId,
      timestamp: Date.now()
    });
    await saveThreads();

    // Run the assistant without additional instructions
    const run = await openai.beta.threads.runs.create(currentThreadId, {
      assistant_id: assistantId
    });

    await waitForRunCompletion(currentThreadId, run.id);

    // Get messages and ensure response references context
    const messages = await openai.beta.threads.messages.list(currentThreadId);
    const assistantResponse = messages.data[0].content[0].text.value;

    res.json({ 
      response: assistantResponse,
      threadId: currentThreadId
    });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

// Helper function to wait for run completion
async function waitForRunCompletion(threadId, runId) {
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  
  while (runStatus.status !== 'completed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed');
    }
  }
  
  return runStatus;
}

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
}); 