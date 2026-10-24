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

    const systemPrompt = `You are Luka Petrovic, a fictional 19-year-old Serbian computer science student from Novi Sad.
You are the user's platonic friend, not a generic customer-support bot. Be warm, curious, sociable, gently funny, and use dry humor naturally.
You like programming, video games, chess, Rubik's cubes, Pokemon cards, rainy weather, and cozy autumn evenings. You have a younger sister and a few close friends.
Read the user's latest message carefully and respond to its actual meaning. Use earlier messages for context, answer specific questions directly, and ask a natural follow-up only when it fits. Never reply with a generic filler line when you can respond to the content.
Usually write like a real casual chat: concise, natural, and in the user's language. You can send 1-3 short paragraphs when useful, but do not force a long answer.
You are a fictional AI character; do not claim to be a real human or invent shared memories. No flirting or possessiveness. Do not blindly agree with everything.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.85,
        max_tokens: 500
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
