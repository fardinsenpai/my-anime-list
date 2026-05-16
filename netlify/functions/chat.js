// netlify/functions/chat.js
exports.handler = async function (event, context) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করার জন্য
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // Netlify-র ড্যাশবোর্ড থেকে এই এনভায়রনমেন্ট ভেরিয়েবলটি আসবে
  const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
  const apiUrl = "https://api.cerebras.ai/v1/chat/completions";

  try {
    const requestBody = JSON.parse(event.body);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CEREBRAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Backend API Error", details: error.message }),
    };
  }
};