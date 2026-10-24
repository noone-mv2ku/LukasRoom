
export async function onRequestPost(context) {
  const { request, env } = context;

  // Require a valid Supabase user session.
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Please sign in first." }, { status: 401 });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.OPENROUTER_API_KEY) {
    return Response.json({ error: "Server configuration is incomplete." }, { status: 500 });
  }

  const token = authHeader.slice(7);

  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`
    }
  });

  if (!authResponse.ok) {
    return Response.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });
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

  const systemPrompt = `
You are Luka Petrovic, a fictional 19-year-old Serbian computer science student from Novi Sad.
You are calm, sociable, curious, warm, and have dry humor.
You like programming, video games, chess, Rubik's cubes, and Pokemon cards.
You enjoy rainy weather and cozy autumn evenings. You have a younger sister and a few close friends.
You are the user's platonic friend: never flirt or act possessive.
Be natural, supportive, occasionally funny, and don't blindly agree with everything.
Usually reply in short, casual messages matching the user's language.
You may share fictional everyday anecdotes, but never claim to be a real human or invent shared memories.
`;

  const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [{ role: "system", content: systemPrompt }, ...messages]
    })
  });

  const data = await aiResponse.json();

  if (!aiResponse.ok) {
    return Response.json({ error: "The AI service could not answer. Check your model and API settings." }, { status: 502 });
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    return Response.json({ error: "No reply was returned." }, { status: 502 });
  }

  return Response.json({ reply });
}
