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

    const itemRegex = /<li class="search-product"[^>]*>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 3) {
      const itemHtml = match[1];

      const nameMatch = itemHtml.match(/<div class="name">([^<]+)<\/div>/);
      const priceMatch = itemHtml.match(/<strong class="price-value">([^<]+)<\/strong>/);
      // Fix: link regex — href comes before class in some cases, support both orders
      const linkMatch =
        itemHtml.match(/<a[^>]*class="search-product-link"[^>]*href="([^"]+)"/) ||
        itemHtml.match(/<a href="([^"]+)"[^>]*class="search-product-link"/);
      const imgMatch =
        itemHtml.match(/<img[^>]*class="search-product-wrap-img"[^>]*data-src="([^"]+)"/) ||
        itemHtml.match(/<img[^>]*class="search-product-wrap-img"[^>]*src="([^"]+)"/);

      if (nameMatch && priceMatch && linkMatch) {
        items.push({
          title: nameMatch[1].trim(),
          price: priceMatch[1].trim() + " ₩",
          link: "https://www.coupang.com" + linkMatch[1],
          image: imgMatch ? (imgMatch[1].startsWith("//") ? "https:" + imgMatch[1] : imgMatch[1]) : "",
        });
      }
    }

    return items.length > 0 ? items : null;
  } catch (error) {
    console.error("Error searching Coupang:", error);
    return null;
  }
}

// Keywords that indicate a search/buy intent in Mongolian
const SEARCH_TRIGGERS = ["хай", "байна уу", "авъя", "авах", "хайж", "олно уу", "хаяарай"];

// Words to strip from the keyword to get the clean product query
const STRIP_WORDS =
  /хайж\s*|хаяарай\s*|өгөөрэй\s*|өгөөч\s*|байна уу\s*|байна\s*|авъя\s*|авах\s*|олно уу\s*|уу\s*$/gi;

export default async function handler(req, res) {
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

    // Determine if the user is asking to search/buy something
    let coupangContext = "";
    const hasSearchIntent = SEARCH_TRIGGERS.some((trigger) => userText.includes(trigger));

    if (hasSearchIntent) {
      const cleanKeyword = userText.replace(STRIP_WORDS, "").trim();

      if (cleanKeyword.length > 1) {
        const products = await searchCoupang(cleanKeyword);

        if (products && products.length) {
          coupangContext = `\n\n[System Info: Found products on Coupang for "${cleanKeyword}". Show them with full clickable links.]\n`;
          products.forEach((p, index) => {
            coupangContext += `\n${index + 1}. ${p.title}\nPrice: ${p.price}\nLink: ${p.link}${p.image ? `\nImage: ${p.image}` : ""}\n`;
          });
        } else {
          coupangContext = `\n\n[System Info: No Coupang products found for "${cleanKeyword}".]`;
        }
      }
    }

    const finalSystemPrompt =
      (system || "") +
      coupangContext +
      "\nIMPORTANT: Always display the full product URL as a plain clickable link.";

    // Build messages for Groq: system first, then conversation (excluding any existing system messages)
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const groqMessages = [
      { role: "system", content: finalSystemPrompt },
      ...conversationMessages,
    ];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1000,
        messages: groqMessages,
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errBody);
      return res.status(502).json({ content: [{ type: "text", text: "Groq API алдаа гарлаа. Дахин оролдоно уу." }] });
    }

    const data = await groqResponse.json();
    const text =
      data?.choices?.[0]?.message?.content?.trim() || "Уучлаарай, хариу авч чадсангүй.";

    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (e) {
    console.error("Handler error:", e);
    return res.status(500).json({
      content: [{ type: "text", text: "Серверт алдаа гарлаа. +976 7211 8286" }],
    });
  }
}
