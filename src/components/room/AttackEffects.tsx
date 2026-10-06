"use client";

import { useMemo } from "react";
import type { RoomAttack } from "@/lib/room-types";
import { attackDef } from "@/lib/attacks";

// 같은 공격은 매번 같은 모양이 나오도록 id 로 시드를 고정한 난수
function seeded(seed: number) {
  let t = seed * 2654435761;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// 울퉁불퉁한 먹물 얼룩 (극좌표로 반지름을 흔들어 만든 닫힌 곡선)
function blobPath(rand: () => number, cx: number, cy: number, r: number): string {
  const points = 14;
  const pts = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const radius = r * (0.55 + rand() * 0.75);
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
  let d = `M ${(pts[0][0] + pts[points - 1][0]) / 2} ${(pts[0][1] + pts[points - 1][1]) / 2}`;
  for (let i = 0; i < points; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[(i + 1) % points];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  return d + " Z";
}

function InkSplat({ attack, fade }: { attack: RoomAttack; fade: number }) {
  const blobs = useMemo(() => {
    const rand = seeded(attack.id);
    // 화면 네 구역에 하나씩 흩뿌려서 한 덩어리로 뭉치지 않게 한다
    const cells = [
      [25, 30],
      [72, 28],
      [30, 72],
      [70, 70],
    ];
    return cells.map(([baseX, baseY]) => {
      const cx = baseX + (rand() - 0.5) * 16;
      const cy = baseY + (rand() - 0.5) * 16;
      const r = 9 + rand() * 7;
      const drops = Array.from({ length: 5 }, () => ({
        cx: cx + (rand() - 0.5) * r * 3,
        cy: cy + (rand() - 0.5) * r * 3,
        r: 1 + rand() * 2.5,
      }));
      return { d: blobPath(rand, cx, cy, r), drops };
    });
  }, [attack.id]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: fade, transition: "opacity 300ms" }}
      aria-hidden
    >
      {blobs.map((b, i) => (
        <g key={i} fill="#0b0b10">
          <path d={b.d} />
          {b.drops.map((d, j) => (
            <circle key={j} cx={d.cx} cy={d.cy} r={d.r} />
          ))}
        </g>
      ))}
    </svg>
  );
}

interface AttackEffectsProps {
  effects: RoomAttack[]; // 나에게 걸린, 아직 끝나지 않은 공격
  serverNow: number;
  nicknameOf: (id: string) => string;
}

// 맞은 사람 화면 위에 덮는 효과 (먹물/안개/얼음). 뒤집기는 로드뷰 레이어에서 직접 처리한다.
export default function AttackEffects({ effects, serverNow, nicknameOf }: AttackEffectsProps) {
  if (effects.length === 0) return null;
  const freeze = effects.find((e) => e.type === "freeze");
  const fog = effects.some((e) => e.type === "fog");
  const inks = effects.filter((e) => e.type === "ink");
  const latest = [...effects].sort((a, b) => b.at - a.at)[0];

  return (
    <>
      {/* 먹물·안개: 화면(로드뷰/지도)만 가리고 버튼은 위에 남는다 */}
      {fog && <div className="pointer-events-none absolute inset-0 z-[6] bg-white/30 backdrop-blur-md" aria-hidden />}
      {inks.map((ink) => {
        const left = ink.until - serverNow;
        return (
          <div key={ink.id} className="pointer-events-none absolute inset-0 z-[6]">
            <InkSplat attack={ink} fade={left < 1000 ? Math.max(0, left / 1000) : 0.92} />
          </div>
        );
      })}

      {/* 얼음: 모든 조작을 막는다 (채팅은 위에 있어 사용 가능) */}
      {freeze && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-cyan-200/25 shadow-[inset_0_0_120px_30px_rgba(165,243,252,0.9)] backdrop-blur-[2px]">
          <div className="rounded-2xl bg-white/85 px-6 py-4 text-center shadow-xl">
            <p className="text-4xl">🧊</p>
            <p className="mt-1 font-bold text-cyan-900">꽁꽁 얼었어요!</p>
            <p className="text-sm tabular-nums text-cyan-800">{Math.max(1, Math.ceil((freeze.until - serverNow) / 1000))}초 뒤에 풀려요</p>
          </div>
        </div>
      )}

      {/* 누가 공격했는지 */}
      <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 animate-bounce rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg sm:top-20">
        {attackDef(latest.type).emoji} {nicknameOf(latest.fromId)}
        {attackDef(latest.type).hitText}
      </div>
    </>
  );
}
