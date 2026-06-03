// 1. Coupang-аас скрапинг хийж бараа хайх функц
async function searchCoupang(keyword) {
  try {
    // Түлхүүр үгийг URL-д тохирсон хэлбэрт оруулна
    const encodedKeyword = encodeURIComponent(keyword);
    const targetUrl = `https://www.coupang.com/np/search?q=${encodedKeyword}`;
    
    // ScraperAPI ашиглан Coupang-ийн хамгаалалтыг нэвтэрнэ
    // Танд ScraperAPI-ийн үнэгүй API KEY хэрэгтэй (https://www.scraperapi.com/)
    const scraperApiKey = process.env.SCRAPERAPI_KEY; 
    const proxyUrl = `https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) return null;

    const html = await response.text();
    
    // HTML-ээс барааны мэдээллийг Regex (тогтмол илэрхийлэл) ашиглан ялгаж авах
    // Vercel serverless дээр Cheerio суулгах шаардлагагүйгээр ингэж шийдэж болно
    const items = [];
    const itemRegex = /<li class="search-product"[^>]*>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 3) {
      const itemHtml = match[1];
      
      // Барааны нэр гаргах
      const nameMatch = itemHtml.match(/<div class="name">([^<]+)<\/div>/);
      // Барааны үнэ гаргах
      const priceMatch = itemHtml.match(/<strong class="price-value">([^<]+)<\/strong>/);
      // Барааны линк гаргах
      const linkMatch = itemHtml.match(/<a href="([^"]+)"[^>]*class="search-product-link"/);
      // Барааны зураг гаргах
      const imgMatch = itemHtml.match(/<img[^>]*class="search-product-wrap-img"[^>]*src="([^"]+)"/);

      if (nameMatch && priceMatch && linkMatch) {
        items.push({
          title: nameMatch[1].trim(),
          price: priceMatch[1].trim() + " ₩",
          link: "https://www.coupang.com" + linkMatch[1],
          image: imgMatch ? "https:" + imgMatch[1] : ""
        });
      }
    }

    return items.length > 0 ? items : null;
  } catch (error) {
    console.error("Coupang хайлтын алдаа:", error);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system } = req.body;
    const userMessage = messages[messages.length - 1].content.toLowerCase();

    let coupangContext = "";

    // Хэрэглэгч ямар нэгэн бараа хайхыг хүссэн үед (жишээ нь: "коллаген хайж өг", "коллаген байна уу")
    if (userMessage.includes("хай") || userMessage.includes("байна уу") || userMessage.includes("авъя") || userMessage.includes("авах")) {
      
      // Хэрэглэгчийн өгүүлбэрээс "хайж өг", "байна уу" гэх мэт туслах үгсийг хасч цэвэр түлхүүр үгийг авна
      const cleanKeyword = userMessage
        .replace(/хайж|хаяарай|өгөөрэй|өгөөч|байна уу|байна|авъя|авах|уу|олно уу/g, "")
        .trim();

      if (cleanKeyword.length > 1) {
        const products = await searchCoupang(cleanKeyword);
        
        if (products) {
          coupangContext = `\n\n[Системийн мэдээлэл: Coupang-аас "${cleanKeyword}" хайлтын үр дүнд дараах бараанууд олдлоо. Үүнийг хэрэглэгчид цэгцтэй, линктэй нь харуулна уу]:\n`;
          products.forEach((p, index) => {
            coupangContext += `${index + 1}. ${p.title}\nҮнэ: ${p.price}\nЛинк: ${p.link}\nЗураг: ${p.image}\n\n`;
          });
        } else {
          coupangContext = `\n\n[Системийн мэдээлэл: Уучлаарай, Coupang-аас "${cleanKeyword}" холбоотой бараа олдсонгүй эсвэл сүлжээний алдаа гарлаа.]`;
        }
      }
    }

    // Хэрэв Coupang-аас бараа олдсон бол түүнийг Groq-ийн модель руу контекст болгож хамт илгээнэ
    const finalSystemPrompt = (system || '') + coupangContext;

    const allMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...messages
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1000,
        messages: allMessages
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'Уучлаарай, алдаа гарлаа.';

    res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (e) {
    res.status(500).json({ content: [{ type: 'text', text: 'Алдаа гарлаа. +976 7211 8286' }] });
  }
}
