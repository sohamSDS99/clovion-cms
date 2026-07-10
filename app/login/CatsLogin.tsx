"use client";

/*
 * Clovion CMS login — "crunch time" split screen.
 * Left panel: four fluffy flat-illustration office cats (think grumpy
 * stock-vector cat behind an indigo laptop) hammering their keyboards on a tan
 * desk. Hover one and it gets visibly angry. Three of them occasionally smack
 * each other. The grey senior never does — but every so often he hits his
 * limit, goes full super saiyan (gold fur, spiked hair, flame aura, rage
 * typing) and the rest of the team quietly gets back to work until he cools.
 *
 * The auth itself is unchanged — the <form> posts to the NextAuth credentials
 * server action passed in as `action`. All the theatrics are client-only garnish.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";

/* ------------------------------------------------------------- cat specs -- */

type CatSpec = {
  body: string; // fluff colour
  ear: string; // inner-ear pink
  stripe?: string; // tabby stripes
  hoodie?: boolean; // black hood up (ears become bumps)
  bow?: boolean; // girl: bow + lashes + blush
  airpods?: string; // AirPods Max cup colour
  glasses?: boolean; // round reading glasses
  mug?: boolean; // coffee on the desk
};

const CATS: CatSpec[] = [
  { body: "#f3ead8", ear: "#eda3b2", hoodie: true }, // the hacker, hood up
  { body: "#f6efdf", ear: "#eda3b2", bow: true }, // the girl
  { body: "#e59a52", ear: "#eda3b2", stripe: "#b9722e", airpods: "#3c5f52" }, // the ginger
  { body: "#a9b1b9", ear: "#e39aa6", stripe: "#7d858d", glasses: true, mug: true }, // the senior
];

const SENIOR = 3;

/* ------------------------------------------------------ face expressions -- */

type Expr =
  | "work" // flat line eyes, small frown
  | "angry" // hovered: >_< eyes, snarl, anger mark
  | "shout" // screaming at the screen
  | "recoil" // just got smacked: x_x
  | "staring" // reading your password: wide round eyes
  | "cowed" // the senior is glowing: dot eyes, sweat, worried squiggle
  | "saiyan"; // the senior himself

/* ---------------------------------------------------------------- one cat -- */

interface CatProps {
  spec: CatSpec;
  expr: Expr;
  slapping: boolean; // throwing the haymaker right now
  slapDir: 1 | -1;
  recoilDir: 1 | -1;
  reduced: boolean;
}

// One fluffy silhouette, reused for the flame aura scaling trick.
const FLAME =
  "M85 -12 C68 8 50 16 56 40 C38 34 32 54 42 70 C24 68 20 90 32 104 C16 110 18 132 32 142 C20 152 26 174 42 180 C36 194 46 204 58 204 L112 204 C124 204 134 194 128 180 C144 174 150 152 138 142 C152 132 154 110 138 104 C150 90 146 68 128 70 C138 54 132 34 114 40 C120 16 102 8 85 -12 Z";

function Cat({ spec, expr, slapping, slapDir, recoilDir, reduced }: CatProps) {
  const saiyan = expr === "saiyan";
  const fur = saiyan ? "#ffd23f" : spec.body;
  const line = "#141414";
  const reachX = slapDir > 0 ? 118 : 52;

  const rootClass = [
    "cat-root",
    reduced ? "" : "cat-live",
    expr === "recoil" ? "cat-recoil" : "",
    slapping ? "cat-lean" : "",
    expr === "angry" ? "cat-bristle" : "",
    expr === "cowed" ? "cat-cowed" : "",
    saiyan ? "cat-saiyan" : "",
    expr === "shout" ? "cat-shout" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox="0 0 170 210"
      className={rootClass}
      style={
        {
          "--slap-dir": slapDir,
          "--recoil-dir": recoilDir,
        } as React.CSSProperties
      }
      role="presentation"
    >
      {/* super saiyan flame aura — outer / mid / core, like the poster */}
      {saiyan && (
        <g className="cat-flame">
          <path d={FLAME} fill="#f4711d" />
          <g transform="translate(85,100) scale(0.74) translate(-85,-100)">
            <path d={FLAME} fill="#ffb636" />
          </g>
          <g transform="translate(85,120) scale(0.46) translate(-85,-120)">
            <path d={FLAME} fill="#ffe27a" />
          </g>
        </g>
      )}

      {/* ears (hood bumps instead when the hood is up) */}
      {spec.hoodie ? (
        <g>
          <circle cx="58" cy="22" r="10" fill="#17181c" />
          <circle cx="112" cy="22" r="10" fill="#17181c" />
        </g>
      ) : saiyan ? null : (
        <g>
          <path d="M52 40 L44 6 L78 28 Z" fill={fur} />
          <path d="M118 40 L126 6 L92 28 Z" fill={fur} />
          <path d="M55 33 L50 13 L70 26 Z" fill={spec.ear} />
          <path d="M115 33 L120 13 L100 26 Z" fill={spec.ear} />
        </g>
      )}

      {/* super saiyan hair: a spiked gold crown instead of ears */}
      {saiyan && (
        <path
          d="M44 44 L38 10 L58 28 L64 -4 L78 24 L85 -12 L92 24 L106 -4 L112 28 L132 10 L126 44 Z"
          fill="#ffd23f"
        />
      )}

      {/* the fluffy body — one scalloped blob, head + torso */}
      <path
        d="M85 22
           C62 22 50 38 49 56
           C48 64 51 72 55 77
           L45 82 L54 87
           C42 94 35 106 34 126
           C33 154 35 186 41 206
           L129 206
           C135 186 137 154 136 126
           C135 106 128 94 116 87
           L125 82 L115 77
           C119 72 122 64 121 56
           C120 38 108 22 85 22 Z"
        fill={fur}
      />

      {/* black hood + hoodie torso over the fluff */}
      {spec.hoodie && (
        <g>
          <path
            fillRule="evenodd"
            d="M85 12 C52 12 40 32 40 58 C40 84 52 100 85 106 C118 100 130 84 130 58 C130 32 118 12 85 12 Z
               M85 24 C61 24 51 41 51 60 C51 80 61 94 85 99 C109 94 119 80 119 60 C119 41 109 24 85 24 Z"
            fill="#17181c"
          />
          <path
            d="M36 128 C38 108 46 100 56 94 L114 94 C124 100 132 108 134 128 C135 155 133 186 128 206 L42 206 C37 186 35 155 36 128 Z"
            fill="#17181c"
          />
          <g stroke="#e8e8e2" strokeWidth="2" strokeLinecap="round">
            <line x1="77" y1="106" x2="73" y2="120" />
            <line x1="93" y1="106" x2="97" y2="120" />
          </g>
          <circle cx="73" cy="122" r="2" fill="#e8e8e2" />
          <circle cx="97" cy="122" r="2" fill="#e8e8e2" />
        </g>
      )}

      {/* bow for the girl */}
      {spec.bow && !saiyan && (
        <g transform="rotate(-12 62 16)">
          <path d="M62 16 L46 8 L49 26 Z" fill="#e2637f" />
          <path d="M62 16 L78 8 L75 26 Z" fill="#e2637f" />
          <circle cx="62" cy="16" r="4.5" fill="#c94a66" />
        </g>
      )}

      {/* AirPods Max */}
      {spec.airpods && !saiyan && (
        <g>
          <path d="M52 42 Q85 8 118 42" stroke={spec.airpods} strokeWidth="7" fill="none" strokeLinecap="round" />
          <rect x="40" y="56" width="14" height="22" rx="7" fill={spec.airpods} transform="rotate(-8 47 67)" />
          <rect x="116" y="56" width="14" height="22" rx="7" fill={spec.airpods} transform="rotate(8 123 67)" />
        </g>
      )}

      {/* tabby stripes */}
      {spec.stripe && !spec.hoodie && (
        <g stroke={saiyan ? "#e0a92c" : spec.stripe} strokeWidth="3.5" strokeLinecap="round" opacity="0.75">
          <line x1="85" y1="26" x2="85" y2="38" />
          <line x1="73" y1="28" x2="70" y2="39" />
          <line x1="97" y1="28" x2="100" y2="39" />
        </g>
      )}

      {/* ------------------------------ the face ------------------------------ */}
      <g className="cat-face">
        {/* brows */}
        {expr === "cowed" ? (
          <g stroke={line} strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M58 50 Q66 54 74 52" />
            <path d="M112 50 Q104 54 96 52" />
          </g>
        ) : expr === "staring" ? (
          <g stroke={line} strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M56 48 Q66 46 76 50" />
            <path d="M114 48 Q104 46 94 50" />
          </g>
        ) : (
          // resting angry face; deeper when riled
          <g stroke={line} strokeWidth="5" strokeLinecap="round" fill="none">
            <path d={expr === "work" ? "M56 52 C64 48 72 49 78 56" : "M54 46 C64 48 72 52 79 59"} />
            <path d={expr === "work" ? "M114 52 C106 48 98 49 92 56" : "M116 46 C106 48 98 52 91 59"} />
          </g>
        )}

        {/* eyes */}
        {expr === "work" || expr === "cowed" ? (
          <g stroke={line} strokeWidth="3" strokeLinecap="round">
            <line x1="61" y1="64" x2="73" y2="64" />
            <line x1="97" y1="64" x2="109" y2="64" />
          </g>
        ) : expr === "angry" || expr === "shout" ? (
          <g stroke={line} strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M61 59 L72 64 L61 69" />
            <path d="M109 59 L98 64 L109 69" />
          </g>
        ) : expr === "recoil" ? (
          <g stroke={line} strokeWidth="3.5" strokeLinecap="round">
            <line x1="62" y1="59" x2="72" y2="69" />
            <line x1="72" y1="59" x2="62" y2="69" />
            <line x1="98" y1="59" x2="108" y2="69" />
            <line x1="108" y1="59" x2="98" y2="69" />
          </g>
        ) : expr === "staring" ? (
          <g>
            <circle cx="67" cy="64" r="7.5" fill="#ffffff" stroke={line} strokeWidth="2" />
            <circle cx="103" cy="64" r="7.5" fill="#ffffff" stroke={line} strokeWidth="2" />
            <circle cx="69.5" cy="66" r="3.2" fill={line} />
            <circle cx="105.5" cy="66" r="3.2" fill={line} />
          </g>
        ) : (
          // saiyan: glowing pupil-less eyes
          <g>
            <ellipse cx="67" cy="64" rx="7" ry="8" fill="#ffffff" stroke="#8fe3ff" strokeWidth="2.5" />
            <ellipse cx="103" cy="64" rx="7" ry="8" fill="#ffffff" stroke="#8fe3ff" strokeWidth="2.5" />
          </g>
        )}

        {/* lashes + blush for the girl */}
        {spec.bow && (expr === "work" || expr === "staring") && (
          <g>
            <g stroke={line} strokeWidth="1.8" strokeLinecap="round">
              <line x1="59" y1="61" x2="54" y2="57" />
              <line x1="111" y1="61" x2="116" y2="57" />
            </g>
            <circle cx="56" cy="78" r="4" fill="#e2637f" opacity="0.35" />
            <circle cx="114" cy="78" r="4" fill="#e2637f" opacity="0.35" />
          </g>
        )}

        {/* round reading glasses */}
        {spec.glasses && !saiyan && (
          <g stroke={line} strokeWidth="2" fill="none">
            <circle cx="67" cy="66" r="10" />
            <circle cx="103" cy="66" r="10" />
            <path d="M77 64 Q85 60 93 64" />
            <line x1="57" y1="63" x2="48" y2="58" />
            <line x1="113" y1="63" x2="122" y2="58" />
          </g>
        )}

        {/* nose */}
        <circle cx="85" cy="78" r="3.6" fill={line} />

        {/* mouth */}
        {expr === "shout" || saiyan ? (
          <g>
            <path d="M72 86 Q85 82 98 86 Q99 102 85 106 Q71 102 72 86 Z" fill={line} />
            <path d="M75 87 L80 87 L77.5 94 Z" fill="#ffffff" />
            <path d="M95 87 L90 87 L92.5 94 Z" fill="#ffffff" />
          </g>
        ) : expr === "angry" ? (
          <g>
            <path d="M74 86 Q85 96 96 86 Q85 90 74 86 Z" fill={line} />
            <path d="M76 87 L80 87 L78 93 Z" fill="#ffffff" />
            <path d="M94 87 L90 87 L92 93 Z" fill="#ffffff" />
          </g>
        ) : expr === "recoil" ? (
          <circle cx="85" cy="88" r="4.5" fill={line} />
        ) : expr === "cowed" ? (
          <path d="M77 88 q4 3 8 0 q4 -3 8 0" stroke={line} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M77 89 Q85 83 93 89" stroke={line} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        )}

        {/* anger mark when hovered */}
        {expr === "angry" && (
          <g className="cat-angermark" stroke="#ff5d5d" strokeWidth="4" strokeLinecap="round">
            <line x1="122" y1="30" x2="122" y2="41" />
            <line x1="133" y1="30" x2="133" y2="41" />
            <line x1="117" y1="35" x2="127" y2="35" />
            <line x1="128" y1="35" x2="138" y2="35" />
          </g>
        )}

        {/* sweat drop when the senior is glowing */}
        {expr === "cowed" && (
          <path
            className="cat-sweat"
            d="M126 34 q7 10 0 15 q-8 -5 0 -15"
            fill="#9fd6ff"
            stroke="#5ba8dd"
            strokeWidth="1.4"
          />
        )}

        {/* grawlix bubble while screaming */}
        {expr === "shout" && (
          <g className="cat-grawlix">
            <path d="M120 24 L112 36 L128 27 Z" fill="#ffd84a" />
            <rect x="110" y="4" width="52" height="22" rx="10" fill="#ffd84a" stroke={line} strokeWidth="1.5" />
            <text x="136" y="20" textAnchor="middle" fontSize="13" fontWeight="800" fill={line}>
              #@?!
            </text>
          </g>
        )}
      </g>

      {/* chest fluff dashes */}
      <g stroke={spec.hoodie ? "#3a3b41" : line} strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <line x1="68" y1="112" x2="65" y2="120" />
        <line x1="79" y1="115" x2="77" y2="123" />
        <line x1="91" y1="115" x2="93" y2="123" />
        <line x1="102" y1="112" x2="105" y2="120" />
      </g>

      {/* ------------------------------ the laptop ---------------------------- */}
      <g className="cat-laptop">
        {/* MacBook: aluminium lid, glowing paw logo, slim deck */}
        <g transform="rotate(-3 85 170)">
          <rect x="38" y="142" width="94" height="56" rx="10" fill="#d4d8dd" stroke="#9aa1a9" strokeWidth="1" />
          <rect x="118" y="142" width="14" height="56" rx="10" fill="#c2c7cd" />
          <ellipse cx="85" cy="168" rx="10" ry="8.5" fill="#ffffff" opacity="0.25" />
          <ellipse cx="85" cy="170" rx="5.5" ry="4.5" fill="#ffffff" />
          <circle cx="78" cy="162" r="2.2" fill="#ffffff" />
          <circle cx="85" cy="160" r="2.2" fill="#ffffff" />
          <circle cx="92" cy="162" r="2.2" fill="#ffffff" />
        </g>
        <rect x="31" y="196" width="108" height="9" rx="4.5" fill="#b7bdc4" />
        <rect x="36" y="203" width="98" height="2" rx="1" fill="#8f959c" opacity="0.6" />
      </g>

      {/* paws hammering, one either side of the base */}
      <g className="cat-paw cat-paw--l">
        <ellipse cx="38" cy="200" rx="10" ry="7" fill={fur} />
        <g stroke={saiyan ? "#c99a12" : "#00000033"} strokeWidth="1.5" strokeLinecap="round">
          <line x1="34" y1="197" x2="34" y2="202" />
          <line x1="39" y1="196" x2="39" y2="202" />
        </g>
      </g>
      <g className="cat-paw cat-paw--r">
        <ellipse cx="132" cy="200" rx="10" ry="7" fill={fur} />
        <g stroke={saiyan ? "#c99a12" : "#00000033"} strokeWidth="1.5" strokeLinecap="round">
          <line x1="128" y1="197" x2="128" y2="202" />
          <line x1="133" y1="196" x2="133" y2="202" />
        </g>
      </g>

      {/* coffee for the senior */}
      {spec.mug && (
        <g>
          <g className="cat-steam" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5">
            <path d="M148 176 q3 -6 0 -12" />
            <path d="M155 178 q3 -5 0 -10" />
          </g>
          <rect x="140" y="182" width="21" height="24" rx="3" fill="#d97706" />
          <path d="M161 187 q9 2 6 9 q-2 6 -8 5" stroke="#d97706" strokeWidth="4" fill="none" />
          <ellipse cx="150.5" cy="183" rx="9" ry="2.4" fill="#8a4a04" />
        </g>
      )}

      {/* the haymaker: wind up overhead, swing across into the neighbour */}
      {slapping && (
        <g className="cat-reacharm">
          <line x1={reachX} y1="130" x2={reachX} y2="58" stroke={fur} strokeWidth="15" strokeLinecap="round" />
          <ellipse cx={reachX} cy="52" rx="11" ry="10" fill={fur} />
          <g stroke="#00000044" strokeWidth="2.2" strokeLinecap="round">
            <line x1={reachX - 6} y1="45" x2={reachX - 9} y2="38" />
            <line x1={reachX} y1="43" x2={reachX} y2="35" />
            <line x1={reachX + 6} y1="45" x2={reachX + 9} y2="38" />
          </g>
        </g>
      )}

      {/* got smacked: impact burst on the struck cheek */}
      {expr === "recoil" && (
        <g className="cat-impact" transform={`translate(${recoilDir < 0 ? 124 : 46}, 66)`}>
          <path
            d="M0 -17 L4.5 -5 L16 -6 L6.5 2 L12 15 L0 6.5 L-12 15 L-6.5 2 L-16 -6 L-4.5 -5 Z"
            fill="#ffd84a"
            stroke={line}
            strokeWidth="1.5"
          />
        </g>
      )}
    </svg>
  );
}

/* --------------------------------------------------------------- the page -- */

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
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);
  const [slap, setSlap] = useState<{ from: number; to: number } | null>(null);
  const [shout, setShout] = useState<number | null>(null);
  const [saiyan, setSaiyan] = useState(false);
  const [reduced, setReduced] = useState(false);
  const saiyanRef = useRef(false);

  const staring = showPassword && password.length > 0;

  // Respect prefers-reduced-motion: no brawling, no screaming, no transforming.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Random smacks between the three juniors. Never while the senior glows.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // ponytail: crypto-free jitter is fine for cosmetic timing.
      const wait = 1800 + Math.random() * 3000;
      timer = setTimeout(() => {
        if (!saiyanRef.current) {
          const from = Math.floor(Math.random() * 3); // juniors only
          const to = Math.random() < 0.5 ? from - 1 : from + 1;
          if (to >= 0 && to < 3) {
            setSlap({ from, to });
            setTimeout(() => setSlap(null), 800);
          }
        }
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  // And every so often a junior screams at their screen.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = 2600 + Math.random() * 3800;
      timer = setTimeout(() => {
        if (!saiyanRef.current) {
          setShout(Math.floor(Math.random() * 3));
          setTimeout(() => setShout(null), 950);
        }
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  // The senior's fuse: after a while he goes super saiyan for a few seconds,
  // and the whole room quietly gets back to work.
  useEffect(() => {
    if (reduced) return;
    let fuse: ReturnType<typeof setTimeout>;
    let cool: ReturnType<typeof setTimeout>;
    const cycle = () => {
      fuse = setTimeout(() => {
        saiyanRef.current = true;
        setSaiyan(true);
        setSlap(null);
        setShout(null);
        cool = setTimeout(() => {
          saiyanRef.current = false;
          setSaiyan(false);
          cycle();
        }, 7000);
      }, 14000 + Math.random() * 14000);
    };
    cycle();
    return () => {
      clearTimeout(fuse);
      clearTimeout(cool);
    };
  }, [reduced]);

  // Expression per cat, most dramatic state wins.
  const exprFor = (i: number): Expr => {
    if (saiyan) return i === SENIOR ? "saiyan" : "cowed";
    if (shout === i) return "shout";
    if (slap?.to === i) return "recoil";
    if (hovered === i) return "angry";
    if (staring) return "staring";
    return "work";
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
          <h2 className="max-w-lg font-display text-[2.15rem] leading-[1.12] tracking-tight">
            The Content Team Has Been Busy Lately &amp; The Stress Level of The
            Leader is Over 9000!
          </h2>
        </div>

        {/* the desk of feuding cats */}
        <div className="relative z-10">
          <div
            className="flex items-end justify-center gap-0 sm:gap-1"
            onMouseLeave={() => setHovered(null)}
          >
            {CATS.map((spec, i) => (
              <div
                key={i}
                className="clv-cat-slot"
                onMouseEnter={() => setHovered(i)}
                style={{
                  width: "24%",
                  zIndex:
                    saiyan && i === SENIOR ? 40 : slap?.from === i ? 30 : hovered === i ? 20 : 10 - i,
                }}
              >
                <Cat
                  spec={spec}
                  expr={exprFor(i)}
                  slapping={slap?.from === i}
                  slapDir={slap && slap.to > slap.from ? 1 : -1}
                  recoilDir={slap && slap.from < i ? 1 : -1}
                  reduced={reduced}
                />
              </div>
            ))}
          </div>
          {/* the desk */}
          <div className="clv-desk relative h-4 rounded-[3px]" />
          <div className="mx-4 h-2.5 rounded-full bg-black/25 blur-[2px]" />
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
   also stops the brawling / screaming / transforming when reduced. */
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

.clv-desk {
  background: linear-gradient(#c79a6b, #a87f52);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);
}

.clv-cat-slot { display: flex; justify-content: center; }
.cat-root { width: 100%; height: auto; overflow: visible; transition: transform 0.25s ease; }

/* paws hammering the keyboard, out of phase */
.cat-paw { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-paw--l { animation: clv-type 0.16s ease-in-out infinite; }
.cat-live .cat-paw--r { animation: clv-type 0.16s ease-in-out infinite; animation-delay: 0.08s; }
@keyframes clv-type { 50% { transform: translateY(-8px); } }
/* soft, careful typing while the senior glows */
.cat-cowed .cat-paw--l, .cat-cowed .cat-paw--r { animation-name: clv-type-soft; animation-duration: 0.5s; }
@keyframes clv-type-soft { 50% { transform: translateY(-2.5px); } }
/* rage typing */
.cat-saiyan .cat-paw--l, .cat-saiyan .cat-paw--r { animation-duration: 0.09s; }

/* the lid shudders under the hammering */
.cat-laptop { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-laptop { animation: clv-shake 0.16s ease-in-out infinite; }
@keyframes clv-shake { 50% { transform: translateY(0.7px); } }
.cat-cowed .cat-laptop { animation: none; }

/* the face bobs with the typing */
.cat-face { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-face { animation: clv-bob 0.26s ease-in-out infinite; }
@keyframes clv-bob { 50% { transform: translateY(1.3px); } }
.cat-cowed .cat-face { animation-duration: 0.6s; }

/* screaming: whole cat rocks back */
.cat-shout { animation: clv-yell 0.95s ease-in-out; }
@keyframes clv-yell {
  0%,100% { transform: rotate(0deg); }
  20%,80% { transform: rotate(-4deg) translateY(-3px); }
}
.cat-grawlix { transform-box: fill-box; transform-origin: 20% 100%; animation: clv-gpop 0.95s ease-out; }
@keyframes clv-gpop {
  0% { opacity: 0; transform: scale(0.3); }
  18% { opacity: 1; transform: scale(1.1); }
  80% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
}

/* hovered: bristle up, anger mark pops */
.cat-bristle { animation: clv-bristle 0.3s ease-out forwards; }
@keyframes clv-bristle {
  0% { transform: scale(1); }
  40% { transform: scale(1.05) rotate(-1.5deg); }
  70% { transform: scale(1.02) rotate(1deg); }
  100% { transform: scale(1.03); }
}
.cat-angermark { animation: clv-apop 0.25s ease-out backwards, clv-athrob 0.8s ease-in-out 0.25s infinite; }
@keyframes clv-apop { 0% { opacity: 0; transform: scale(0.3); } 100% { opacity: 1; transform: scale(1); } }
@keyframes clv-athrob { 50% { opacity: 0.75; } }
.cat-angermark { transform-box: fill-box; transform-origin: 50% 50%; }

/* the haymaker: wind up overhead, swing down across into the neighbour */
.cat-reacharm { transform-box: fill-box; transform-origin: 50% 94%; animation: clv-haymaker 0.62s cubic-bezier(0.45, 0, 0.3, 1) both; }
@keyframes clv-haymaker {
  0% { transform: rotate(0deg); }
  28% { transform: rotate(calc(var(--slap-dir) * -32deg)) translateY(-4px); }
  48% { transform: rotate(calc(var(--slap-dir) * 102deg)) scale(1.06); }
  62% { transform: rotate(calc(var(--slap-dir) * 94deg)); }
  100% { transform: rotate(calc(var(--slap-dir) * 20deg)); }
}
.cat-lean { animation: clv-lean 0.62s ease-out both; }
@keyframes clv-lean {
  0%,12% { transform: translateX(0) rotate(0deg); }
  48% { transform: translateX(calc(var(--slap-dir) * 24px)) rotate(calc(var(--slap-dir) * 5deg)); }
  70% { transform: translateX(calc(var(--slap-dir) * 14px)) rotate(calc(var(--slap-dir) * 3deg)); }
  100% { transform: translateX(0) rotate(0deg); }
}
.cat-recoil { animation: clv-recoil 0.55s cubic-bezier(0.3, 0, 0.2, 1) 0.18s backwards; }
@keyframes clv-recoil {
  0% { transform: translateX(0) rotate(0deg); }
  30% { transform: translateX(calc(var(--recoil-dir) * 18px)) rotate(calc(var(--recoil-dir) * 10deg)); }
  62% { transform: translateX(calc(var(--recoil-dir) * 7px)) rotate(calc(var(--recoil-dir) * 4deg)); }
  100% { transform: translateX(0) rotate(0deg); }
}
.cat-impact { transform-box: fill-box; transform-origin: 50% 50%; animation: clv-pop 0.5s ease-out 0.2s backwards; }
@keyframes clv-pop {
  0% { opacity: 0; scale: 0.2; }
  25% { opacity: 1; scale: 1.18; }
  70% { opacity: 1; scale: 1; }
  100% { opacity: 0; scale: 1; }
}

/* super saiyan: flame roars, the cat trembles with power */
.cat-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: clv-flame 0.24s ease-in-out infinite alternate; }
@keyframes clv-flame {
  0% { transform: scaleY(0.97) scaleX(1.01); }
  100% { transform: scaleY(1.05) scaleX(0.99); }
}
.cat-saiyan { animation: clv-rage 0.12s linear infinite; }
@keyframes clv-rage {
  0%,100% { transform: translateX(-1.2px); }
  50% { transform: translateX(1.2px); }
}
/* cowed juniors hunker down */
.cat-cowed { transform: scale(0.96) translateY(4px); }

/* the sweat drop slides */
.cat-sweat { animation: clv-sweat 1.4s ease-in-out infinite; }
@keyframes clv-sweat {
  0%,100% { transform: translateY(0); opacity: 0.95; }
  50% { transform: translateY(5px); opacity: 0.45; }
}

/* coffee steam */
.cat-steam path { animation: clv-steam 2.2s ease-in-out infinite; }
.cat-steam path:last-child { animation-delay: 0.7s; }
@keyframes clv-steam {
  0%,100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-4px); opacity: 0.15; }
}
`;
