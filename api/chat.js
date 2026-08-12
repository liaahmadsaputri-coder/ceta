export const config = {
  runtime: 'edge', // Ini kunci utama supaya Vercel bisa streaming SSE tanpa error 404
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { contents } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key belum dikonfigurasi di Vercel.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: errText }), {
        status: geminiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Mengalirkan (stream) langsung respons dari Gemini ke Frontend
    return new Response(geminiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Gagal menghubungkan ke AI.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
