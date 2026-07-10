"use client";

/*
 * Clovion CMS login — "the night shift" split screen.
 * Left panel: four office cats hunched over glowing laptops in an emerald room.
 * Their eyes follow the cursor; hover a cat and it swats at your pointer; reveal
 * the password and every cat turns to nosily read it (cats are like that); and
 * at random one cat slaps the one next to it for no reason at all.
 *
 * The auth itself is unchanged — the <form> posts to the NextAuth credentials
 * server action passed in as `action`. All the theatrics are client-only garnish.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";

/* ---------------------------------------------------------------- one cat -- */

type Fur = {
  body: string;
  ear: string;
  stripe?: string; // optional tabby stripes
};

interface CatProps {
  fur: Fur;
  mouseX: number;
  mouseY: number;
  staring: boolean; // reading your password
  swat: boolean; // swatting your cursor (hover)
  swatDir: 1 | -1; // which side the cursor is on
  recoil: boolean; // just got slapped by a neighbour
  slapping: boolean; // slapping a neighbour right now
  reduced: boolean; // prefers-reduced-motion
}

function Cat({
  fur,
  mouseX,
  mouseY,
  staring,
  swat,
  swatDir,
  recoil,
  slapping,
  reduced,
}: CatProps) {
  const headRef = useRef<SVGCircleElement>(null);

  // Pupil offset in SVG units. Read the head's on-screen box each render and
  // point the pupils at the cursor — the classic "eyes follow you" trick.
  let ex = 0;
  let ey = 0;
  let dilate = 1;
  if (staring) {
    // Look pointedly down-and-right, toward the password field. Pupils dilate.
    ex = 3;
    ey = 2.4;
    dilate = 1.9;
  } else if (!reduced && headRef.current) {
    const r = headRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const angle = Math.atan2(dy, dx);
    const mag = Math.min(Math.hypot(dx, dy) / 40, 3.4);
    ex = Math.cos(angle) * mag;
    ey = Math.sin(angle) * mag;
  }

  const rootClass = [
    "cat-root",
    recoil ? "cat-recoil" : "",
    slapping ? "cat-slap" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Slapping/swatting reuse the same paw swing; hover-swat loops, the rest fire once.
  const pawClass = swat ? "cat-paw cat-paw--swat" : "cat-paw";

  return (
    <svg
      viewBox="0 0 150 176"
      className={rootClass}
      style={{ "--swat-dir": swatDir } as React.CSSProperties}
      role="presentation"
    >
      {/* tail */}
      <path
        className="cat-tail"
        d="M118 150 q34 -6 30 -40 q-3 -22 -22 -20 q14 6 12 24 q-2 20 -24 24 z"
        fill={fur.body}
      />

      {/* body (mostly hidden by the laptop) */}
      <path d="M35 176 q0 -70 40 -70 q40 0 40 70 z" fill={fur.body} />

      {/* head group */}
      <g>
        {/* ears */}
        <path d="M44 74 L40 40 L66 60 Z" fill={fur.body} />
        <path d="M106 74 L110 40 L84 60 Z" fill={fur.body} />
        <path d="M47 66 L45 48 L60 60 Z" fill={fur.ear} />
        <path d="M103 66 L105 48 L90 60 Z" fill={fur.ear} />

        {/* head */}
        <circle ref={headRef} cx="75" cy="78" r="34" fill={fur.body} />

        {/* tabby stripes (optional) */}
        {fur.stripe && (
          <g stroke={fur.stripe} strokeWidth="3" strokeLinecap="round" opacity="0.6">
            <line x1="75" y1="48" x2="75" y2="58" />
            <line x1="66" y1="50" x2="63" y2="60" />
            <line x1="84" y1="50" x2="87" y2="60" />
          </g>
        )}

        {/* eyes */}
        <g>
          <ellipse cx="63" cy="76" rx="9" ry="11" fill="#fdfdfb" />
          <ellipse cx="87" cy="76" rx="9" ry="11" fill="#fdfdfb" />
          {/* pupils — vertical slits idle, round + dilated when nosy */}
          <g
            className="cat-pupils"
            style={{ transform: `translate(${ex}px, ${ey}px)` }}
          >
            <ellipse cx="63" cy="76" rx={2.4 * dilate} ry={8 / dilate} fill="#141414" />
            <ellipse cx="87" cy="76" rx={2.4 * dilate} ry={8 / dilate} fill="#141414" />
          </g>
        </g>

        {/* nose + mouth */}
        <path d="M71 90 L79 90 L75 95 Z" fill="#e08ba0" />
        <path
          d="M75 95 q-4 6 -9 4 M75 95 q4 6 9 4"
          stroke="#141414"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        {/* whiskers */}
        <g stroke="#141414" strokeWidth="1" opacity="0.5" strokeLinecap="round">
          <line x1="58" y1="88" x2="34" y2="84" />
          <line x1="58" y1="92" x2="35" y2="94" />
          <line x1="92" y1="88" x2="116" y2="84" />
          <line x1="92" y1="92" x2="115" y2="94" />
        </g>
      </g>

      {/* laptop — sits in front of the body */}
      <g>
        {/* screen */}
        <rect x="34" y="112" width="82" height="46" rx="4" fill="#2b2f36" />
        <rect x="38" y="116" width="74" height="38" rx="2" className="cat-screen" />
        {/* keyboard base */}
        <path d="M28 158 L122 158 L132 172 L18 172 Z" fill="#c9d0d7" />
        <path d="M28 158 L122 158 L124 161 L26 161 Z" fill="#aab3bc" />
      </g>

      {/* paws on the keyboard — the swatting one is on the cursor's side */}
      <g className={pawClass}>
        <ellipse cx="52" cy="162" rx="10" ry="6" fill={fur.body} />
        <ellipse cx="52" cy="160" rx="3.5" ry="2.5" fill={fur.ear} opacity="0.7" />
      </g>
      <ellipse cx="98" cy="162" rx="10" ry="6" fill={fur.body} />
      <ellipse cx="98" cy="160" rx="3.5" ry="2.5" fill={fur.ear} opacity="0.7" />
    </svg>
  );
}

/* --------------------------------------------------------------- the page -- */

const CATS: Fur[] = [
  { body: "#3f3f46", ear: "#f3b6c2" }, // charcoal
  { body: "#efe7d6", ear: "#f0a9b8" }, // cream
  { body: "#e08c4a", ear: "#f3b6c2", stripe: "#b5692f" }, // orange tabby
  { body: "#9aa3ab", ear: "#eaa9b6", stripe: "#6f777e" }, // grey
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 h-11 rounded-sm bg-accent px-4 text-sm font-semibold text-white shadow-card transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function CatsLogin({
  action,
  hasError,
}: {
  action: (formData: FormData) => void;
  hasError: boolean;
}) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);
  const [slap, setSlap] = useState<{ from: number; to: number } | null>(null);
  const [reduced, setReduced] = useState(false);
  const catRowRef = useRef<HTMLDivElement>(null);

  const staring = showPassword && password.length > 0;

  // Respect prefers-reduced-motion: no cursor tracking, no random slapping.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced]);

  // Random unprovoked cat-on-cat violence.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // ponytail: crypto-free jitter is fine for cosmetic timing.
      const wait = 3500 + Math.random() * 4500;
      timer = setTimeout(() => {
        const from = Math.floor(Math.random() * CATS.length);
        const to = Math.random() < 0.5 ? from - 1 : from + 1;
        if (to >= 0 && to < CATS.length) {
          setSlap({ from, to });
          setTimeout(() => setSlap(null), 550);
        }
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  const catCenterX = (i: number) => {
    const el = catRowRef.current?.children[i] as HTMLElement | undefined;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <style>{CAT_CSS}</style>

      {/* ---- Left: the emerald night office ---- */}
      <section className="clv-room relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        {/* ambient blobs + dot grid */}
        <div className="clv-blob clv-blob--a" aria-hidden />
        <div className="clv-blob clv-blob--b" aria-hidden />
        <div className="clv-dots" aria-hidden />

        <div className="relative z-10 flex items-center gap-3">
          <span className="grid place-items-center rounded-md bg-white/12 px-3 py-2 backdrop-blur-sm ring-1 ring-white/15">
            <Image
              src="/clovion-logo.png"
              alt="Clovion"
              width={116}
              height={29}
              priority
              className="h-6 w-auto brightness-0 invert"
            />
          </span>
          <span className="text-sm font-medium tracking-wide text-white/70">CMS</span>
        </div>

        <div className="relative z-10">
          <h2 className="max-w-md font-display text-[2.6rem] leading-[1.05] tracking-tight">
            The whole team is already at their desks.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Sign in and the night shift gets back to work. Try hovering one —
            they bite.
          </p>
        </div>

        {/* the desk of cats */}
        <div className="relative z-10">
          <div
            ref={catRowRef}
            className="flex items-end justify-center gap-1 sm:gap-3"
            onMouseLeave={() => setHovered(null)}
          >
            {CATS.map((fur, i) => (
              <div
                key={i}
                className="clv-cat-slot"
                onMouseEnter={() => setHovered(i)}
                style={{ width: `${22 - i * 0.5}%`, zIndex: 10 - i }}
              >
                <Cat
                  fur={fur}
                  mouseX={mouse.x}
                  mouseY={mouse.y}
                  staring={staring}
                  swat={hovered === i}
                  swatDir={mouse.x < catCenterX(i) ? -1 : 1}
                  recoil={slap?.to === i}
                  slapping={slap?.from === i}
                  reduced={reduced}
                />
              </div>
            ))}
          </div>
          {/* desk edge */}
          <div className="mt-[-6px] h-3 rounded-full bg-black/25 blur-[1px]" />
        </div>

        <div className="relative z-10 flex gap-6 text-xs text-white/45">
          <span>Clovion AI</span>
          <span>Headless content engine</span>
        </div>
      </section>

      {/* ---- Right: the sign-in form ---- */}
      <section className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Image
              src="/clovion-logo.png"
              alt="Clovion"
              width={120}
              height={30}
              priority
              className="h-6 w-auto"
            />
            <span className="text-sm font-medium text-ink-mute">CMS</span>
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-mute">
            Sign in to your Clovion CMS workspace.
          </p>

          {hasError ? (
            <p
              role="alert"
              className="mt-5 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              Invalid email or password, or your account is not active.
            </p>
          ) : null}

          <form action={action} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[13px] font-medium text-ink-soft">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@clovion.ai"
                className="h-11 rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[13px] font-medium text-ink-soft">Password</span>
              <span className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 w-full rounded-sm border border-line-strong bg-paper-raised px-3 pr-11 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 grid h-7 w-8 place-items-center rounded-sm text-ink-mute transition-colors hover:bg-paper-sunken hover:text-ink"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
              {staring ? (
                <span className="text-[12px] text-ink-faint">
                  The cats are reading over your shoulder. Rude.
                </span>
              ) : null}
            </label>

            <SubmitButton />
          </form>
        </div>
      </section>
    </main>
  );
}

/* --------------------------------------------------------------- eye icons -- */

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a9.1 9.1 0 0 0 3.4-.66" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
    </svg>
  );
}

/* ---------------------------------------------------------------- the CSS -- */
/* Keyframes for the cats live here so the whole login is one self-contained
   file. The global prefers-reduced-motion rule in globals.css already zeroes
   these out; the JS above also disables tracking/slapping when reduced. */
const CAT_CSS = `
.clv-room {
  background:
    radial-gradient(120% 100% at 0% 0%, var(--accent-hover) 0%, var(--accent) 55%, #14503c 100%);
}
.clv-dots {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(to bottom, black, transparent 75%);
}
.clv-blob { position: absolute; border-radius: 9999px; filter: blur(70px); opacity: 0.5; }
.clv-blob--a { width: 22rem; height: 22rem; top: -4rem; right: -3rem; background: rgba(255,255,255,0.14); animation: clv-float-a 16s ease-in-out infinite; }
.clv-blob--b { width: 26rem; height: 26rem; bottom: -6rem; left: -4rem; background: rgba(215,247,231,0.12); animation: clv-float-b 20s ease-in-out infinite; }
@keyframes clv-float-a { 50% { transform: translate(-1.5rem, 2rem) scale(1.08); } }
@keyframes clv-float-b { 50% { transform: translate(2rem, -1.5rem) scale(1.05); } }

.clv-cat-slot { display: flex; justify-content: center; }
.cat-root { width: 100%; height: auto; overflow: visible; transition: transform 0.18s ease-out; }
.clv-cat-slot:hover .cat-root { transform: translateY(-4px); }

.cat-pupils { transition: transform 0.1s ease-out; }
.cat-screen { fill: #d8f0e2; animation: clv-glow 3.4s ease-in-out infinite; }
@keyframes clv-glow { 50% { fill: #f3fbf6; } }

.cat-tail { transform-box: fill-box; transform-origin: 0% 100%; animation: clv-tail 5s ease-in-out infinite; }
@keyframes clv-tail { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-8deg); } }

/* paw resting; swat swings it toward the cursor side (--swat-dir = ±1) */
.cat-paw { transform-box: fill-box; transform-origin: 60% 100%; }
.cat-paw--swat { animation: clv-swat 0.34s ease-in-out infinite; }
@keyframes clv-swat {
  0%,100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translate(calc(var(--swat-dir) * 10px), -22px) rotate(calc(var(--swat-dir) * 34deg)); }
}

/* got slapped: recoil away and back */
.cat-recoil { animation: clv-recoil 0.5s ease-out; }
@keyframes clv-recoil {
  0% { transform: translateX(0) rotate(0deg); }
  30% { transform: translateX(10px) rotate(7deg); }
  100% { transform: translateX(0) rotate(0deg); }
}
/* threw the slap: lean into the neighbour */
.cat-slap { animation: clv-lean 0.5s ease-out; }
@keyframes clv-lean {
  0% { transform: translateX(0) rotate(0deg); }
  30% { transform: translateX(-8px) rotate(-6deg); }
  100% { transform: translateX(0) rotate(0deg); }
}
`;
