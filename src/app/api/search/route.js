import axios from 'axios';

// Fungsi untuk mendapatkan kredensial dari API eksternal
async function fetchCredentials() {
  const credentialsUrl = process.env.CREDENTIALS_URL; // Ambil URL dari environment variable

  try {
    const response = await axios.get(credentialsUrl);
    const { apiKey, cseId } = response.data;

    return { apiKey, cseId };
  } catch (error) {
    console.error('Failed to fetch credentials:', error.message);
    throw error;
  }
}

// Daftar kunci API dan CSE ID
let keys = [];
let currentIndex = 0;

// Fungsi untuk menunggu selama ms milidetik
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk memecah kalimat menjadi kata dan mengambil 4 kata pertama
function extractFirstFourSyllables(title) {
  const words = title.split(/\s+/); // Pisahkan berdasarkan spasi
  const firstFourWords = words.slice(0, 4); // Ambil 4 kata pertama
  return firstFourWords.join(' '); // Gabungkan menjadi string
}

// Fungsi untuk mengirim title ke API dengan axios
async function sendTitleToApi(title, domain) {
  const apiEndpoint = process.env.API_ENDPOINT; // Ambil endpoint dari environment variable

  try {
    const response = await axios.post(apiEndpoint, {
      keyword: title,
      url: domain,
      status: false,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Cek status respons
    if (response.status === 200) {
      console.log(`Successfully sent title "${title}"`);
    } else {
      console.error(`Failed to send title "${title}". Status: ${response.status}, ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to send title "${title}": ${error.message}`);
  }
}

// Fungsi utama untuk menangani permintaan GET
export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const domain = url.searchParams.get('domain') || 'default-domain.com'; // Ambil domain dari query parameter atau gunakan default

  if (!query) {
    return new Response(JSON.stringify({ error: 'Query parameter is required' }), { status: 400 });
  }

  if (keys.length === 0) {
    try {
      // Ambil kredensial dari API eksternal
      const credentials = await fetchCredentials();
      keys = [{ apiKey: credentials.apiKey, cseId: credentials.cseId }];
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch credentials' }), { status: 500 });
    }
  }

  const { apiKey, cseId } = keys[currentIndex];

  try {
    // Jeda 4 detik sebelum melakukan permintaan API
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: cseId,
        q: query,
      },
    });
    
    await sleep(4000);
    // Perbarui indeks kunci API untuk rotasi
    currentIndex = (currentIndex + 1) % keys.length;

    // Ekstrak dan proses title dari items
    const titles = response.data.items?.map(item => extractFirstFourSyllables(item.title)) || [];

    // Kirim setiap title ke API satu per satu dengan jeda
    for (const [index, title] of titles.entries()) {
      await sendTitleToApi(title, domain);
      if (index < titles.length - 1) {
        await sleep(4000); // Jeda 4 detik
      }
    }

    return new Response(JSON.stringify({ message: 'Titles processed and sent successfully' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.response?.status || 500 });
  }
}
