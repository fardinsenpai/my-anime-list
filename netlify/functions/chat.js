exports.handler = async function(event) {

  const body = JSON.parse(event.body);

  try {

    const response = await fetch(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
