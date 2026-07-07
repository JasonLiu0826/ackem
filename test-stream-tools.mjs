// Test streaming tool calls from agnes-2.0-flash
const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions';

const tools = [
  {
    type: 'function',
    function: {
      name: 'agnes_image',
      description: 'Generate an image',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image description' },
          size: { type: 'string', enum: ['1024x1024'] }
        },
        required: ['prompt']
      }
    }
  }
];

async function testStream() {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages: [
        { role: 'system', content: 'You are Britney. Call agnes_image when asked for photos.' },
        { role: 'user', content: 'Send me a photo' }
      ],
      tools,
      tool_choice: 'auto',
      stream: true,
      max_tokens: 500
    })
  });

  console.log('Status:', r.status);
  
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let toolCallsFound = false;
  let textContent = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') { console.log('[DONE]'); continue; }
      
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        const finish = json.choices?.[0]?.finish_reason;
        
        if (delta?.content) {
          textContent += delta.content;
          process.stdout.write(delta.content);
        }
        if (delta?.tool_calls?.length) {
          toolCallsFound = true;
          console.log('\n[TOOL_CALLS DETECTED]', JSON.stringify(delta.tool_calls, null, 2));
        }
        if (finish) {
          console.log('\n[FINISH]', finish);
        }
      } catch {}
    }
  }
  
  console.log('\n\n--- Summary ---');
  console.log('Text content:', textContent.slice(0, 200));
  console.log('Tool calls found:', toolCallsFound);
}

testStream().catch(e => console.error('Error:', e.message));
