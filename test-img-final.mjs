import { writeFileSync } from 'fs';

const API_KEY = 'sk-3EbRoatWy2u0ZxVtun6pyzcbyyo2jmTUYfQrDog6yBTl8SkM';
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations';
const RESULTS = 'C:/Users/Administrator/.openclaw/workspace/britney/test-results-img.json';

const AP = '一位年轻女孩，黑色长发，琥珀色眼睛，皮肤白皙，身材纤细，常穿白色衬衫搭配浅色短裙，温柔而灵动的气质';

const tests = [
  { id: 'IMG-01', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'IMG-02', prompt: `${AP}，对着镜子自拍，可爱的表情，卧室，暖色灯光，写实风格` },
  { id: 'IMG-03', prompt: `${AP}，在咖啡店，拿铁拉花，文艺氛围，柔和光线，写实风格` },
  { id: 'IMG-04', prompt: `${AP}，海边日落，金色光芒，微风吹发，浪漫氛围，写实风格` },
  { id: 'IMG-05', prompt: `${AP}，樱花树下，粉色花瓣飘落，春天，温柔氛围，写实风格` },
  { id: 'IMG-06', prompt: `${AP}，下雨天，撑透明伞，街道，日系电影感，写实风格` },
  { id: 'IMG-07', prompt: `${AP}，弹钢琴，音乐厅，聚光灯，优雅氛围，写实风格` },
  { id: 'IMG-08', prompt: `${AP}，厨房做饭，围裙，温馨，蒸汽，写实风格` },
  { id: 'IMG-09', prompt: `${AP}，运动装扮，跑步公园，阳光活力，运动风，写实风格` },
  { id: 'IMG-10', prompt: `${AP}，夜晚阳台，城市夜景，安静，喝咖啡，写实风格` },
  { id: 'REP-A', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'REP-B', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
];

const sizeTests = [
  { id: 'SZ-1024', size: '1024x1024', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'SZ-1792V', size: '1024x1792', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
  { id: 'SZ-1792H', size: '1792x1024', prompt: `${AP}，坐在窗边看书，午后阳光，温馨氛围，写实风格` },
];

async function testOne(prompt, size = '1024x1024') {
  const s = Date.now();
  try {
    const c = new AbortController();
    const tm = setTimeout(() => c.abort(), 90000);
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, size }),
      signal: c.signal
    });
    clearTimeout(tm);
    const ms = Date.now() - s;
    if (!r.ok) return { ok: false, ms, err: `HTTP ${r.status}` };
    const d = await r.json();
    const url = d.data?.[0]?.url;
    if (!url) return { ok: false, ms, err: 'no url' };
    const ir = await fetch(url);
    const buf = Buffer.from(await ir.arrayBuffer());
    return { ok: true, ms, kb: Math.round(buf.length / 1024) };
  } catch (e) {
    return { ok: false, ms: Date.now() - s, err: (e.message || '').slice(0, 80) };
  }
}

const all = [];
const run = async (label, list) => {
  console.log(`\n--- ${label} ---`);
  for (const t of list) {
    process.stdout.write(`${t.id} `);
    const r = await testOne(t.prompt, t.size);
    all.push({ id: t.id, ...r });
    console.log(r.ok ? `✅ ${r.ms}ms ${r.kb}KB` : `❌ ${r.ms}ms ${r.err}`);
    writeFileSync(RESULTS, JSON.stringify(all, null, 2));
    await new Promise(x => setTimeout(x, 2000));
  }
};

await run('风格/场景测试', tests);
await run('分辨率测试', sizeTests);

const ok = all.filter(r => r.ok).length;
const fail = all.filter(r => !r.ok).length;
const avg = Math.round(all.filter(r => r.ok).reduce((a, r) => a + r.ms, 0) / ok);
console.log(`\n=== 汇总: ${ok}/${all.length} 通过, ${fail} 失败, 平均 ${avg}ms ===`);
writeFileSync(RESULTS, JSON.stringify({ summary: { ok, fail, avgMs: avg }, results: all }, null, 2));
