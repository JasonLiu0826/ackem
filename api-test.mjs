async function test() {
  try {
    const r = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({model: 'agnes-image-2.1-flash', prompt: 'a cute cat sitting on windowsill', size: '1024x1024'})
    });
    console.log('Status:', r.status);
    const text = await r.text();
    console.log('Body:', text.slice(0, 300));
  } catch(e) {
    console.log('Error:', e.message);
  }
}
test();
