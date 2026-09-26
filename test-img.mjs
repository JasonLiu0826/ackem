#!/usr/bin/env node
// Britney 全维度检测脚本 - LLM生图功能
const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations';
const TIMEOUT = 120000;

const APPEARANCE = '一位年轻女孩，黑色长发，琥珀色眼睛，皮肤白皙，身材纤细，常穿白色衬衫搭配浅色短裙，温柔而灵动的气质';

const testCases = [
  { id: 'IMG-01', style: '写实', prompt: `${APPEARANCE}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'IMG-02', style: '自拍', prompt: `${APPEARANCE}，对着镜子自拍，可爱的表情，卧室，暖色灯光，写实风格` },
  { id: 'IMG-03', style: '室内', prompt: `${APPEARANCE}，在咖啡店，拿铁拉花，文艺氛围，柔和光线，写实风格` },
  { id: 'IMG-04', style: '户外', prompt: `${APPEARANCE}，海边日落，金色光芒，微风吹发，浪漫氛围，写实风格` },
  { id: 'IMG-05', style: '季节', prompt: `${APPEARANCE}，樱花树下，粉色花瓣飘落，春天，温柔氛围，写实风格` },
  { id: 'IMG-06', style: '日系', prompt: `${APPEARANCE}，下雨天，撑透明伞，街道，日系电影感，写实风格` },
  { id: 'IMG-07', style: '动作', prompt: `${APPEARANCE}，弹钢琴，音乐厅，聚光灯，优雅氛围，写实风格` },
  { id: 'IMG-08', style: '生活', prompt: `${APPEARANCE}，厨房做饭，围裙，温馨，蒸汽，写实风格` },
  { id: 'IMG-09', style: '运动', prompt: `${APPEARANCE}，运动装扮，跑步公园，阳光活力，运动风，写实风格` },
  { id: 'IMG-10', style: '夜景', prompt: `${APPEARANCE}，夜晚阳台，城市夜景，安静，喝咖啡，写实风格` },
];

const sizeTests = [
  { id: 'SIZE-01', size: '1024x1024', desc: '正方形' },
  { id: 'SIZE-02', size: '1024x1792', desc: '竖版' },
  { id: 'SIZE-03', size: '1792x1024', desc: '横版' },
];

async function testImage(prompt, size = '1024x1024') {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'agnes-image-2.1-flash',
        prompt,
        size
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}`, elapsed };
    }
    
    const data = await res.json();
    const url = data.data?.[0]?.url;
    
    if (!url) {
      return { success: false, error: 'No URL returned', elapsed };
    }
    
    // Download and check file size
    const imgRes = await fetch(url);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    
    return { 
      success: true, 
      url: url.slice(0, 100) + '...', 
      size: buffer.length,
      sizeKB: Math.round(buffer.length / 1024),
      elapsed 
    };
  } catch (e) {
    return { success: false, error: e.message || String(e), elapsed: Date.now() - start };
  }
}

async function runTests() {
  console.log('=== Britney LLM生图功能检测 ===\n');
  
  // 1. Style/Scene tests
  console.log('--- 1. 风格/场景测试 ---');
  const styleResults = [];
  for (const tc of testCases) {
    console.log(`Testing ${tc.id} (${tc.style})...`);
    const result = await testImage(tc.prompt);
    styleResults.push({ ...tc, ...result });
    console.log(`  ${result.success ? '✅' : '❌'} ${result.elapsed}ms ${result.sizeKB ? result.sizeKB + 'KB' : ''} ${result.error || ''}`);
    // Rate limit: wait 2s between calls
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // 2. Size tests
  console.log('\n--- 2. 分辨率测试 ---');
  const sizeResults = [];
  for (const st of sizeTests) {
    console.log(`Testing ${st.id} (${st.desc})...`);
    const result = await testImage(testCases[0].prompt, st.size);
    sizeResults.push({ ...st, ...result });
    console.log(`  ${result.success ? '✅' : '❌'} ${result.elapsed}ms ${result.sizeKB ? result.sizeKB + 'KB' : ''} ${result.error || ''}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // 3. Reproducibility tests
  console.log('\n--- 3. 重复性测试 ---');
  const repResults = [];
  for (let i = 0; i < 3; i++) {
    console.log(`REP-01 run ${i+1}/3...`);
    const result = await testImage(testCases[0].prompt);
    repResults.push({ id: `REP-01-${i+1}`, ...result });
    console.log(`  ${result.success ? '✅' : '❌'} ${result.elapsed}ms ${result.sizeKB ? result.sizeKB + 'KB' : ''}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Summary
  const styleSuccess = styleResults.filter(r => r.success).length;
  const sizeSuccess = sizeResults.filter(r => r.success).length;
  const repSuccess = repResults.filter(r => r.success).length;
  
  console.log('\n=== 生图检测结果汇总 ===');
  console.log(`风格/场景: ${styleSuccess}/${styleResults.length} 通过`);
  console.log(`分辨率: ${sizeSuccess}/${sizeResults.length} 通过`);
  console.log(`重复性: ${repSuccess}/${repResults.length} 通过`);
  console.log(`平均耗时: ${Math.round(styleResults.reduce((a,r) => a + (r.elapsed||0), 0) / styleResults.length)}ms`);
  
  // Output JSON for report
  const report = { styleResults, sizeResults, repResults };
  require('fs').writeFileSync(
    'C:/Users/Administrator/.openclaw/workspace/britney/test-results-img.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\n详细结果已保存到 test-results-img.json');
}

runTests().catch(e => console.error('Test failed:', e));
