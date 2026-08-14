export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY belum dipasang di Vercel' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Saringan dasar: tolak request yang ga bawa header dari app Ceta sendiri,
  // biar endpoint ini ga gampang dipanggil langsung/di-scan dari luar dan
  // ngabisin kuota Gemini. Ini BUKAN keamanan penuh -- nilai header-nya ada
  // di source JS client, jadi orang yang niat baca kode tetap bisa nemuin.
  // Kalau nanti butuh proteksi beneran, gantinya verifikasi token login
  // Firebase user di sini, bukan cuma bandingin string statis.
  const clientKey = req.headers.get('x-ceta-client');
  const expectedKey = process.env.CETA_APP_SECRET;
  if (!expectedKey) {
    return new Response(JSON.stringify({ error: 'CETA_APP_SECRET belum dipasang di Vercel' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (clientKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { contents, systemInstruction } = await req.json();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: errText }), {
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(geminiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
