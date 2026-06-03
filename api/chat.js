```javascript
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

      const nameMatch = itemHtml.match(
        /<div class="name">([^<]+)<\/div>/
      );

      const priceMatch = itemHtml.match(
        /<strong class="price-value">([^<]+)<\/strong>/
      );

      const linkMatch = itemHtml.match(
        /<a href="([^"]+)"[^>]*class="search-product-link"/
      );

      const imgMatch = itemHtml.match(
        /<img[^>]*class="search-product-wrap-img"[^>]*src="([^"]+)"/
      );

      if (nameMatch && priceMatch && linkMatch) {
        items.push({
          title: nameMatch[1].trim(),
          price: priceMatch[1].trim() + " ₩",
          link: "https://www.coupang.com" + linkMatch[1],
          image: imgMatch ? "https:" + imgMatch[1] : ""
        });
      }
    }

    return items.length ? items : null;

  } catch (error) {
    console.error("Error searching Coupang:", error);
    return null;
  }
}

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const { messages = [], system = "" } = req.body || {};

    if (!messages.length) {
      return res.status(400).json({
        error: "Messages are required"
      });
    }

    const userMessage =
      messages[messages.length - 1]?.content?.toLowerCase() || "";

    let coupangContext = "";

    const searchPattern =
      /(хай|хайж|хаяарай|өгөөрэй|өгөөч|авах|авъя|байна уу|олно уу|hai|haij|haij ogooch|avah|avya|awah|awya|bna uu|baina uu)/i;

    if (searchPattern.test(userMessage)) {

      const cleanKeyword = userMessage
        .replace(
          /хайж|хай|хаяарай|өгөөрэй|өгөөч|байна уу|байна|авъя|авах|уу|олно уу|haij ogooch|haij|hai|baina uu|bna uu|avah|avya|awah|awya/gi,
          ""
        )
        .trim();

      if (cleanKeyword.length > 1) {

        const products = await searchCoupang(cleanKeyword);

        if (products && products.length) {

          coupangContext =
            `\n\n[System Info: Found products on Coupang for "${cleanKeyword}". Always show product name, price and clickable markdown link.]\n`;

products.forEach((p, index) => {
  coupangContext += `\n${index + 1}. ${p.title}\nPrice: ${p.price}\nLink: ${p.link}\nImage: ${p.image}\n`;
});        } else {

          coupangContext =
            `\n\n[System Info: No Coupang products found for "${cleanKeyword}".]`;
        }
      }
    }

    const finalSystemPrompt =
      system +
      coupangContext +
      `
IMPORTANT:
- If product information exists, show all products.
- Keep markdown links clickable.
- Never remove product URLs.
- Show product name and price together.
`;

    const allMessages = [
      {
        role: "system",
        content: finalSystemPrompt
      },
      ...messages
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 1000,
          messages: allMessages
        })
      }
    );

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content ||
      "Уучлаарай, мэдээлэл олдсонгүй.";

    return res.status(200).json({
      content: [
        {
          type: "text",
          text
        }
      ]
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      content: [
        {
          type: "text",
          text: "Алдаа гарлаа. +976 7211 8286"
        }
      ]
    });
  }
}
```
