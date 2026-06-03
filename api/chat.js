// Search for products on Coupang
async function searchCoupang(keyword) {
try {
// Encode the search keyword for the URL
const encodedKeyword = encodeURIComponent(keyword);

// URL of the Coupang search page
const targetUrl = `https://www.coupang.com/np/search?q=${encodedKeyword}`;

// Get the ScraperAPI key from the environment variables
const scraperApiKey = process.env.SCRAPERAPI_KEY;

// Create a proxy URL via ScraperAPI
const proxyUrl =
`https://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;

// Fetch HTML from Coupang
const response = await fetch(proxyUrl);

if (!response.ok) return null;

const html = wait response.text();

const items = [];

// Find product blocks in HTML
const itemRegex =
/<li class="search-product"[^>]*>([\s\S]*?)<\/li>/g;

let match;

// Retrieve up to 3 products
while ((match = itemRegex.exec(html)) !== null && items.length < 3) {

const itemHtml = match[1];

// Retrieve product details
const nameMatch =
itemHtml.match(/<div class="name">([^<]+)<\/div>/);

const priceMatch =
itemHtml.match(/<strong class="price-value">([^<]+)<\/strong>/);

const linkMatch =
itemHtml.match(/<a href="([^"]+)"[^>]*class="search-product-link"/);

const imgMatch =
itemHtml.match(
/<img[^>]*class="search-product-wrap-img"[^>]*src="([^"]+)"/
);

// Save the product if the required data exists
if (nameMatch && priceMatch && linkMatch) {

items.push({
title: nameMatch[1].trim(),
price: priceMatch[1].trim() + "₩",
link: "https://www.coupang.com" + linkMatch[1],
image: imgMatch ? "https:" + imgMatch[1] : ""
});
}

}
return items.length > 0 ? items : null;

} catch (error) {
console.error("Error searching for coupons:", error);
return null;
}
}

// API Route Handler
export default async function handler(req, res) {

// Enable CORS
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

// Handle browser pre-requests
if (req.method === "OPTIONS") {
return res.status(200).end();
}

// Allow only POST requests
if (req.method !== "POST") {
return res.status(405).json({
error: "Method not allowed"
});
}

try {

const { message, system } = req.body;

// Get the latest user message
const userMessage =
messages[messages.length - 1].content.toLowerCase();

let coupangContext = "";

// Detect Mongolian keywords related to shopping
if (
userMessage.includes("hay") ||
userMessage.includes("bayna uu") ||
userMessage.includes("avya") ||
userMessage.includes("avah")
) {

// Remove common Mongolian search phrases
const cleanKeyword = userMessage
.replace(
/hayj|hayarai|ogorei|gööch|bayna uu|bayna|agya|avah|uu|olno uu/g,
""
)
.trim();

if (cleanKeyword.length > 1) {

// Search for Coupang products
const products =
wait searchCoupang(cleanKeyword);

if (products) {

// Insert product results into the system line
coupangContext =
`\n\n[System Information: Found the following products for "${cleanKeyword}" on Coupang. STRICT RULE: You MUST format product links as clickable Markdown links, such as [Product Name](URL). Never display raw URLs. Please include the price.]\n`;

products.forEach((p, index) => {
coupangContext +=
`${index + 1}. [${p.title}](${p.link})\n` +
`Price: ${p.price}\n` +
`Image: ${p.image}\n\n`;
});

} else {

coupangContext =
`\n\n[System Information: Sorry, no products for "${cleanKeyword}" were found on Coupang.]`;

}
}

// Add additional instructions to force Markdown links
const finalSystemPrompt =
(system || "") +
coupangContext +
"\nIMPORTANT: Always display product links as clickable Markdown [Product Title](URL). Never output raw link text.";

// Create conversational messages
const allMessages = [
{
role: "system",
content: finalSystemPrompt
},
...messages
];

// Send a request to the Groq API
const response = await fetch(
"https://api.groq.com/openai/v1/chat/completions",
{
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization:
`Bearer ${process.env.GROQ_API_KEY}``
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
data.choices?.[0]?.message?.content || "Sorry, an error occurred.";
