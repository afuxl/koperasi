// File: /api/generate/route.js

//import fetch from 'node-fetch';

/**
 * Fungsi handler Vercel untuk memproses permintaan API dari frontend.
 * @param {Request} request - Objek permintaan HTTP.
 * @returns {Response} Objek respons HTTP.
 */
export default async function handler(request) {
    // Memastikan metode permintaan adalah POST
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            error: "Metode HTTP tidak didukung. Harap gunakan POST."
        }), {
            status: 405,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    // Ambil kunci API dari variabel lingkungan Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({
            error: "GEMINI_API_KEY tidak ditemukan. Mohon atur variabel lingkungan Vercel."
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    let prompt;
    try {
        const body = await request.json();
        prompt = body.prompt;

        if (!prompt) {
            return new Response(JSON.stringify({
                error: "Prompt tidak ditemukan dalam permintaan."
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            error: `Format JSON tidak valid: ${error.message}`
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    // URL API Google Gemini (model gemini-2.5-flash-preview-05-20)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }]
    };

    let maxRetries = 5;
    let backoffDelay = 1000; // dalam milidetik

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Throw error untuk mengaktifkan blok catch dan retry
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Cek jika respons memiliki struktur yang diharapkan
            if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const generatedText = result.candidates[0].content.parts[0].text;
                return new Response(JSON.stringify({
                    generatedText: generatedText
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                return new Response(JSON.stringify({
                    error: "Respons API tidak memiliki struktur yang diharapkan."
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            if (i < maxRetries - 1) {
                // Retry dengan backoff eksponensial
                await new Promise(res => setTimeout(res, backoffDelay));
                backoffDelay *= 2;
            } else {
                return new Response(JSON.stringify({
                    error: `Gagal menghubungi API Google Gemini setelah beberapa kali percobaan: ${error.message}`
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
        }
    }

    return new Response(JSON.stringify({
        error: "Gagal menghubungi API Google Gemini."
    }), {
        status: 500,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
