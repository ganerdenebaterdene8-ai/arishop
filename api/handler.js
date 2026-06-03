async function searchCoupang(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://www.coupang.com/np/search?q=${encodedKeyword}&channel=user&listSize=36`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
        Referer: "https://www.coupang.com/",
      },
    });

    if (!response.ok) {
      console.error("Coupang fetch failed:", response.status);
      return null;
    }

    const html = await response.text();

    // HTML дотроос бүтээгдэхүүн олох
    const items = [];
    const itemRegex = /<li[^>]+class="[^"]*search-product[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 3) {
      const block = match[1];

      const nameMatch = block.match(/<div[^>]+class="[^"]*name[^"]*"[^>]*>([^<]+)<\/div>/);
      const priceMatch = block.match(/<strong[^>]+class="[^"]*price-value[^"]*"[^>]*>([^<]+)<\/strong>/);
      const linkMatch =
        block.match(/<a[^>]+class="[^"]*search-product-link[^"]*"[^>]+href="([^"]+)"/) ||
        block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*search-product-link[^"]*"/);
      const imgMatch =
        block.match(/<img[^>]+class="[^"]*search-product-wrap-img[^"]*"[^>]+data-src="([^"]+)"/) ||
        block.match(/<img[^>]+class="[^"]*search-product-wrap-img[^"]*"[^>]+src="([^"]+)"/);

      if (nameMatch && priceMatch && linkMatch) {
        const imgSrc = imgMatch?.[1] ?? "";
        items.push({
          title: nameMatch[1].trim(),
          price: priceMatch[1].trim() + " ₩",
          link: linkMatch[1].startsWith("http")
            ? linkMatch[1]
            : "https://www.coupang.com" + linkMatch[1],
          image: imgSrc.startsWith("//") ? "https:" + imgSrc : imgSrc,
        });
      }
    }

    return items.length > 0 ? items : null;
  } catch (err) {
    console.error("searchCoupang error:", err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
//  Монгол хайлтын intent тодорхойлох
// ─────────────────────────────────────────────
const SEARCH_TRIGGERS = [
  "хайж", "хаяарай", "хайгаад", "олно уу", "олоод өг",
  "байна уу", "авъя", "авах", "авмаар", "хайх",
];

const STRIP_WORDS =
  /хайж\s*|хаяарай\s*|хайгаад\s*|өгөөрэй\s*|өгөөч\s*|олно уу\s*|олоод өг\s*|байна уу\s*|байна\s*|авъя\s*|авах\s*|авмаар\s*|хайх\s*|уу\s*$/gi;

// ─────────────────────────────────────────────
//  Үндсэн handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. API key шалгах
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY тохируулаагүй");
      return res.status(500).json({
        content: [{ type: "text", text: "Серверийн тохиргоонд алдаа байна. +976 7211 8286" }],
      });
    }

    // 2. Body задлах
    const { messages = [], system = "" } = req.body || {};
    if (!messages.length)
      return res.status(400).json({ error: "Messages are required" });

    // 3. Хэрэглэгчийн сүүлийн мессеж
    const lastMsg = messages[messages.length - 1];
    const userText =
      lastMsg?.role === "user"
        ? (typeof lastMsg.content === "string"
            ? lastMsg.content
            : lastMsg.content?.map?.((c) => c.text || "").join(" ") || ""
          ).toLowerCase()
        : "";

    // 4. Coupang хайлт
    let coupangContext = "";
    const hasIntent = SEARCH_TRIGGERS.some((t) => userText.includes(t));

    if (hasIntent) {
      const keyword = userText.replace(STRIP_WORDS, "").trim();
      if (keyword.length > 1) {
        const products = await searchCoupang(keyword);
        if (products?.length) {
          coupangContext =
            `\n\n[System: Coupang-с "${keyword}" бүтээгдэхүүн олдлоо. Доорх мэдээллийг хэрэглэгчид харуул.]\n`;
          products.forEach((p, i) => {
            coupangContext += `\n${i + 1}. ${p.title}\nҮнэ: ${p.price}\nХолбоос: ${p.link}${p.image ? `\nЗураг: ${p.image}` : ""}\n`;
          });
        } else {
          coupangContext = `\n\n[System: Coupang-с "${keyword}" бүтээгдэхүүн олдсонгүй.]`;
        }
      }
    }

    // 5. System prompt бүрдүүлэх
    const systemPrompt =
      (system || "") +
      coupangContext +
      "\nЧУХАЛ: Бүтээгдэхүүний холбоосыг бүтэн URL хэлбэрээр харуул.";

    // Системийн мессежийг хасаж, дараа нь нэмнэ
    const chatMessages = messages.filter((m) => m.role !== "system");

    // 6. Groq API дуудах
    let groqRes;
    try {
      groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 1000,
          messages: [{ role: "system", content: systemPrompt }, ...chatMessages],
        }),
      });
    } catch (netErr) {
      console.error("Groq сүлжээний алдаа:", netErr.message);
      return res.status(502).json({
        content: [{ type: "text", text: "Groq серверт холбогдож чадсангүй. Интернэт холболтоо шалгана уу. +976 7211 8286" }],
      });
    }

    // 7. HTTP алдаа
    if (!groqRes.ok) {
      const body = await groqRes.text();
      console.error(`Groq HTTP ${groqRes.status}:`, body);

      const msg =
        groqRes.status === 401 ? "Groq API түлхүүр буруу (401). +976 7211 8286"
        : groqRes.status === 429 ? "Хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу."
        : `Groq алдаа (${groqRes.status}). Дахин оролдоно уу.`;

      return res.status(502).json({ content: [{ type: "text", text: msg }] });
    }

    // 8. Хариу буцаах
    const data = await groqRes.json();
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Уучлаарай, хариу авч чадсангүй. Дахин оролдоно уу.";

    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (e) {
    console.error("Handler нийт алдаа:", e.message);
    return res.status(500).json({
      content: [{ type: "text", text: `Серверт алдаа гарлаа: ${e.message}. +976 7211 8286` }],
    });
  }
}
