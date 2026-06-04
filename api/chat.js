async function searchCoupang(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const targetUrl = `https://www.coupang.com/np/search?q=${encodedKeyword}`;
    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    const proxyUrl = `https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) return null;

    const html = await response.text();
    const items = [];
    const itemRegex = /<li[^>]*class="[^"]*search-product[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 3) {
      const itemHtml = match[1];
      const nameMatch = itemHtml.match(/<div[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/div>/);
      const priceMatch = itemHtml.match(/<strong[^>]*class="[^"]*price-value[^"]*"[^>]*>([^<]+)<\/strong>/);
      const linkMatch =
        itemHtml.match(/href="(\/vp\/products\/[^"]+)"/) ||
        itemHtml.match(/href="(\/np\/search[^"]*)"/) ||
        itemHtml.match(/class="search-product-link"[^>]*href="([^"]+)"/) ||
        itemHtml.match(/href="([^"]+)"[^>]*class="search-product-link"/);
      const imgMatch =
        itemHtml.match(/data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/) ||
        itemHtml.match(/src="(https:\/\/thumbnail[^"]+)"/);

      if (nameMatch && priceMatch && linkMatch) {
        items.push({
          title: nameMatch[1].trim(),
          price: priceMatch[1].trim() + " ₩",
          link: linkMatch[1].startsWith("http")
            ? linkMatch[1]
            : "https://www.coupang.com" + linkMatch[1],
          image: imgMatch ? imgMatch[1] : "",
        });
      }
    }
    return items.length > 0 ? items : null;
  } catch (error) {
    console.error("Coupang search error:", error);
    return null;
  }
}

const SEARCH_TRIGGERS = ["хай", "байна уу", "авъя", "авах", "хайж", "олно уу", "хаяарай"];
const STRIP_WORDS = /хайж\s*|хаяарай\s*|өгөөрэй\s*|өгөөч\s*|байна уу\s*|байна\s*|авъя\s*|авах\s*|олно уу\s*|уу\s*$/gi;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages = [], system = "" } = req.body || {};
    if (!messages.length) return res.status(400).json({ error: "Messages are required" });

    const lastUserMessage = messages[messages.length - 1];
    const userText =
      lastUserMessage?.role === "user"
        ? (typeof lastUserMessage.content === "string"
            ? lastUserMessage.content
            : lastUserMessage.content?.map?.((c) => c.text || "").join(" ") || ""
          ).toLowerCase()
        : "";

    let coupangContext = "";
    const hasSearchIntent = SEARCH_TRIGGERS.some((trigger) => userText.includes(trigger));

    if (hasSearchIntent) {
      const cleanKeyword = userText.replace(STRIP_WORDS, "").trim();
      if (cleanKeyword.length > 1) {
        const products = await searchCoupang(cleanKeyword);
        if (products?.length) {
          coupangContext = `\n\n[System Info: "${cleanKeyword}" бүтээгдэхүүнийг Coupang-аас олов.]\n`;
          products.forEach((p, i) => {
            coupangContext += `\n${i + 1}. ${p.title}\nҮнэ: ${p.price}\nЛинк: ${p.link}${p.image ? `\nЗураг: ${p.image}` : ""}\n`;
          });
        } else {
          coupangContext = `\n\n[System Info: "${cleanKeyword}" бүтээгдэхүүн Coupang-аас олдсонгүй.]`;
        }
      }
    }

    const finalSystemPrompt =
      (system || "") +
      coupangContext +
      "\nЧУХАЛ: Бүтээгдэхүүний URL-ийг заавал бүтэн, дарагдах линк хэлбэрээр харуул.";

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1000,
        messages: [
          { role: "system", content: finalSystemPrompt },
          ...messages.filter((m) => m.role !== "system"),
        ],
      }),
    });

    if (!groqResponse.ok) {
      let errMsg = `Groq алдаа: ${groqResponse.status}`;
      try {
        const errBody = await groqResponse.json();
        errMsg = errBody?.error?.message || errMsg;
      } catch {
        errMsg = (await groqResponse.text().catch(() => "")) || errMsg;
      }
      return res.status(502).json({
        content: [{ type: "text", text: `Холболт шалгаад дахин оролдоно уу.\n📞 +976 7211 8286` }],
      });
    }

    const data = await groqResponse.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "Уучлаарай, хариу авч чадсангүй.";
    return res.status(200).json({ content: [{ type: "text", text }] });

  } catch (e) {
    console.error("Handler error:", e);
    return res.status(500).json({
      content: [{ type: "text", text: `Серверт алдаа гарлаа. 📞 +976 7211 8286` }],
    });
  }
};
