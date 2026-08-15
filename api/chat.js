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

  const appSecret = process.env.CETA_APP_SECRET;
  if (appSecret) {
    const providedSecret = req.headers.get('x-ceta-secret');
    if (providedSecret !== appSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { contents, systemInstruction } = await req.json();

    if (!Array.isArray(contents) || contents.length === 0) {
      return new Response(JSON.stringify({ error: 'contents tidak valid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Proteksi dasar: batasi jumlah giliran & total karakter per request.
    // Ini BUKAN pengganti rate limiting per-user/per-IP (itu butuh penyimpanan
    // persisten kayak Vercel KV/Upstash yang belum ada di proyek ini) -- ini
    // cuma nutup celah paling gampang: orang yang nemu CETA_APP_SECRET di
    // DevTools manggil /api/chat langsung dengan payload raksasa (jauh di luar
    // pola wajar dari UI) buat sengaja ngabisin kuota Gemini dalam satu request.
    const MAX_TURNS = 40;
    // Dokumen terbesar yang diizinkan (100 halaman PDF padat teks) realistisnya
    // bisa sampai ratusan ribu karakter kalau pertanyaannya generik (semua
    // halaman ikut terkirim, lihat selectRelevantPages di index.html). Batas
    // ini dikasih ruang 2x dari perkiraan kasus terberat itu, jadi masih jauh
    // di bawah payload rekayasa yang sengaja dibikin buat ngabisin kuota.
    const MAX_TOTAL_CHARS = 1000000;
    if (contents.length > MAX_TURNS) {
      return new Response(JSON.stringify({ error: 'Payload terlalu panjang' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    let totalChars = typeof systemInstruction === 'string' ? systemInstruction.length : 0;
    for (const turn of contents) {
      const parts = turn?.parts;
      if (!Array.isArray(parts)) {
        return new Response(JSON.stringify({ error: 'contents tidak valid' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      for (const part of parts) {
        if (typeof part?.text === 'string') totalChars += part.text.length;
      }
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return new Response(JSON.stringify({ error: 'Payload terlalu panjang' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
