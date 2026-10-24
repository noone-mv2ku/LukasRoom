
const messagesArea = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const typing = document.getElementById("typing");
const newChatButton = document.getElementById("newChat");

const STORAGE_KEY = "lukas-room-messages";

function escapeHTML(text) {
    return text.replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function addMessage(text, sender, save = true) {
    const row = document.createElement("div");
    row.className = `message-row ${sender}-row`;

    const safeText = escapeHTML(text).replace(/\n/g, "<br>");

    if (sender === "luka") {
        row.innerHTML = `
            <div class="message-avatar">L</div>
            <div class="message-content">
                <div class="sender">Luka <span>just now</span></div>
                <div class="bubble luka-bubble">${safeText}</div>
            </div>
        `;
    } else {
        row.innerHTML = `
            <div class="message-content">
                <div class="sender">You <span>just now</span></div>
                <div class="bubble user-bubble">${safeText}</div>
            </div>
        `;
    }

    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    if (save) {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        history.push({ text, sender });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
}

function loadMessages() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (history.length === 0) return;

    messagesArea.innerHTML = "";

    history.forEach(message => {
        addMessage(message.text, message.sender, false);
    });
}

function temporaryReply() {
    const replies = [
        "wait, tell me more 👀",
        "okay, you have my attention.",
        "LMAO 😭 okay, explain.",
        "hmm. and what happened after that?",
        "i was going to do something productive, but here we are.",
        "not gonna lie, that's actually interesting.",
        "alright, i'm listening. go on.",
        "bro 💀 i need the full story.",
        "you can't just say that and leave me with questions."
    ];

    const reply = replies[Math.floor(Math.random() * replies.length)];

    typing.style.display = "block";
    sendButton.disabled = true;

    setTimeout(() => {
        typing.style.display = "none";
        addMessage(reply, "luka");
        sendButton.disabled = false;
        messageInput.focus();
    }, 900 + Math.random() * 1000);
}

chatForm.addEventListener("submit", event => {
    event.preventDefault();

    const text = messageInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    messageInput.value = "";
    temporaryReply();
});

newChatButton.addEventListener("click", () => {
    const confirmed = confirm("Start a new conversation? This will clear the saved chat.");

    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    messagesArea.innerHTML = "";
    addMessage("hey, we're starting fresh. what's on your mind? 👀", "luka");
});

loadMessages();
