export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY tidak ditemukan." }, { status: 500 });
  }

  let prompt;
  try {
    const body = await request.json();
    prompt = body.prompt;
    if (!prompt) {
      return Response.json({ error: "Prompt tidak ditemukan dalam permintaan." }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: `Format JSON tidak valid: ${error.message}` }, { status: 400 });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  let maxRetries = 5;
  let backoffDelay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const result = await response.json();

      if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return Response.json({ generatedText: result.candidates[0].content.parts[0].text });
      } else {
        return Response.json({ error: "Respons API tidak memiliki struktur yang diharapkan." }, { status: 500 });
      }
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, backoffDelay));
        backoffDelay *= 2;
      } else {
        return Response.json({ error: `Gagal menghubungi API Google Gemini: ${error.message}` }, { status: 500 });
      }
    }
  }

  return Response.json({ error: "Gagal menghubungi API Google Gemini." }, { status: 500 });
}
