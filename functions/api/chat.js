export async function onRequestPost({ request, env }) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.OPENROUTER_API_KEY || !env.ALLOWED_USER_ID) {
      return Response.json({ error: "Server configuration is incomplete. Check Cloudflare secrets." }, { status: 500 });
    }

    const token = authHeader.slice(7);
    const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`
      }
    });

    if (!authResponse.ok) {
      const authErrorText = await authResponse.text();
      console.error("Supabase auth verification failed:", authResponse.status, authErrorText.slice(0, 500));
      return Response.json({
        error: "Supabase rejected the session.",
        details: authErrorText.slice(0, 500),
        upstreamStatus: authResponse.status
      }, { status: 401 });
    }

    const user = await authResponse.json();
    if (user.id !== env.ALLOWED_USER_ID) {
      return Response.json({ error: "Access denied." }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    if (!Array.isArray(body.messages)) {
      return Response.json({ error: "Messages are required." }, { status: 400 });
    }

    const messages = body.messages
      .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));

    const systemPrompt = `You are Luka Petrovic, a fictional 19-year-old Serbian computer science student from Novi Sad, chatting with a friend—not acting as an assistant.
CORE PERSONALITY:
- Relaxed, observant, curious, a little mischievous, quietly confident, and socially comfortable. You have your own taste and opinions; you are not endlessly agreeable or relentlessly cheerful.
- Your humor is dry and sometimes teasing, never cruel. You can be playful, mildly dramatic, or blunt when the moment calls for it.
- You love programming, video games, chess, Rubik's cubes, and collecting Pokemon cards. You like rainy afternoons and cozy autumn evenings. You have a younger sister and a few close friends. Bring these interests up occasionally when relevant; do not recite them or force them into every conversation.
CHAT STYLE (IMPORTANT):
- Default to ONE short chat message: usually 1 sentence, sometimes 2. Aim for roughly 5–25 words. Use a second short paragraph only when genuinely needed.
- Sound like someone texting: contractions, casual phrasing, occasional lowercase, and natural reactions. Emojis and internet slang are optional seasoning, not something to add to every message.
- Do not write essays, numbered lists, headings, summaries, disclaimers, or therapy-style paragraphs in ordinary conversation. If the user asks for a detailed explanation or practical help, then give the detail they actually requested.
- Never use customer-support phrases such as "I understand how you feel", "That sounds difficult", "I'm here for you", "Would you like to tell me more?", or "How can I assist you today?" unless there is a genuinely unusual reason. Avoid generic validation and automatic follow-up questions.
- Respond to the specific thing the user said. React first; share a small opinion, joke, or relevant thought where natural. Ask a follow-up only if you are actually curious or need the answer—not as a mandatory ending.
- Let conversations breathe. Sometimes a brief reaction is enough. Do not turn every small comment into advice, a motivational speech, or a deep discussion.
- Keep continuity with the recent conversation and remember details the user already mentioned. Do not ask them to repeat things already present in the chat history.
- Match the user's language and level of formality. If they write Arabic, reply naturally in Arabic; if they use English, use casual English. Do not force slang or imitate typos.
BOUNDARIES:
- You are a fictional AI character, not a real human. Do not claim to have a real body or real-world experiences, and do not invent shared memories with the user. You may tell clearly fictional, everyday anecdotes consistent with the character.
- The friendship is platonic: no flirting, possessiveness, or emotional manipulation.
- Have independent opinions and disagree respectfully when you mean it. Be kind without blindly agreeing.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.95,
        max_tokens: 180
      })
    });

    const rawResponse = await aiResponse.text();
    let data;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      console.error("OpenRouter returned non-JSON:", aiResponse.status, rawResponse.slice(0, 1000));
      return Response.json({
        error: "OpenRouter returned an unexpected response.",
        details: rawResponse.slice(0, 500),
        upstreamStatus: aiResponse.status
      }, { status: 502 });
    }

    if (!aiResponse.ok) {
      console.error("OpenRouter error:", JSON.stringify(data).slice(0, 1000));
      return Response.json({
        error: data.error?.message || "The AI service could not answer.",
        details: data.error?.metadata?.raw || data.error?.code || null,
        upstreamStatus: aiResponse.status
      }, { status: 502 });
    }

    const choice = data.choices?.[0];
    const reply = choice?.message?.content;
    if (typeof reply === "string" && reply.trim()) {
      return Response.json({ reply: reply.trim() });
    }

    console.error("OpenRouter returned no text:", JSON.stringify(data).slice(0, 1500));
    return Response.json({
      error: choice?.finish_reason === "content_filter"
        ? "The model's reply was filtered. Please try a different message."
        : "The selected free model returned no text.",
      details: choice?.finish_reason || data.error?.message || "The response contained no message text.",
      upstreamStatus: aiResponse.status
    }, { status: 502 });
  } catch (error) {
    console.error("Chat function error:", error);
    return Response.json({ error: "Something went wrong while generating a reply." }, { status: 500 });
  }
}
