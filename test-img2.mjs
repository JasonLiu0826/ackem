const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations';
const APPEARANCE = '一位年轻女孩，黑色长发，琥珀色眼睛，皮肤白皙，身材纤细，常穿白色衬衫搭配浅色短裙，温柔而灵动的气质';
const RESULTS_FILE = 'C:/Users/Administrator/.openclaw/workspace/britney/test-results-img.json';

const tests = [
  { id: 'IMG-01', prompt: `${APPEARANCE}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'IMG-02', prompt: `${APPEARANCE}，对着镜子自拍，可爱的表情，卧室，暖色灯光，写实风格` },
  { id: 'IMG-03', prompt: `${APPEARANCE}，在咖啡店，拿铁拉花，文艺氛围，柔和光线，写实风格` },
  { id: 'IMG-04', prompt: `${APPEARANCE}，海边日落，金色光芒，微风吹发，浪漫氛围，写实风格` },
  { id: 'IMG-05', prompt: `${APPEARANCE}，樱花树下，粉色花瓣飘落，春天，温柔氛围，写实风格` },
  { id: 'IMG-06', prompt: `${APPEARANCE}，下雨天，撑透明伞，街道，日系电影感，写实风格` },
  { id: 'IMG-07', prompt: `${APPEARANCE}，弹钢琴，音乐厅，聚光灯，优雅氛围，写实风格` },
  { id: 'IMG-08', prompt: `${APPEARANCE}，厨房做饭，围裙，温馨，蒸汽，写实风格` },
  { id: 'IMG-09', prompt: `${APPEARANCE}，运动装扮，跑步公园，阳光活力，运动风，写实风格` },
  { id: 'IMG-10', prompt: `${APPEARANCE}，夜晚阳台，城市夜景，安静，喝咖啡，写实风格` },
  // Reproducibility
  { id: 'REP-01a', prompt: `${APPEARANCE}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'REP-01b', prompt: `${APPEARANCE}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'REP-01c', prompt: `${APPEARANCE}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
];

async function testImage(prompt, size = '1024x1024') {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, size }),
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
    if (!url) return { success: false, error: 'No URL', elapsed };
    const imgRes = await fetch(url);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return { success: true, sizeKB: Math.round(buffer.length / 1024), elapsed };
  } catch (e) {
    return { success: false, error: e.message?.slice(0, 100) || String(e), elapsed: Date.now() - start };
  }
}

async function run() {
  const results = [];
  for (const t of tests) {
    process.stdout.write(`${t.id}... `);
    const r = await testImage(t.prompt);
    results.push({ id: t.id, ...r });
    console.log(`${r.success ? '✅' : '❌'} ${r.elapsed}ms ${r.sizeKB ? r.sizeKB+'KB' : ''} ${r.error || ''}`);
    require('fs').writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    await new Promise(r => setTimeout(r, 1500));
  }
  
  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  const avgMs = Math.round(results.filter(r=>r.elapsed).reduce((a,r)=>a+r.elapsed,0)/results.length);
  console.log(`\n=== 汇总: ${ok}/${results.length} 通过, ${fail} 失败, 平均 ${avgMs}ms ===`);
}

run().catch(e => console.error(e));
