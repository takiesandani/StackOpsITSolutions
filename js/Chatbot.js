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

    // Initialize chatbot widget
    function initChatbot() {
        // Check if user is authenticated
        const token = localStorage.getItem('authToken');
        const isLoggedIn = sessionStorage.getItem('isLoggedIn');

        if (!token || isLoggedIn !== 'true') {
            return; // Don't show widget if not authenticated
        }

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
        
        // Initialize with welcome message
        if (messages.length === 0) {
            setTimeout(() => {
                setIsTyping(true);
                setTimeout(() => {
                    setIsTyping(false);
                    addMessage('bot', 'Hi, welcome to Stack Ops IT Solutions');
                    setTimeout(() => {
                        setIsTyping(true);
                        setTimeout(() => {
                            setIsTyping(false);
                            addMessage('bot', 'Can I help you get started?', ['Yes', 'No']);
                        }, 800);
                    }, 1600);
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
                        <div class="text-bubble">
                            ${msg.text}
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

    function handleButtonClick(buttonText) {
        addMessage('user', buttonText);
        setIsTyping(true);

        // Get bot response
        setTimeout(async () => {
            setIsTyping(false);
            const response = await getBotResponse(buttonText);
            if (response) {
                addMessage('bot', response.text, response.buttons);
            }
        }, 1200);
    }

    async function getBotResponse(userInput) {
        const input = userInput.toLowerCase();
        
        // Default: send to backend
        return await sendToBackend(userInput);
    }

    async function sendTextMessage() {
        const input = document.getElementById('chatbot-input');
        const message = input?.value.trim();
        
        if (!message) return;
        
        input.value = '';
        addMessage('user', message);
        setIsTyping(true);
        
        setTimeout(async () => {
            setIsTyping(false);
            const response = await sendToBackend(message);
            if (response) {
                addMessage('bot', response.text, response.buttons);
            }
        }, 500);
    }

    async function sendToBackend(message) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return {
                text: 'Error: You are not authenticated. Please refresh the page.',
                buttons: null
            };
        }

        setIsTyping(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();
            
            if (!response.ok) {
                return {
                    text: data.text || 'Sorry, I encountered an error. Please try again or contact support.',
                    buttons: null
                };
            }

            if (typeof data.text === "string" && data.text.trim().startsWith("{")) {
                // If AI responded with normal text (not JSON), return it
                if (!parsed) {
                    await saveChatMessage(userId, "user", message);
                    await saveChatMessage(userId, "assistant", aiReply);
                    return res.json({ text: aiReply });
                }

            }

            setIsTyping(false);
            return {
                text: data.text || 'No response received',
                buttons: null
            };
        } catch (error) {
            console.error('Chat error:', error);
            setIsTyping(false);
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
