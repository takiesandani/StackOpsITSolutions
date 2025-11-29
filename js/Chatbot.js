const chatLogo = document.getElementById("chatBots-logo");
const chatBot = document.getElementById("ChatBot");
const closeBtn = document.getElementById("closeChatBot");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatMessages = document.getElementById("chatMessages");
const typing = showTyping();

chatLogo.addEventListener("click", function () {
    chatBot.classList.add("show");      // show chatbot
    chatLogo.style.display = "none";    // hide floating logo
});

closeBtn.addEventListener("click", function () {
    chatBot.classList.remove("show");   // hide chatbot
    chatLogo.style.display = "flex";    // show floating logo again
});


chatForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const message = userInput.value.trim();
    if (message === "") return;

    addMessage(message, "user");

    // Simulated bot response (replace with your API)
    setTimeout(() => {
        addMessage("Processing your request...", "bot");
    }, 600);

    userInput.value = "";
});

function addMessage(text, sender) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", sender);
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
    const typingDiv = document.createElement("div");
    typingDiv.classList.add("typing");
    typingDiv.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return typingDiv;
}


setTimeout(() => {
    typing.remove();
    addMessage("Still under construction...", "bot");
}, 1200);

chatLogo.addEventListener("click", function () {
    chatBot.classList.add("show");
    chatLogo.style.display = "none";

    loadHistory();

    // Only show welcome message if first time
    if (!localStorage.getItem("welcomed")) {
        setTimeout(() => {
            addMessage("👋 Welcome! How can I help you today?", "bot");
        }, 500);

        localStorage.setItem("welcomed", "yes");
    }
});
