// Compare streaming vs non-streaming tool call behavior
const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions';

const tools = [{
  type: 'function',
  function: {
    name: 'agnes_image',
    description: 'Generate an image using Agnes AI. Call this when the user asks for a photo.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image description in Chinese' },
        size: { type: 'string', enum: ['1024x1024'] }
      },
      required: ['prompt']
    }
  }
}];

const messages = [
  { role: 'system', content: '你是Britney。你有拍照能力(agnes_image工具)。用户让你发照片时直接调用此工具，不要用文字描述。' },
  { role: 'user', content: '发张照片给我看看' }
];

async function testNonStreaming() {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'agnes-2.0-flash', messages, tools, tool_choice: 'auto', stream: false, max_tokens: 500 })
  });
  const d = await r.json();
  const c = d.choices?.[0];
  console.log('=== NON-STREAMING ===');
  console.log('finish_reason:', c?.finish_reason);
  console.log('content:', c?.message?.content?.slice(0, 200));
  console.log('tool_calls:', c?.message?.tool_calls ? 'YES' : 'NO');
  if (c?.message?.tool_calls) {
    console.log('tool name:', c.message.tool_calls[0]?.function?.name);
    console.log('tool args:', c.message.tool_calls[0]?.function?.arguments?.slice(0, 200));
  }
}

async function testStreaming() {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'agnes-2.0-flash', messages, tools, tool_choice: 'auto', stream: true, max_tokens: 500 })
  });
  
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let hasToolCalls = false;
  let textContent = '';
  let finishReason = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta;
        if (d?.content) textContent += d.content;
        if (d?.tool_calls?.length) hasToolCalls = true;
        if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
      } catch {}
    }
  }
  
  console.log('=== STREAMING ===');
  console.log('finish_reason:', finishReason);
  console.log('content:', textContent.slice(0, 200));
  console.log('tool_calls:', hasToolCalls ? 'YES' : 'NO');
}

await testNonStreaming();
console.log('');
await testStreaming();
