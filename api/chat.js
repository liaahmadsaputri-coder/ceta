import { GoogleGenerativeAI } from "@google/generative-ai";

// Menggunakan Edge Runtime agar streaming lancar di Vercel
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Hanya menerima HTTP POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ambil API Key dari Environment Variable Vercel (Aman dari publik)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY belum dipasang di Environment Variables Vercel' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { contents, systemInstruction } = await req.json();

    if (!contents || !Array.isArray(contents)) {
      return new Response(JSON.stringify({ error: 'Format data tidak valid: contents harus berupa Array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Inisialisasi SDK Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction || undefined,
    });

    // Minta stream dari Gemini
    const result = await model.generateContentStream({ contents });

    // Kirim respons balik ke frontend secara streaming
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        console.log("Koneksi ditutup oleh pengguna.");
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error("Error backend chat:", error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
