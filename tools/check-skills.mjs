// 傷害計算的技能資料 vs 星詠魔力攻略網：逐一比對（需要先用 tools/ 或手動把攻略網技能頁轉成文字）
// 用法：node tools/check-skills.mjs <攻略網技能頁文字資料夾>
// 文字檔：skills_物理攻擊技能.txt、skills_職業專屬技能.txt、skills_戰鬥防禦技能.txt、pets_skills.txt（每列「等級 | 名稱 | 耗魔 | 作用 |」）
import fs from 'node:fs';
import path from 'node:path';
import { SKILLS, DEF_DOWN, SKILL_HUIXUAN, SKILL_ZHUIYUE } from '../src/assets/js/dmgcalc.js';

const dir = process.argv[2];
if (!dir) { console.log('用法：node tools/check-skills.mjs <資料夾>'); process.exit(1); }
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');
const rows = (txt, name) => {
  const sec = txt.split(/\n## /).find(s => s.startsWith(name));
  return sec ? sec.split('\n').filter(l => /^\d+ \|/.test(l)).map(l => l.split(' | ')) : [];
};
let bad = 0, ok = 0;
const eq = (label, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { bad++; console.log('✗', label, '\n   網站', g, '\n   攻略', w); } else ok++; };

const phys = rd('skills_物理攻擊技能.txt'), job = rd('skills_職業專屬技能.txt'), def = rd('skills_戰鬥防禦技能.txt');
const col = (rs, re) => rs.map(r => { const m = r[3].match(re); return m ? Number(m[1]) : null; });
eq('乾坤一擲 倍率', SKILLS.qiankun.mult, col(rows(phys, '乾坤一擲'), /給予對象 ([\d.]+) 倍/).map(x => Math.round(x * 100)));
eq('乾坤一擲 命中', SKILLS.qiankun.acc, col(rows(phys, '乾坤一擲'), /命中降低 (\d+)%/).map(x => -x));
eq('崩擊', SKILLS.bengji.mult.slice(0, 10), col(rows(phys, '崩擊'), /([\d.]+) 倍傷害/).slice(0, 10).map(x => Math.round(x * 100)));
eq('反擊', SKILLS.fanji.mult, col(rows(phys, '反擊'), /給予 ([\d.]+) 倍傷害/).map(x => Math.round(x * 100)));
eq('戒驕戒躁', SKILLS.jiaojiao.mult, col(rows(phys, '戒驕戒躁'), /給予對象 ([\d.]+) 倍/).map(x => Math.round(x * 100)));
eq('一擊必殺', SKILLS.yiji.mult, col(rows(phys, '一擊必殺'), /給予對象 ([\d.]+) 倍/).map(x => Math.round(x * 100)));
eq('諸刃 攻擊', SKILLS.zhuren.atkUp, col(rows(phys, '諸刃'), /攻擊(?:力)?提升 (\d+)%/));
eq('諸刃 防禦降低', SKILLS.zhuren.atkUp.map((_, i) => DEF_DOWN.zhuren(i + 1)), col(rows(phys, '諸刃'), /減少 (\d+)%/));
eq('迅速果斷 攻擊力', SKILLS.xunsu.atkUp, col(rows(phys, '迅速果斷'), /提升攻擊力 (\d+)%/).map(x => x - 100));
eq('穿刺 前排', SKILLS.chuanci.rows.front, col(rows(phys, '穿刺一擊'), /前排對象 (\d+)%/));
eq('穿刺 後排', SKILLS.chuanci.rows.back, col(rows(phys, '穿刺一擊'), /後排對象 (\d+)%/));
eq('連擊 每段', SKILLS.lianji.per, col(rows(phys, '連擊'), /普攻 (\d+)%/));
eq('飛刃亂舞', SKILLS.feiren.mult, col(rows(phys, '飛刃亂舞'), /進行 (\d+)%/));
eq('亂射 箭數', SKILLS.luanshe.arrows, col(rows(phys, '亂射'), /射出 (\d+) 支箭/));
eq('追月劍氣', Object.values(SKILL_ZHUIYUE), col(rows(job, '追月劍氣'), /普攻的(\d+)%/));
eq('逆轉乾坤 機率', SKILLS.nizhuan.chance, col(rows(job, '逆轉乾坤'), /有(\d+)%的概率/));
eq('逆轉乾坤 第二擊', SKILLS.nizhuan.sec, col(rows(job, '逆轉乾坤'), /原傷害(\d+)%傷害/));
eq('陽炎', SKILLS.zhuren.atkUp.map((_, i) => DEF_DOWN.yangyan(i + 1)), col(rows(def, '陽炎'), /減少防禦力(\d+)%/));
eq('迴旋 三段', Object.values(SKILL_HUIXUAN), rows(phys, '回旋利刃').map(r => (r[3].match(/三段倍率([\d/]+)%/) || [])[1]?.split('/').map(Number)));
eq('咒刃／血雨飛花', SKILLS.zhouren.mult, rows(job, '咒刃飛花').map(r => Number((r[3].match(/造成(\d+)%傷害/) || [])[1])));
console.log(`\n比對 ${ok + bad} 項：一致 ${ok}、不一致 ${bad}`);
process.exit(bad ? 1 : 0);
