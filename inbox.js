/**
 * USER INBOX SYSTEM - Shared across all pages
 * ============================================
 * This file provides inbox functionality that can be used from any page.
 * When users complete actions (donations, feedback, mentorship, events),
 * messages are automatically added to their personal inbox.
 */

// ============================================================================
// CORE INBOX FUNCTIONS
// ============================================================================

function getCurrentUserId() {
  // Get current user ID from localStorage
  // Uses email as unique identifier (primary), falls back to userId
  const email = localStorage.getItem('loggedInUser');
  if (email) return email;
  
  const userId = localStorage.getItem('userId');
  if (userId) return userId;
  
  // Fallback: use a default user ID
  return 'USER001';
}

function getUserMessages() {
  const userId = getCurrentUserId();
  const messages = localStorage.getItem(`userMessages_${userId}`);
  return messages ? JSON.parse(messages) : [];
}

function saveUserMessages(messages) {
  const userId = getCurrentUserId();
  localStorage.setItem(`userMessages_${userId}`, JSON.stringify(messages));
}

/**
 * Add a message to the user's inbox
 * @param {Object} messageData - The message data
 * @param {string} messageData.type - Message type: 'event', 'donation', 'mentorship', 'feedback'
 * @param {string} messageData.title - Message title
 * @param {string} messageData.message - Message content
 * @param {Object} messageData.metadata - Optional metadata (amount, eventName, etc.)
 * @returns {string} The message ID
 */
function addUserMessage(messageData) {
  const messages = getUserMessages();
  
  const newMessage = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    type: messageData.type || 'info',
    title: messageData.title,
    message: messageData.message,
    metadata: messageData.metadata || {},
    timestamp: new Date().toLocaleString(),
    read: false,
    dismissed: false,
    createdAt: Date.now()
  };
  
  messages.unshift(newMessage);  // Add to beginning
  
  // Keep only last 100 messages
  if (messages.length > 100) {
    messages.splice(100);
  }
  
  saveUserMessages(messages);
  console.log('✅ Message added to inbox:', newMessage.title);
  
  return newMessage.id;
}

function markMessageAsRead(messageId) {
  const messages = getUserMessages();
  const message = messages.find(m => m.id === messageId);
  if (message) {
    message.read = true;
    saveUserMessages(messages);
  }
}

function dismissUserMessage(messageId) {
  const messages = getUserMessages();
  const message = messages.find(m => m.id === messageId);
  if (message) {
    message.dismissed = true;
    saveUserMessages(messages);
  }
}

function getUnreadMessages() {
  const messages = getUserMessages();
  return messages.filter(m => !m.read && !m.dismissed);
}

function getActiveMessages() {
  const messages = getUserMessages();
  return messages.filter(m => !m.dismissed);
}

// Make functions globally accessible
if (typeof window !== 'undefined') {
  window.addUserMessage = addUserMessage;
  window.getUserMessages = getUserMessages;
  window.markMessageAsRead = markMessageAsRead;
  window.dismissUserMessage = dismissUserMessage;
  window.getUnreadMessages = getUnreadMessages;
  window.getActiveMessages = getActiveMessages;
}

