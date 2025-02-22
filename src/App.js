import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Paper, 
  TextField, 
  Button, 
  Box, 
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  IconButton,
  Snackbar
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

function App() {
  const [input, setInput] = useState('');
  const [assistants, setAssistants] = useState([]);
  const [selectedAssistant, setSelectedAssistant] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threads, setThreads] = useState({});
  const [allMessages, setAllMessages] = useState([]);
  const [likedMessages, setLikedMessages] = useState(new Set());
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [likeError, setLikeError] = useState(null);
  const [isLiking, setIsLiking] = useState(false);

  useEffect(() => {
    // Fetch assistants when component mounts
    const fetchAssistants = async () => {
      try {
        console.log('Fetching assistants from frontend...');
        const response = await axios.get('/api/assistants');
        console.log('Received assistants:', response.data);
        setAssistants(response.data);
        if (response.data.length > 0) {
          setSelectedAssistant(response.data[0].id);
        }
      } catch (error) {
        console.error('Error fetching assistants:', error);
        if (error.response) {
          console.error('Error response:', error.response.data);
        }
      }
    };

    fetchAssistants();
  }, []);

  // Load liked messages on mount
  useEffect(() => {
    const loadLikedMessages = async () => {
      try {
        const response = await axios.get('/api/likes');
        setLikedMessages(new Set(response.data.map(msg => msg.message_content)));
      } catch (error) {
        console.error('Error loading liked messages:', error);
      }
    };
    loadLikedMessages();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAssistant) return;

    const userMessage = input.trim() || "Please continue the conversation, referencing previous points.";
    setInput('');
    
    // IMPORTANT: Add user message to history BEFORE making the API call
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      assistantId: selectedAssistant
    };
    
    // Update messages immediately with user's message
    setAllMessages(prev => [...prev, newUserMessage]);

    console.log('Sending request with:', {
      currentAssistant: selectedAssistant,
      messageCount: allMessages.length + 1, // Include the new message
      newMessage: userMessage,
      allMessages: [...allMessages, newUserMessage] // Include the new message
    });

    setIsLoading(true);

    try {
      const response = await axios.post('/api/chat', {
        assistantId: selectedAssistant,
        message: userMessage,
        threadId: threads[selectedAssistant],
        previousMessages: [...allMessages, newUserMessage], // Include the new message
        isContextOnly: !input.trim()
      });

      // Store thread ID for this assistant
      setThreads(prev => ({
        ...prev,
        [selectedAssistant]: response.data.threadId
      }));

      // Add assistant response to global history
      setAllMessages(prev => [...prev, {
        role: 'assistant',
        content: response.data.response,
        timestamp: Date.now(),
        assistantId: selectedAssistant
      }]);

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setAllMessages(prev => [...prev, {
        role: 'error',
        content: 'Sorry, there was an error processing your request.',
        timestamp: Date.now(),
        assistantId: selectedAssistant
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Modified to automatically trigger context transfer
  const handleAssistantChange = (e) => {
    setSelectedAssistant(e.target.value);
    // Optional: Automatically trigger context transfer when switching assistants
    // handleSubmit(new Event('submit'));
  };

  // Get all messages to display
  const currentMessages = allMessages;

  const handleLike = async (message, assistantId, assistantName) => {
    setIsLiking(true);
    setLikeError(null);
    try {
      const response = await axios.post('/api/likes', {
        message: message.content,
        assistantId,
        assistantName,
        context: message.context || null,
        tags: message.tags || []
      });

      if (!response.data.ok) {
        throw new Error('Failed to like message');
      }

      const result = response.data.data;
      // Update UI to show the message was liked
      setLikedMessages(prev => new Set([...prev, message.content]));
      setSnackbarMessage('Message saved to favorites!');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error liking message:', error);
      setLikeError('Failed to like message. Please try again.');
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        OpenAI Assistant Chat
      </Typography>
      
      <Paper elevation={3} sx={{ height: '70vh', display: 'flex', flexDirection: 'column', p: 2 }}>
        <Box sx={{ flexGrow: 1, overflow: 'auto', mb: 2 }}>
          {currentMessages.map((message, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                mb: 2
              }}
            >
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  maxWidth: '70%',
                  backgroundColor: message.role === 'user' ? '#e3f2fd' : 
                                 message.role === 'error' ? '#ffebee' : '#f5f5f5',
                  borderLeft: message.assistantId === selectedAssistant ? '4px solid #2196f3' : 'none',
                  position: 'relative'
                }}
              >
                {message.assistantId !== selectedAssistant && (
                  <Typography variant="caption" color="textSecondary" display="block">
                    {assistants.find(a => a.id === message.assistantId)?.name || 'Unknown Assistant'}
                  </Typography>
                )}
                {message.role === 'user' ? (
                  <Typography>{message.content}</Typography>
                ) : (
                  <>
                    <ReactMarkdown
                      components={{
                        p: ({node, ...props}) => <Typography {...props} paragraph />,
                        h3: ({node, ...props}) => <Typography variant="h6" {...props} gutterBottom />,
                        h4: ({node, ...props}) => <Typography variant="subtitle1" {...props} gutterBottom />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    {message.role === 'assistant' && (
                      <IconButton
                        size="small"
                        onClick={() => handleLike(message, message.assistantId, assistants.find(a => a.id === message.assistantId)?.name || 'Unknown Assistant')}
                        sx={{ position: 'absolute', right: 8, bottom: 8 }}
                        disabled={isLiking}
                      >
                        {isLiking ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          likedMessages.has(message.content) ? (
                            <FavoriteIcon color="error" />
                          ) : (
                            <FavoriteBorderIcon />
                          )
                        )}
                      </IconButton>
                    )}
                    {likeError && (
                      <div className="error-message" style={{ color: 'red', marginTop: '8px' }}>
                        {likeError}
                      </div>
                    )}
                  </>
                )}
              </Paper>
            </Box>
          ))}
        </Box>

        <Box sx={{ mb: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Assistant</InputLabel>
            <Select
              value={selectedAssistant}
              label="Assistant"
              onChange={handleAssistantChange}
            >
              {assistants.map((assistant) => (
                <MenuItem key={assistant.id} value={assistant.id}>
                  {assistant.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            variant="contained" 
            endIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            disabled={isLoading || !selectedAssistant}
            onClick={handleSubmit}
          >
            {input.trim() ? 'Send Message' : 'Continue with New Assistant'}
          </Button>
        </form>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Container>
  );
}

export default App; 