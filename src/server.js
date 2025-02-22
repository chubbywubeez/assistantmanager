const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, '../build')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store active threads with timestamps
const activeThreads = new Map();

// Cleanup old threads periodically (optional)
setInterval(() => {
  const now = Date.now();
  for (const [threadId, data] of activeThreads) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeThreads.delete(threadId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

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

    // Create a new thread if none exists
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create();
      currentThreadId = thread.id;

      if (previousMessages && previousMessages.length > 0) {
        // Create a more structured conversation summary
        const topics = previousMessages
          .filter(msg => msg.role === 'assistant')
          .map(msg => msg.content.substring(0, 100))
          .join('\n');

        const conversationSummary = `
CONVERSATION CONTEXT
===================
Previous Topics Discussed:
${topics}

Detailed Message History:
${previousMessages.map((msg, index) => {
  const speaker = msg.role === 'user' ? 'Human' : `Assistant-${msg.assistantId}`;
  return `[${index + 1}] ${speaker}:\n${msg.content}\n---`;
}).join('\n\n')}

INSTRUCTIONS FOR RESPONSE
=======================
1. You MUST explicitly acknowledge the previous conversation
2. You MUST reference specific points made by other assistants
3. You MUST maintain thematic consistency with the discussion
4. You MUST explain how your response relates to previous messages

Current Discussion Topic: ${previousMessages[0].content.substring(0, 100)}...

YOUR TASK
=========
${isContextOnly 
  ? 'Review the conversation above and continue the discussion, explicitly building on previous points.' 
  : `Address this new message while maintaining conversation context: "${message}"`}`;

        // First, add the context
        await openai.beta.threads.messages.create(currentThreadId, {
          role: "user",
          content: conversationSummary
        });

        // Add a system message to enforce context awareness
        await openai.beta.threads.messages.create(currentThreadId, {
          role: "user",
          content: "Before providing your response, you must acknowledge the previous discussion and explain how your response relates to it."
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

    // Update thread timestamp
    activeThreads.set(currentThreadId, {
      assistantId,
      timestamp: Date.now()
    });

    // Run the assistant with explicit instructions
    const run = await openai.beta.threads.runs.create(currentThreadId, {
      assistant_id: assistantId,
      instructions: `
You are participating in an ongoing conversation. Before providing your response:
1. Explicitly acknowledge the previous discussion
2. Reference specific points made by other assistants
3. Explain how your response builds on or relates to previous messages
4. Maintain thematic consistency
5. If changing topics, explain the connection

Current assistant ID: ${assistantId}
Previous messages count: ${previousMessages?.length || 0}
Context only mode: ${isContextOnly}
`
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

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 