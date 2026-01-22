/**
 * Stack Ops IT Chat Widget
 * Vanilla JavaScript version for Client Portal
 * Design matches stackops-chat.tsx
 * Only shows when user is authenticated
 */

(function() {
    'use strict';

    let chatWidget = null;
    let isOpen = false;
    let messages = [];
    let isTyping = false;
    let messagesEndRef = null;
    let isSendingMessage = false; // Prevent race conditions
    let retryCount = 0;
    const MAX_RETRIES = 3;

    // Load messages from localStorage on initialization
    function loadMessagesFromStorage() {
        try {
            const stored = localStorage.getItem('chatbot_messages');
            if (stored) {
                messages = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load messages from storage:', e);
            messages = [];
        }
    }

    // Save messages to localStorage
    function saveMessagesToStorage() {
        try {
            localStorage.setItem('chatbot_messages', JSON.stringify(messages));
        } catch (e) {
            console.warn('Failed to save messages to storage:', e);
        }
    }

    // Initialize chatbot widget
    function initChatbot() {
        // Check if widget already exists to prevent duplicate initialization
        if (document.getElementById('chatbot-widget')) {
            return;
        }

        // Check if user is authenticated
        const token = localStorage.getItem('authToken');
        const isLoggedIn = sessionStorage.getItem('isLoggedIn');

        if (!token || isLoggedIn !== 'true') {
            return; // Don't show widget if not authenticated
        }

        // Load messages from storage
        loadMessagesFromStorage();

        // Create widget HTML
        const widgetHTML = `
            <div id="chatbot-widget" class="chatbot-widget">
                ${isOpen ? `
                    <div class="chat-corner">
                        <div class="corner-controls">
                            <button class="mini-btn" id="chatbot-scroll-down" title="Scroll down">
                                ▼
                            </button>
                            <button class="mini-btn close-x" id="chatbot-close" title="Close">
                                ✕
                            </button>
                        </div>
                        <div class="corner-messages" id="chatbot-messages"></div>
                    </div>
                ` : ''}
                <button id="chatbot-toggle" class="main-toggle ${isOpen ? 'on' : ''}" aria-label="${isOpen ? 'Close chat' : 'Open chat'}">
                    ${isOpen ? '✕' : `
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 30 L35 15 L65 15 L80 30 L80 70 L65 85 L35 85 L20 70 Z" fill="#0052CC"/>
                            <path d="M30 40 L40 30 L60 30 L70 40 L70 60 L60 70 L40 70 L30 60 Z" fill="#0066FF"/>
                            <circle cx="50" cy="50" r="8" fill="white"/>
                        </svg>
                    `}
                </button>
            </div>
        `;

        // Add widget to page
        const widgetContainer = document.createElement('div');
        widgetContainer.innerHTML = widgetHTML;
        document.body.appendChild(widgetContainer);

        chatWidget = document.getElementById('chatbot-widget');
        messagesEndRef = document.createElement('div');
        
        // Initialize with personalized greeting (only if no messages exist)
        if (messages.length === 0) {
            // Get user's first name from session storage
            const firstName = sessionStorage.getItem('userFirstName') || 'there';
            
            setTimeout(() => {
                setIsTyping(true);
                setTimeout(() => {
                    setIsTyping(false);
                    addMessage('bot', `Hi ${firstName}, how may I help?`, [ 'Make Payments', 'Contact Support']);
                }, 800);
            }, 100);
        } else {
            renderMessages();
        }

        // Event listeners
        document.getElementById('chatbot-toggle').addEventListener('click', toggleChat);
        const closeBtn = document.getElementById('chatbot-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', toggleChat);
        }
        const scrollBtn = document.getElementById('chatbot-scroll-down');
        if (scrollBtn) {
            scrollBtn.addEventListener('click', () => {
                messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
            });
        }
    }

    function setIsTyping(typing) {
        isTyping = typing;
        renderMessages();
    }

    function addMessage(sender, text, buttons = null) {
        messages.push({ sender, text, buttons });
        saveMessagesToStorage(); // Persist to localStorage
        renderMessages();
    }

    function toggleChat() {
        isOpen = !isOpen;
        const widget = document.getElementById('chatbot-widget');
        const toggle = document.getElementById('chatbot-toggle');
        
        if (isOpen) {
            // Create chat corner
            const chatCorner = document.createElement('div');
            chatCorner.className = 'chat-corner';
            chatCorner.innerHTML = `
                <div class="corner-controls">
                    <button class="mini-btn" id="chatbot-scroll-down" title="Scroll down">▼</button>
                    <button class="mini-btn close-x" id="chatbot-close" title="Close">✕</button>
                </div>
                <div class="corner-messages" id="chatbot-messages"></div>
                <div class="chatbot-input-container">
                    <input 
                        type="text" 
                        id="chatbot-input" 
                        class="chatbot-input" 
                        placeholder="Type your message..."
                        autocomplete="off"
                    />
                    <button id="chatbot-send" class="chatbot-send">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            `;
            widget.insertBefore(chatCorner, toggle);
            
            toggle.classList.add('on');
            toggle.innerHTML = '✕';
            toggle.setAttribute('aria-label', 'Close chat');
            
            document.getElementById('chatbot-close').addEventListener('click', toggleChat);
            document.getElementById('chatbot-scroll-down').addEventListener('click', () => {
                messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
            });
            
            // Add input event listeners
            const input = document.getElementById('chatbot-input');
            const sendBtn = document.getElementById('chatbot-send');
            if (input && sendBtn) {
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        sendTextMessage();
                    }
                });
                sendBtn.addEventListener('click', sendTextMessage);
                input.focus();
            }
            
            renderMessages();
        } else {
            const chatCorner = widget.querySelector('.chat-corner');
            if (chatCorner) {
                chatCorner.remove();
            }
            
            toggle.classList.remove('on');
            toggle.innerHTML = `
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 30 L35 15 L65 15 L80 30 L80 70 L65 85 L35 85 L20 70 Z" fill="#0052CC"/>
                    <path d="M30 40 L40 30 L60 30 L70 40 L70 60 L60 70 L40 70 L30 60 Z" fill="#0066FF"/>
                    <circle cx="50" cy="50" r="8" fill="white"/>
                </svg>
            `;
            toggle.setAttribute('aria-label', 'Open chat');
        }
    }

    function renderMessages() {
        const messagesContainer = document.getElementById('chatbot-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = messages.map((msg, idx) => {
            const isUser = msg.sender === 'user';
            return `
                <div class="msg ${msg.sender}" style="animation-delay: ${idx * 0.1}s">
                    ${msg.sender === 'bot' ? `
                        <div class="bot-icon">
                            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 30 L35 15 L65 15 L80 30 L80 70 L65 85 L35 85 L20 70 Z" fill="#0052CC" stroke="#003D99" stroke-width="3"/>
                                <path d="M30 40 L40 30 L60 30 L70 40 L70 60 L60 70 L40 70 L30 60 Z" fill="#0066FF" stroke="#0052CC" stroke-width="2"/>
                                <circle cx="50" cy="50" r="8" fill="white"/>
                            </svg>
                        </div>
                    ` : ''}
                    <div class="msg-wrapper">
                        <div class="text-bubble" style="white-space: pre-line;">
                            ${msg.text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #0066FF; text-decoration: underline;">$1</a>')}
                        </div>
                        ${msg.buttons ? `
                            <div class="btn-group">
                                ${msg.buttons.map(btn => `
                                    <button class="opt-btn" data-button="${btn}">${btn}</button>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add typing indicator
        if (isTyping) {
            messagesContainer.innerHTML += `
                <div class="msg bot">
                    <div class="bot-icon">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 30 L35 15 L65 15 L80 30 L80 70 L65 85 L35 85 L20 70 Z" fill="#0052CC" stroke="#003D99" stroke-width="3"/>
                            <path d="M30 40 L40 30 L60 30 L70 40 L70 60 L60 70 L40 70 L30 60 Z" fill="#0066FF" stroke="#0052CC" stroke-width="2"/>
                            <circle cx="50" cy="50" r="8" fill="white"/>
                        </svg>
                    </div>
                    <div class="msg-wrapper">
                        <div class="text-bubble typing-anim">
                            <div class="dot-anim">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Add scroll anchor
        messagesContainer.appendChild(messagesEndRef);
        messagesEndRef.scrollIntoView({ behavior: 'smooth' });

        // Add button click handlers
        messagesContainer.querySelectorAll('.opt-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                handleButtonClick(this.dataset.button);
            });
        });
    }

    async function handleButtonClick(buttonText) {
        if (isSendingMessage) return; // Prevent multiple simultaneous requests
        
        addMessage('user', buttonText);
        setIsTyping(true);

        try {
            const response = await getBotResponse(buttonText);
            setIsTyping(false);
            
            if (response) {
                // Handle multi-message responses
                if (response.hasMoreMessages && response.nextMessage) {
                    // Add first message
                    addMessage('bot', response.text, response.buttons);
                    
                    // Automatically add second message after a short delay
                    setTimeout(() => {
                        setIsTyping(true);
                        setTimeout(() => {
                            setIsTyping(false);
                            addMessage('bot', response.nextMessage, null);
                        }, 500);
                    }, 300);
                } else {
                    // Single message response
                    addMessage('bot', response.text, response.buttons);
                }
            }
        } catch (error) {
            setIsTyping(false);
            console.error('Error handling button click:', error);
            addMessage('bot', 'Sorry, I encountered an error. Please try again.', null);
        }
    }

    async function getBotResponse(userInput) {
        const input = userInput.toLowerCase();
        
        // Default: send to backend
        return await sendToBackend(userInput);
    }

    async function sendTextMessage() {
        if (isSendingMessage) return; // Prevent multiple simultaneous requests
        
        const input = document.getElementById('chatbot-input');
        const message = input?.value.trim();
        
        if (!message) return;
        
        // Validate message length (2000 character limit)
        if (message.length > 2000) {
            addMessage('bot', 'Your message is too long. Please keep it under 2000 characters.', null);
            return;
        }
        
        input.value = '';
        input.disabled = true; // Disable input while sending
        addMessage('user', message);
        setIsTyping(true);
        isSendingMessage = true;
        
        try {
            const response = await sendToBackend(message);
            setIsTyping(false);
            
            if (response) {
                // Handle multi-message responses
                if (response.hasMoreMessages && response.nextMessage) {
                    // Add first message
                    addMessage('bot', response.text, response.buttons);
                    
                    // Automatically add second message after a short delay
                    setTimeout(() => {
                        setIsTyping(true);
                        setTimeout(() => {
                            setIsTyping(false);
                            addMessage('bot', response.nextMessage, null);
                        }, 500);
                    }, 300);
                } else {
                    // Single message response
                    addMessage('bot', response.text, response.buttons);
                }
            }
        } catch (error) {
            setIsTyping(false);
            console.error('Error sending message:', error);
            addMessage('bot', 'Sorry, I encountered an error. Please try again.', null);
        } finally {
            isSendingMessage = false;
            input.disabled = false;
            input.focus();
        }
    }

    async function sendToBackend(message, retryAttempt = 0) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            setIsTyping(false);
            return {
                text: 'Error: You are not authenticated. Please refresh the page.',
                buttons: null
            };
        }

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: message }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                setIsTyping(false);
                // Retry on JSON parse errors if we haven't exceeded max retries
                if (retryAttempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryAttempt + 1))); // Exponential backoff
                    return sendToBackend(message, retryAttempt + 1);
                }
                return {
                    text: 'An error occurred. Please try again.',
                    buttons: null
                };
            }
            
            if (!response.ok) {
                setIsTyping(false);
                // Retry on 5xx errors if we haven't exceeded max retries
                if (response.status >= 500 && retryAttempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryAttempt + 1))); // Exponential backoff
                    return sendToBackend(message, retryAttempt + 1);
                }
                return {
                    text: data.text || 'An error occurred. Please try again.',
                    buttons: null
                };
            }

            setIsTyping(false);
            retryCount = 0; // Reset retry count on success
            
            // Get response text directly from backend
            let responseText = data.text || 'No response received';
            
            // Check if response is pure JSON (should not happen)
            if (typeof responseText === 'string' && responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
                try {
                    JSON.parse(responseText);
                    responseText = 'I apologize, but I encountered an issue processing that. Could you please rephrase your question?';
                } catch (e) {
                    // Not valid JSON, continue with responseText
                }
            }
            
            // Handle multi-message responses (e.g., payment info with separate link message)
            if (data.hasMoreMessages && data.nextMessage) {
                // Return special flag - don't add message here, let caller know it's already handled
                return {
                    text: responseText,
                    buttons: data.buttons || null,
                    hasMoreMessages: true,
                    nextMessage: data.nextMessage,
                    alreadyAdded: false  // Flag to indicate we need to add first message
                };
            }
            
            return {
                text: responseText,
                buttons: data.buttons || null
            };
        } catch (error) {
            clearTimeout(timeoutId);
            setIsTyping(false); // Always reset typing indicator on error
            
            // Retry on network errors if we haven't exceeded max retries
            if ((error.name === 'AbortError' || error.message.includes('fetch')) && retryAttempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryAttempt + 1))); // Exponential backoff
                return sendToBackend(message, retryAttempt + 1);
            }
            
            console.error('Chat error:', error);
            return {
                text: 'Sorry, I encountered an error. Please try again or contact support.',
                buttons: null
            };
        }
    }

    // Initialize when DOM is ready or after login
    function tryInit() {
        const token = localStorage.getItem('authToken');
        const isLoggedIn = sessionStorage.getItem('isLoggedIn');
        
        if (token && isLoggedIn === 'true' && !chatWidget) {
            initChatbot();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }

    // Also try to initialize after a short delay (in case login happens after page load)
    setTimeout(tryInit, 1000);

    // Expose init function for external calls (e.g., after login)
    window.initChatbot = tryInit;
})();
