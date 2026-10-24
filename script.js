// These two values are public Supabase project settings, not passwords.
// Replace the placeholders with your own Project URL and Publishable key.
const SUPABASE_URL = "https://sdbxxvfhuxpqdaxjvkiy.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_jpzmnHnZR60G_VK_wHF_bw_gb6BnB_h";

const messagesArea = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const typing = document.getElementById("typing");
const newChatButton = document.getElementById("newChat");
const authScreen = document.getElementById("authScreen");
const chatApp = document.getElementById("chatApp");
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const authStatus = document.getElementById("authStatus");
const logoutButton = document.getElementById("logoutButton");

let supabaseClient = null;
let currentUser = null;
let sending = false;

function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function showStatus(message) {
    authStatus.textContent = message;
}

function setLoggedIn(isLoggedIn) {
    authScreen.style.display = isLoggedIn ? "none" : "flex";
    chatApp.style.display = isLoggedIn ? "flex" : "none";
}

function addMessage(text, sender) {
    const row = document.createElement("div");
    row.className = `message-row ${sender === "assistant" ? "luka-row" : "user-row"}`;
    const safeText = escapeHTML(text).replace(/\n/g, "<br>");

    if (sender === "assistant") {
        row.innerHTML = `
          <div class="message-avatar">L</div>
          <div class="message-content">
            <div class="sender">Luka <span>just now</span></div>
            <div class="bubble luka-bubble">${safeText}</div>
          </div>`;
    } else {
        row.innerHTML = `
          <div class="message-content">
            <div class="sender">You <span>just now</span></div>
            <div class="bubble user-bubble">${safeText}</div>
          </div>`;
    }
    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

async function saveMessage(role, content) {
    const { error } = await supabaseClient.from("messages").insert({
        user_id: currentUser.id,
        role,
        content
    });
    if (error) throw error;
}

async function loadMessages() {
    messagesArea.innerHTML = '<div class="date-label">YOUR LITTLE CORNER</div>';
    const { data, error } = await supabaseClient
        .from("messages")
        .select("role, content, created_at")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true })
        .limit(300);

    if (error) throw error;
    if (!data || data.length === 0) {
        addMessage("oh, hey. you're finally here. I was supposed to be fixing a bug, but staring at it hasn't helped. Anyway, what's up? 👀", "assistant");
        return;
    }
    data.forEach(message => addMessage(message.content, message.role));
}

async function handleLogin(event) {
    event.preventDefault();
    if (!supabaseClient) {
        showStatus("Setup needed: add your Supabase Project URL and Publishable key in script.js first.");
        return;
    }

    loginButton.disabled = true;
    showStatus("Signing in…");
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    loginButton.disabled = false;

    if (error) {
        showStatus("Couldn't sign in: " + error.message);
        return;
    }

    currentUser = data.user;
    setLoggedIn(true);
    try {
        await loadMessages();
    } catch (loadError) {
        alert("Signed in, but messages could not load. Check that the messages table and its policies exist in Supabase. " + loadError.message);
    }
    messageInput.focus();
}

async function handleSend(event) {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || sending || !currentUser) return;

    sending = true;
    sendButton.disabled = true;
    messageInput.value = "";
    addMessage(text, "user");

    try {
        await saveMessage("user", text);
    } catch (error) {
        addMessage("I couldn't save that message. Check the Supabase messages table and policies.", "assistant");
        console.error(error);
        sending = false;
        sendButton.disabled = false;
        return;
    }

    typing.style.display = "block";
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your session expired. Please sign in again.");

        const { data: history, error: historyError } = await supabaseClient
            .from("messages")
            .select("role, content")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: true })
            .limit(20);
        if (historyError) throw historyError;

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({ messages: (history || []).map(m => ({ role: m.role, content: m.content })) })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "The AI service failed.");
        if (!result.reply) throw new Error("Luka returned an empty reply.");

        addMessage(result.reply, "assistant");
        await saveMessage("assistant", result.reply);
    } catch (error) {
        console.error(error);
        addMessage("I couldn't reach the AI right now: " + error.message, "assistant");
    } finally {
        typing.style.display = "none";
        sending = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

async function handleNewChat() {
    if (!currentUser) return;
    const confirmed = confirm("Start a new conversation? This will delete your saved messages.");
    if (!confirmed) return;

    const { error } = await supabaseClient.from("messages").delete().eq("user_id", currentUser.id);
    if (error) {
        alert("Couldn't clear saved messages: " + error.message);
        return;
    }
    messagesArea.innerHTML = '<div class="date-label">YOUR LITTLE CORNER</div>';
    addMessage("hey, we're starting fresh. what's on your mind? 👀", "assistant");
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    messagesArea.innerHTML = '<div class="date-label">YOUR LITTLE CORNER</div>';
    setLoggedIn(false);
    showStatus("Signed out.");
}

loginForm.addEventListener("submit", handleLogin);
chatForm.addEventListener("submit", handleSend);
newChatButton.addEventListener("click", handleNewChat);
logoutButton.addEventListener("click", handleLogout);

if (window.supabase && !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient.auth.getSession().then(async ({ data }) => {
        if (data.session) {
            currentUser = data.session.user;
            setLoggedIn(true);
            try { await loadMessages(); }
            catch (error) { console.error(error); alert("Could not load saved messages: " + error.message); }
        } else {
            setLoggedIn(false);
        }
    });
} else {
    setLoggedIn(false);
    showStatus("Setup needed: add your Supabase Project URL and Publishable key in script.js.");
}
