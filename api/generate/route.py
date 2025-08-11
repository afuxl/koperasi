import os
import json
import requests
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

def handler(request):
    """
    Fungsi handler Vercel untuk memproses permintaan API dari frontend.
    Ini menerima prompt, memanggil Google AI Gemini API, dan mengembalikan teks yang dihasilkan.
    """
    
    # Ambil kunci API dari variabel lingkungan Vercel. Ini adalah praktik terbaik untuk keamanan.
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return json.dumps({
            "error": "GEMINI_API_KEY tidak ditemukan. Mohon atur variabel lingkungan."
        }), 500, {'Content-Type': 'application/json'}

    # Mendapatkan prompt dari body permintaan JSON dengan cara yang lebih umum
    try:
        if request.method == "POST":
            # Baca body permintaan secara langsung dari input stream
            content_length = int(request.headers.get('Content-Length', 0))
            if content_length > 0:
                body = request.rfile.read(content_length)
                data = json.loads(body)
                prompt = data.get('prompt')
            else:
                return json.dumps({
                    "error": "Body permintaan kosong."
                }), 400, {'Content-Type': 'application/json'}
        else:
            return json.dumps({
                "error": "Metode HTTP tidak didukung. Harap gunakan POST."
            }), 405, {'Content-Type': 'application/json'}

        if not prompt:
            return json.dumps({
                "error": "Prompt tidak ditemukan dalam permintaan."
            }), 400, {'Content-Type': 'application/json'}
    except (json.JSONDecodeError, ValueError) as e:
        return json.dumps({
            "error": f"Format JSON tidak valid atau kesalahan saat membaca body: {str(e)}"
        }), 400, {'Content-Type': 'application/json'}
    except Exception as e:
        return json.dumps({
            "error": f"Terjadi kesalahan tak terduga saat memproses permintaan: {str(e)}"
        }), 500, {'Content-Type': 'application/json'}

    # URL API Google Gemini (model gemini-2.5-flash-preview-05-20)
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"

    # Siapkan payload untuk permintaan API Gemini
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    # Lakukan panggilan API dengan backoff eksponensial untuk menangani throttling
    max_retries = 5
    backoff_delay = 1
    for i in range(max_retries):
        try:
            response = requests.post(api_url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload))
            response.raise_for_status() # Akan memicu exception untuk HTTP error
            result = response.json()
            
            # Cek jika respons memiliki konten yang diharapkan
            if result.get('candidates') and len(result['candidates']) > 0 and \
               result['candidates'][0].get('content') and \
               result['candidates'][0]['content'].get('parts') and \
               len(result['candidates'][0]['content']['parts']) > 0:
                generated_text = result['candidates'][0]['content']['parts'][0]['text']
                
                # Kirim kembali respons yang berhasil ke frontend
                return json.dumps({
                    "generatedText": generated_text
                }), 200, {'Content-Type': 'application/json'}
            else:
                return json.dumps({
                    "error": "Respons API tidak memiliki struktur yang diharapkan."
                }), 500, {'Content-Type': 'application/json'}

        except requests.exceptions.RequestException as e:
            # Tangani kesalahan permintaan dan coba lagi dengan penundaan
            if i < max_retries - 1:
                time.sleep(backoff_delay)
                backoff_delay *= 2
            else:
                return json.dumps({
                    "error": f"Gagal menghubungi API Google Gemini setelah beberapa kali percobaan: {str(e)}"
                }), 500, {'Content-Type': 'application/json'}
        except Exception as e:
            return json.dumps({
                "error": f"Terjadi kesalahan tak terduga: {str(e)}"
            }), 500, {'Content-Type': 'application/json'}
    
    return json.dumps({
        "error": "Gagal menghubungi API Google Gemini."
    }), 500, {'Content-Type': 'application/json'}
