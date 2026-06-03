// Search products on Coupang
async function searchCoupang(keyword) {
  try {
    // Encode keyword for URL
    const encodedKeyword = encodeURIComponent(keyword);

    // Coupang search URL
    const targetUrl = `https://www.coupang.com/np/search?q=${encodedKeyword}`;

    // ScraperAPI key from environment variables
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    // Proxy URL through ScraperAPI
    const proxyUrl =
      `https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;

    // Fetch HTML content
    const response = await fetch(proxyUrl);

    if (!response.ok) return null;

    const html = await response.text();
    const items = [];

    // Extract product list items
    const itemRegex = /<li class="search-product"[^>]*>([\s\S]*?)<\/li>/g;

    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 3) {
      const itemHtml = match[1];

      // Extract product information
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

      // Save product if required data exists
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
    console.error("Error searching Coupang:", error);
    return null;
  }
}

// API Handler
export default async function handler(req, res) {

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { messages, system } = req.body;

    // Get latest user message
    const userMessage =
      messages[messages.length - 1].content.toLowerCase();

    let coupangContext = "";

    // Detect shopping-related Mongolian keywords
    if (
      userMessage.includes("хай") ||
      userMessage.includes("байна уу") ||
      userMessage.includes("авъя") ||
      userMessage.includes("авах")
    ) {

      // Clean search keyword
      const cleanKeyword = userMessage
        .replace(
          /хайж|хаяарай|өгөөрэй|өгөөч|байна уу|байна|авъя|авах|уу|олно уу/g,
          ""
        )
        .trim();

      if (cleanKeyword.length > 1) {

        // Search Coupang
        const products =
          await searchCoupang(cleanKeyword);

        if (products) {

          coupangContext =
            `\n\n[System Info: Found the following products on Coupang for "${cleanKeyword}". Show them nicely to the user with links.]\n`;

          products.forEach((p, index) => {
            coupangContext +=
              `${index + 1}. ${p.title}\n` +
              `Price: ${p.price}\n` +
              `Link: ${p.link}\n` +
              `Image: ${p.image}\n\n`;
          });

        } else {

          coupangContext =
            `\n\n[System Info: No products found on Coupang for "${cleanKeyword}".]`;

        }
      }
    }

    // Add product information into system prompt
    const finalSystemPrompt =
      (system || "") + coupangContext;

    const allMessages = [
      {
        role: "system",
        content: finalSystemPrompt
      },
      ...messages
    ];

    // Send request to Groq API
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${process.env.GROQ_API_KEY}`
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
      data.choices?.[0]?.message?.content ||
      "Sorry, an error occurred.";

    return res.status(200).json({
      content: [
        {
          type: "text",
          text
        }
      ]
    });

  } catch (error) {

    return res.status(500).json({
      content: [
        {
          type: "text",
          text:
            "An error occurred. Please contact support: +976 7211 8286"
        }
      ]
    });

  }
}
