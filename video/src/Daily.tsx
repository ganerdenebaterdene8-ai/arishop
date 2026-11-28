// АриШоп — өдрийн бараа (1080x1920, 15 сек). Неон HUD загвар.
import React from 'react';
import {
  AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
// Фонтууд төсөл дотроо (Google Fonts-оос хамааралгүй) — кирилл + монгол Ө, Ү
import '@fontsource/unbounded/cyrillic-800.css';
import '@fontsource/unbounded/cyrillic-900.css';
import '@fontsource/unbounded/cyrillic-ext-800.css';
import '@fontsource/unbounded/cyrillic-ext-900.css';
import '@fontsource/unbounded/latin-800.css';
import '@fontsource/unbounded/latin-900.css';
import '@fontsource/montserrat/cyrillic-600.css';
import '@fontsource/montserrat/cyrillic-800.css';
import '@fontsource/montserrat/cyrillic-ext-600.css';
import '@fontsource/montserrat/cyrillic-ext-800.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-800.css';

const display = "'Unbounded', sans-serif";
const body = "'Montserrat', sans-serif";

const C = {
  bg: '#07142e', bg2: '#0d2350', line: '#2b6cb0', cyan: '#5fd3ff', orange: '#f5a13a', orange2: '#ff7a1a', white: '#f4f8ff',
};

export type DailyProps = {
  image: string; name: string; price: number; hook: string; category: string; delivery: string; site: string;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const src = (s: string) => (/^https?:|^data:/.test(s) ? s : staticFile(s));

// Арын дэвсгэр: гүн цэнхэр + хэтийн торон шал + хажуугийн хэмжүүр
const Background: React.FC = () => {
  const f = useCurrentFrame();
  const shift = (f * 2) % 120;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, ${C.bg2} 0%, ${C.bg} 70%)` }}>
      <div style={{
        position: 'absolute', left: -600, right: -600, bottom: -100, height: 1000,
        transform: 'perspective(700px) rotateX(62deg)', transformOrigin: 'bottom',
        backgroundImage: `linear-gradient(${C.cyan}66 3px, transparent 3px), linear-gradient(90deg, ${C.cyan}66 3px, transparent 3px)`,
        backgroundSize: '120px 120px', backgroundPosition: `0 ${shift}px`,
        maskImage: 'linear-gradient(to top, black 50%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to top, black 50%, transparent 100%)',
      }} />
      {[0, 1].map((side) => (
        <div key={side} style={{ position: 'absolute', top: 120, bottom: 120, [side ? 'right' : 'left']: 28, width: 26, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} style={{ height: 3, width: i % 4 === 0 ? 26 : 14, marginLeft: side ? 'auto' : 0, background: `${C.cyan}55` }} />
          ))}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// Дээд HUD мөр
const Hud: React.FC<{ category: string }> = ({ category }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const blink = Math.floor(f / 15) % 2 === 0 ? 1 : 0.35;
  return (
    <div style={{ position: 'absolute', top: 110, left: 90, right: 90, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: o }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, border: `3px solid ${C.line}`, borderRadius: 14, padding: '14px 26px', background: '#0a1c3fcc', fontFamily: body, fontWeight: 800, fontSize: 34, letterSpacing: 4, color: C.orange }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, background: C.orange, opacity: blink }} />
        АРИШОП
        <span style={{ color: C.line }}>|</span>
        <span style={{ color: C.cyan }}>{category}</span>
      </div>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 30, color: C.cyan, letterSpacing: 3 }}>KR <span style={{ color: C.orange }}>→</span> MN</div>
    </div>
  );
};

// 0–3 сек: hook
const Hook: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 90px' }}>
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: 96, lineHeight: 1.12, textAlign: 'center', color: C.white, textShadow: `0 0 40px ${C.orange}66` }}>
        {words.map((w, i) => {
          const s = spring({ frame: f - i * 4, fps, config: { damping: 12, stiffness: 160 } });
          return (
            <span key={i} style={{ display: 'inline-block', margin: '0 14px', transform: `translateY(${(1 - s) * 80}px) scale(${0.6 + 0.4 * s})`, opacity: s, color: i === words.length - 1 ? C.orange : C.white }}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// 3–15 сек: барааны карт + нэр + үнэ
const Product: React.FC<DailyProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: f, fps, config: { damping: 14, stiffness: 120 } });
  const float = Math.sin(f / 20) * 10;
  const glow = 0.6 + 0.4 * Math.sin(f / 8);
  const nameIn = interpolate(f, [18, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const priceT = interpolate(f, [60, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const priceScale = spring({ frame: f - 108, fps, config: { damping: 8, stiffness: 200 } });
  const badge = spring({ frame: f - 150, fps, config: { damping: 14 } });
  const scan = interpolate(f % 90, [0, 90], [-10, 110]);
  return (
    <AbsoluteFill>
      {/* карт */}
      <div style={{ position: 'absolute', top: 300, left: 140, width: 800, height: 800, transform: `translateY(${(1 - card) * 400 + float}px) scale(${0.7 + 0.3 * card})`, opacity: card }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 48, border: `5px solid ${C.orange}`, boxShadow: `0 0 ${50 * glow}px ${C.orange}aa, inset 0 0 40px ${C.orange}33`, background: '#ffffff', overflow: 'hidden' }}>
          <Img src={src(p.image)} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 40 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${scan}%`, height: 6, background: `linear-gradient(90deg, transparent, ${C.cyan}cc, transparent)` }} />
        </div>
        {['tl', 'tr', 'bl', 'br'].map((k) => (
          <div key={k} style={{ position: 'absolute', width: 70, height: 70, [k[0] === 't' ? 'top' : 'bottom']: -22, [k[1] === 'l' ? 'left' : 'right']: -22,
            [`border${k[0] === 't' ? 'Top' : 'Bottom'}`]: `8px solid ${C.cyan}`, [`border${k[1] === 'l' ? 'Left' : 'Right'}`]: `8px solid ${C.cyan}`, borderRadius: 10 }} />
        ))}
      </div>
      {/* нэр */}
      <div style={{ position: 'absolute', top: 1150, left: 90, right: 90, textAlign: 'center', fontFamily: body, fontWeight: 800, fontSize: 60, lineHeight: 1.2, color: C.white, opacity: nameIn, transform: `translateY(${(1 - nameIn) * 30}px)` }}>
        {p.name}
      </div>
      {/* үнэ */}
      <div style={{ position: 'absolute', top: 1370, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ fontFamily: display, fontWeight: 900, fontSize: 150, color: C.orange, textShadow: `0 0 50px ${C.orange2}aa`, transform: `scale(${1 + 0.12 * (priceScale > 0 ? 1 - priceScale : 0)})`, opacity: priceT > 0 ? 1 : 0 }}>
          {fmt(p.price * priceT)}₮
        </div>
      </div>
      {/* хүргэлт */}
      <div style={{ position: 'absolute', top: 1570, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: badge, transform: `translateY(${(1 - badge) * 40}px)` }}>
        <div style={{ border: `3px solid ${C.cyan}`, borderRadius: 999, padding: '16px 44px', fontFamily: body, fontWeight: 800, fontSize: 42, color: C.cyan, background: '#0a1c3fcc' }}>
          🚚 {p.delivery}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Сүүлийн 3 сек: CTA
const Cta: React.FC<{ site: string }> = ({ site }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 12 } });
  const pulse = 1 + 0.04 * Math.sin(f / 4);
  return (
    <div style={{ position: 'absolute', bottom: 110, left: 60, right: 60, display: 'flex', justifyContent: 'center', opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
      <div style={{ transform: `scale(${pulse})`, background: `linear-gradient(90deg, ${C.orange}, ${C.orange2})`, borderRadius: 999, padding: '24px 50px', fontFamily: body, fontWeight: 800, fontSize: 46, whiteSpace: 'nowrap', color: '#1a0d00', boxShadow: `0 0 40px ${C.orange}aa` }}>
        {site} · DM бичээрэй
      </div>
    </div>
  );
};

export const Daily: React.FC<DailyProps> = (p) => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <Background />
    <Hud category={p.category} />
    <Sequence durationInFrames={95}><Hook text={p.hook} /></Sequence>
    <Sequence from={85}><Product {...p} /></Sequence>
    <Sequence from={360}><Cta site={p.site} /></Sequence>
  </AbsoluteFill>
);
