// Test if agnes-2.0-flash actually supports function calling
const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions';

const tools = [
  {
    type: 'function',
    function: {
      name: 'agnes_image',
      description: '使用 Agnes AI 生成图片。用户让你发照片时，直接调用此工具。prompt 中必须包含外貌描述。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片描述' },
          size: { type: 'string', enum: ['1024x1024', '1024x1792', '1792x1024'] }
        },
        required: ['prompt']
      }
    }
  }
];

async function test() {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-2.0-flash',
      messages: [
        { role: 'system', content: '你是Britney。你有拍照能力(agnes_image工具)。用户让你发照片时直接调用工具。' },
        { role: 'user', content: '发张照片给我看看' }
      ],
      tools,
      tool_choice: 'auto',
      max_tokens: 500,
      temperature: 0.8
    })
  });
  
  console.log('Status:', r.status);
  const d = await r.json();
  console.log('Full response:', JSON.stringify(d, null, 2));
  
  const choice = d.choices?.[0];
  console.log('\n--- Analysis ---');
  console.log('finish_reason:', choice?.finish_reason);
  console.log('message.role:', choice?.message?.role);
  console.log('message.content:', choice?.message?.content?.slice(0, 200));
  console.log('message.tool_calls:', JSON.stringify(choice?.message?.tool_calls, null, 2));
}

test();
