"use client";

/*
 * Clovion CMS login — "crunch time" split screen.
 * Left panel: four furious office cats hammering laptops in an emerald room.
 * Their eyes track the cursor; hover one and it snarls and swats at your
 * pointer; reveal the password and all four lock onto it; and at random one
 * cat's paw shoots across the desk and genuinely clobbers the cat next to it.
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
  belly: string; // lighter muzzle/shoulder tone
  ear: string; // inner ear pink
  brow: string; // brow / stripe shade
};

interface CatProps {
  fur: Fur;
  mouseX: number;
  mouseY: number;
  staring: boolean; // reading your password
  swat: boolean; // snarling + swatting your cursor (hover)
  swatDir: 1 | -1; // which side the cursor is on
  recoil: boolean; // just got clobbered by a neighbour
  recoilDir: 1 | -1; // which way to snap (away from the hit)
  slapping: boolean; // clobbering a neighbour right now
  slapDir: 1 | -1; // which neighbour (−1 left, +1 right)
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
  recoilDir,
  slapping,
  slapDir,
  reduced,
}: CatProps) {
  const headRef = useRef<SVGPathElement>(null);
  const aggro = swat || slapping; // bare the fangs

  // Pupil offset in SVG units — point the slits at the cursor.
  let ex = 0;
  let ey = 0;
  let dilate = 1; // >1 = dilated (nosy/alarmed) round pupils
  if (staring) {
    ex = 3;
    ey = 2.6;
    dilate = 2.1;
  } else if (recoil) {
    ex = recoilDir * -3; // eyes thrown toward the blow
    ey = -1;
    dilate = 2.1;
  } else if (!reduced && headRef.current) {
    const r = headRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const a = Math.atan2(dy, dx);
    const mag = Math.min(Math.hypot(dx, dy) / 42, 3.2);
    ex = Math.cos(a) * mag;
    ey = Math.sin(a) * mag;
  }

  const rootClass = [
    "cat-root",
    reduced ? "" : "cat-live", // enables idle typing/tail loops
    recoil ? "cat-recoil" : "",
    slapping ? "cat-lean" : "",
    aggro ? "cat-aggro" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox="0 0 160 196"
      className={rootClass}
      style={
        {
          "--swat-dir": swatDir,
          "--slap-dir": slapDir,
          "--recoil-dir": recoilDir,
        } as React.CSSProperties
      }
      role="presentation"
    >
      {/* lashing tail behind the body */}
      <path
        className="cat-tail"
        d="M124 160 q40 -4 40 -48 q0 -26 -22 -26 q16 8 14 30 q-2 26 -32 30 z"
        fill={fur.body}
      />

      {/* seated body / shoulders behind the laptop */}
      <path
        d="M22 196 q4 -70 58 -70 q54 0 58 70 z"
        fill={fur.body}
      />
      <path d="M60 150 q20 -18 40 0 q-4 40 -20 44 q-16 -4 -20 -44 z" fill={fur.belly} />

      {/* -------- head (the whole thing bobs while typing) -------- */}
      <g className="cat-head">
        {/* ears — pinned back flat when aggravated */}
        <g className="cat-ears">
          <path d="M46 66 L30 20 L74 52 Z" fill={fur.body} />
          <path d="M114 66 L130 20 L86 52 Z" fill={fur.body} />
          <path d="M50 60 L40 32 L66 52 Z" fill={fur.ear} />
          <path d="M110 60 L120 32 L94 52 Z" fill={fur.ear} />
        </g>

        {/* angular head with cheek tufts */}
        <path
          ref={headRef}
          d="M80 48
             Q58 48 50 62
             Q43 76 47 90
             L37 96 L49 100
             Q53 118 80 126
             Q107 118 111 100
             L123 96 L113 90
             Q117 76 110 62
             Q102 48 80 48 Z"
          fill={fur.body}
        />

        {/* forehead stripes */}
        <g stroke={fur.brow} strokeWidth="3.5" strokeLinecap="round" opacity="0.7">
          <line x1="80" y1="52" x2="80" y2="64" />
          <line x1="70" y1="54" x2="66" y2="65" />
          <line x1="90" y1="54" x2="94" y2="65" />
        </g>

        {/* eyes: whites + slit pupils that track the cursor */}
        <ellipse cx="65" cy="84" rx="10" ry="7.5" fill="#fbfbf7" />
        <ellipse cx="95" cy="84" rx="10" ry="7.5" fill="#fbfbf7" />
        <g className="cat-pupils" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
          <ellipse cx="65" cy="84" rx={2.5 * dilate} ry={7 / dilate} fill="#0e0e0e" />
          <ellipse cx="95" cy="84" rx={2.5 * dilate} ry={7 / dilate} fill="#0e0e0e" />
        </g>

        {/* heavy angry brows — a downward V into the bridge of the nose */}
        <g stroke="#141414" strokeWidth="6" strokeLinecap="round">
          <line x1="52" y1="70" x2="76" y2="82" />
          <line x1="108" y1="70" x2="84" y2="82" />
        </g>

        {/* nose */}
        <path d="M74 96 L86 96 L80 103 Z" fill="#d97b8e" />

        {/* mouth — a snarl with fangs when aggravated, a scowl otherwise */}
        {aggro ? (
          <g>
            <path d="M67 104 Q80 120 93 104 Q80 110 67 104 Z" fill="#5e1a24" />
            <path d="M69 105 L74 105 L71.5 113 Z" fill="#ffffff" />
            <path d="M91 105 L86 105 L88.5 113 Z" fill="#ffffff" />
          </g>
        ) : (
          <path
            d="M70 108 Q80 103 90 108"
            stroke="#141414"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* whiskers */}
        <g stroke="#141414" strokeWidth="1" opacity="0.45" strokeLinecap="round">
          <line x1="58" y1="98" x2="30" y2="94" />
          <line x1="58" y1="102" x2="31" y2="106" />
          <line x1="102" y1="98" x2="130" y2="94" />
          <line x1="102" y1="102" x2="129" y2="106" />
        </g>
      </g>

      {/* -------- laptop -------- */}
      <g>
        <rect x="38" y="124" width="84" height="50" rx="5" fill="#23272e" />
        <rect x="42" y="128" width="76" height="42" rx="3" className="cat-screen" />
        <path d="M30 174 L130 174 L142 190 L18 190 Z" fill="#c9d0d7" />
        <path d="M30 174 L130 174 L133 178 L27 178 Z" fill="#a7b0b9" />
      </g>

      {/* two paws hammering the keys (alternating) */}
      <g className="cat-paw cat-paw--l">
        <ellipse cx="54" cy="178" rx="11" ry="7" fill={fur.body} />
        <ellipse cx="54" cy="176" rx="4" ry="2.6" fill={fur.ear} opacity="0.6" />
      </g>
      <g className="cat-paw cat-paw--r">
        <ellipse cx="106" cy="178" rx="11" ry="7" fill={fur.body} />
        <ellipse cx="106" cy="176" rx="4" ry="2.6" fill={fur.ear} opacity="0.6" />
      </g>

      {/* hover: a paw rears up and swipes at the cursor */}
      {swat && (
        <g className="cat-swatpaw">
          <ellipse cx="80" cy="150" rx="13" ry="9" fill={fur.body} />
          <g stroke="#f2f2ee" strokeWidth="2" strokeLinecap="round">
            <line x1="72" y1="146" x2="68" y2="138" />
            <line x1="80" y1="144" x2="80" y2="135" />
            <line x1="88" y1="146" x2="92" y2="138" />
          </g>
        </g>
      )}

      {/* slap: the near paw SHOOTS across the desk into the neighbour */}
      {slapping && (
        <g className="cat-reachpaw">
          <ellipse cx="80" cy="150" rx="14" ry="9" fill={fur.body} />
          <g stroke="#f2f2ee" strokeWidth="2.2" strokeLinecap="round">
            <line x1="71" y1="146" x2="66" y2="137" />
            <line x1="80" y1="144" x2="80" y2="134" />
            <line x1="89" y1="146" x2="94" y2="137" />
          </g>
        </g>
      )}

      {/* got clobbered: impact burst on the struck cheek */}
      {recoil && (
        <g
          className="cat-impact"
          transform={`translate(${recoilDir < 0 ? 118 : 42}, 88)`}
        >
          <path
            d="M0 -16 L4 -5 L15 -6 L6 2 L11 14 L0 6 L-11 14 L-6 2 L-15 -6 L-4 -5 Z"
            fill="#ffd84a"
            stroke="#141414"
            strokeWidth="1.5"
          />
        </g>
      )}
    </svg>
  );
}

/* --------------------------------------------------------------- the page -- */

const CATS: Fur[] = [
  { body: "#33343a", belly: "#4a4c53", ear: "#e79aa8", brow: "#101013" }, // charcoal
  { body: "#e9dfca", belly: "#f4eede", ear: "#ec9fb0", brow: "#c9bd9f" }, // cream
  { body: "#dd8637", belly: "#eec39a", ear: "#e79aa8", brow: "#a75f22" }, // ginger
  { body: "#8f99a2", belly: "#c2cad0", ear: "#e39aa6", brow: "#5f676e" }, // grey
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

  // Respect prefers-reduced-motion: no cursor tracking, no brawling.
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

  // Random, unprovoked cat-on-cat violence — often, and it lands.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // ponytail: crypto-free jitter is fine for cosmetic timing.
      const wait = 1800 + Math.random() * 2800;
      timer = setTimeout(() => {
        const from = Math.floor(Math.random() * CATS.length);
        const to = Math.random() < 0.5 ? from - 1 : from + 1;
        if (to >= 0 && to < CATS.length) {
          setSlap({ from, to });
          setTimeout(() => setSlap(null), 520);
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

      {/* ---- Left: the emerald crunch-time office ---- */}
      <section className="clv-room relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
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
            Crunch time at Clovion.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            The team&apos;s been shipping all night and tempers are gone. Sign in
            before they take it out on each other — hover one if you&apos;re brave.
          </p>
        </div>

        {/* the desk of feuding cats */}
        <div className="relative z-10">
          <div
            ref={catRowRef}
            className="flex items-end justify-center gap-0 sm:gap-1"
            onMouseLeave={() => setHovered(null)}
          >
            {CATS.map((fur, i) => (
              <div
                key={i}
                className="clv-cat-slot"
                onMouseEnter={() => setHovered(i)}
                style={{
                  width: "24%",
                  // the cat mid-swing sits on top so its paw lands over the victim
                  zIndex: slap?.from === i ? 30 : 10 - i,
                }}
              >
                <Cat
                  fur={fur}
                  mouseX={mouse.x}
                  mouseY={mouse.y}
                  staring={staring}
                  swat={hovered === i}
                  swatDir={mouse.x < catCenterX(i) ? -1 : 1}
                  recoil={slap?.to === i}
                  recoilDir={slap && slap.from < i ? 1 : -1}
                  slapping={slap?.from === i}
                  slapDir={slap && slap.to > slap.from ? 1 : -1}
                  reduced={reduced}
                />
              </div>
            ))}
          </div>
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
                  Four sets of eyes just locked onto your password.
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
/* Keyframes live here so the login is one self-contained file. The global
   prefers-reduced-motion rule in globals.css zeroes these out; the JS above
   also disables tracking + brawling when reduced. */
const CAT_CSS = `
.clv-room {
  background: radial-gradient(120% 100% at 0% 0%, var(--accent-hover) 0%, var(--accent) 55%, #14503c 100%);
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
.cat-root { width: 100%; height: auto; overflow: visible; transition: transform 0.15s ease-out; }
.clv-cat-slot:hover .cat-root { transform: translateY(-3px) scale(1.03); }

.cat-pupils { transition: transform 0.09s ease-out; }
.cat-screen { fill: #d8f0e2; }
.cat-live .cat-screen { animation: clv-flicker 0.9s steps(2, jump-none) infinite; }
@keyframes clv-flicker { 0%,100% { fill: #d3edde; } 50% { fill: #f4fbf7; } }

/* head bobs with the typing */
.cat-head { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-head { animation: clv-bob 0.28s ease-in-out infinite; }
@keyframes clv-bob { 50% { transform: translateY(1.2px) rotate(0.4deg); } }

/* tail lashes fast and angry */
.cat-tail { transform-box: fill-box; transform-origin: 0% 100%; }
.cat-live .cat-tail { animation: clv-lash 0.7s ease-in-out infinite; }
@keyframes clv-lash { 0%,100% { transform: rotate(6deg); } 50% { transform: rotate(-16deg); } }

/* paws hammering the keys, out of phase */
.cat-paw { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-paw--l { animation: clv-type 0.16s ease-in-out infinite; }
.cat-live .cat-paw--r { animation: clv-type 0.16s ease-in-out infinite; animation-delay: 0.08s; }
@keyframes clv-type { 50% { transform: translateY(-6px); } }

/* ears flatten back when the cat is riled */
.cat-ears { transform-box: fill-box; transform-origin: 50% 100%; transition: transform 0.12s ease-out; }
.cat-aggro .cat-ears { transform: scaleY(0.66) translateY(6px); }

/* hover swipe at the cursor */
.cat-swatpaw { transform-box: fill-box; transform-origin: 50% 100%; animation: clv-swat 0.26s ease-in-out infinite; }
@keyframes clv-swat {
  0%,100% { transform: translateY(4px) rotate(0deg); }
  50% { transform: translate(calc(var(--swat-dir) * 20px), -30px) rotate(calc(var(--swat-dir) * 40deg)); }
}

/* the slap: near paw shoots across into the neighbour and back */
.cat-reachpaw { transform-box: fill-box; transform-origin: 50% 100%; animation: clv-reach 0.5s cubic-bezier(0.3,0,0.2,1); }
@keyframes clv-reach {
  0% { transform: translate(0, 4px) rotate(0deg); }
  45% { transform: translate(calc(var(--slap-dir) * 78px), -30px) rotate(calc(var(--slap-dir) * 26deg)); }
  100% { transform: translate(0, 4px) rotate(0deg); }
}
/* aggressor leans into the swing */
.cat-lean { animation: clv-lean 0.5s ease-out; }
@keyframes clv-lean {
  0%,100% { transform: translateX(0) rotate(0deg); }
  45% { transform: translateX(calc(var(--slap-dir) * 8px)) rotate(calc(var(--slap-dir) * 4deg)); }
}

/* the victim's head/body snaps away from the blow */
.cat-recoil { animation: clv-recoil 0.5s cubic-bezier(0.3,0,0.2,1); }
@keyframes clv-recoil {
  0% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(calc(var(--recoil-dir) * 16px)) rotate(calc(var(--recoil-dir) * 10deg)); }
  60% { transform: translateX(calc(var(--recoil-dir) * 6px)) rotate(calc(var(--recoil-dir) * 3deg)); }
  100% { transform: translateX(0) rotate(0deg); }
}
/* impact burst pops on contact */
.cat-impact { transform-box: fill-box; transform-origin: 50% 50%; animation: clv-pop 0.5s ease-out; }
@keyframes clv-pop {
  0% { opacity: 0; scale: 0.2; }
  25% { opacity: 1; scale: 1.15; }
  70% { opacity: 1; scale: 1; }
  100% { opacity: 0; scale: 1; }
}
`;
