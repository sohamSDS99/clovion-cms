"use client";

/*
 * Clovion CMS login — "crunch time" split screen.
 * Left panel: four furious office cats hammering MacBooks in an emerald room.
 * We see the backs of their laptop lids (glowing logo, screen light spilling
 * around the edges) and their paws slamming the keys behind the lid. Eyes
 * track the cursor; hover a cat and it rears up and genuinely swings at your
 * pointer; at random one cat throws an overhead haymaker at its neighbour or
 * just screams at its screen; reveal the password and all four lock onto it.
 *
 * The auth itself is unchanged — the <form> posts to the NextAuth credentials
 * server action passed in as `action`. All the theatrics are client-only garnish.
 */

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";

/* ------------------------------------------------------------- cat specs -- */

type CatSpec = {
  fur: { body: string; belly: string; ear: string; brow: string };
  iris: string;
  whisker: string;
  claw: string;
  stripes?: boolean; // forehead tabby stripes
  hoodie?: string; // hood + torso colour (hood up, ears become bumps)
  shades?: boolean; // sunglasses; slide down to peek at the password
  glasses?: boolean; // reading glasses low on the nose
  airpods?: string; // AirPods Max cup colour
  girl?: boolean; // lashes + bow + blush
  mug?: boolean; // coffee on the desk
};

const CATS: CatSpec[] = [
  {
    // the hacker: hood up, shades on
    fur: { body: "#3d3f47", belly: "#565962", ear: "#e79aa8", brow: "#0d0d10" },
    iris: "#8fd0a8",
    whisker: "#ffffff66",
    claw: "#f2f2ee",
    hoodie: "#37855f",
    shades: true,
  },
  {
    // the girl: bow, lashes, rose AirPods Max
    fur: { body: "#e9dfca", belly: "#f6efe0", ear: "#ec9fb0", brow: "#c9bc9e" },
    iris: "#6b9bd1",
    whisker: "#14141466",
    claw: "#4a4a44",
    airpods: "#f0b6c3",
    girl: true,
  },
  {
    // the ginger: tabby, AirPods Max, permanently furious
    fur: { body: "#dd8637", belly: "#eec39a", ear: "#e79aa8", brow: "#a75f22" },
    iris: "#3f7d54",
    whisker: "#14141466",
    claw: "#5a3517",
    airpods: "#3c5f52",
    stripes: true,
  },
  {
    // the senior: reading glasses, coffee, grey tabby
    fur: { body: "#8f99a2", belly: "#c4ccd2", ear: "#e39aa6", brow: "#5f676e" },
    iris: "#d9a441",
    whisker: "#14141455",
    claw: "#3d444a",
    glasses: true,
    stripes: true,
    mug: true,
  },
];

/* ---------------------------------------------------------------- one cat -- */

interface CatProps {
  spec: CatSpec;
  mouseX: number;
  mouseY: number;
  staring: boolean; // reading your password
  swat: boolean; // rearing up + swinging at your cursor (hover)
  swatDir: 1 | -1; // which side the cursor is on
  shouting: boolean; // screaming at the screen
  recoil: boolean; // just got clobbered by a neighbour
  recoilDir: 1 | -1; // which way to snap (away from the hit)
  slapping: boolean; // throwing the haymaker right now
  slapDir: 1 | -1; // toward which neighbour (−1 left, +1 right)
  reduced: boolean; // prefers-reduced-motion
}

function Cat({
  spec,
  mouseX,
  mouseY,
  staring,
  swat,
  swatDir,
  shouting,
  recoil,
  recoilDir,
  slapping,
  slapDir,
  reduced,
}: CatProps) {
  const headRef = useRef<SVGPathElement>(null);
  const { fur } = spec;
  const aggro = swat || slapping; // fangs out, ears pinned

  // Pupil offset in SVG units — point the slits at the cursor.
  let ex = 0;
  let ey = 0;
  let dilate = 1; // >1 = big alarmed pupils
  if (staring) {
    ex = 3;
    ey = 2.8;
    dilate = 2.1;
  } else if (recoil) {
    ex = recoilDir * -3; // eyes thrown toward the blow
    ey = -1;
    dilate = 2.1;
  } else if (!reduced && headRef.current) {
    const r = headRef.current.getBoundingClientRect();
    const dx = mouseX - (r.left + r.width / 2);
    const dy = mouseY - (r.top + r.height / 2);
    const a = Math.atan2(dy, dx);
    const mag = Math.min(Math.hypot(dx, dy) / 40, swat ? 4.2 : 3.2);
    ex = Math.cos(a) * mag;
    ey = Math.sin(a) * mag;
  }

  const rootClass = [
    "cat-root",
    reduced ? "" : "cat-live",
    recoil ? "cat-recoil" : "",
    slapping ? "cat-lean" : "",
    swat && !reduced ? "cat-lunge" : "",
    shouting ? "cat-shout" : "",
    aggro ? "cat-aggro" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Haymaker arm: anchored at the shoulder on the victim's side.
  const reachX = slapDir > 0 ? 122 : 48;

  return (
    <svg
      viewBox="0 0 170 210"
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
      {/* lashing tail */}
      <path
        className="cat-tail"
        d="M136 198 Q170 188 167 144 Q165 116 146 118 Q161 127 157 150 Q152 182 130 188 Z"
        fill={fur.body}
      />

      {/* torso behind the laptop (hoodie fabric if hood is up) */}
      <path d="M30 206 Q30 96 85 92 Q140 96 140 206 Z" fill={spec.hoodie ?? fur.body} />
      {spec.hoodie ? (
        <g>
          {/* drawstrings on the visible sliver of chest */}
          <g stroke="#e7f0ea" strokeWidth="2" strokeLinecap="round">
            <line x1="74" y1="106" x2="70" y2="122" />
            <line x1="96" y1="106" x2="100" y2="122" />
          </g>
          <circle cx="70" cy="124" r="2" fill="#e7f0ea" />
          <circle cx="100" cy="124" r="2" fill="#e7f0ea" />
        </g>
      ) : (
        <ellipse cx="85" cy="112" rx="26" ry="18" fill={fur.belly} />
      )}
      {/* screen light spilling onto the chest */}
      <ellipse cx="85" cy="108" rx="34" ry="14" fill="#d8f0e2" opacity="0.1" />

      {/* typing arms — behind the lid, paws slamming down onto the keys */}
      <g className="cat-arm cat-arm--l">
        <line x1="46" y1="130" x2="60" y2="102" stroke={fur.body} strokeWidth="13" strokeLinecap="round" />
        <ellipse cx="60" cy="100" rx="9" ry="8" fill={fur.body} />
        {aggro && (
          <g stroke={spec.claw} strokeWidth="2" strokeLinecap="round">
            <line x1="54" y1="93" x2="52" y2="87" />
            <line x1="60" y1="91" x2="60" y2="85" />
            <line x1="66" y1="93" x2="68" y2="87" />
          </g>
        )}
      </g>
      <g className="cat-arm cat-arm--r">
        <line x1="124" y1="130" x2="110" y2="102" stroke={fur.body} strokeWidth="13" strokeLinecap="round" />
        <ellipse cx="110" cy="100" rx="9" ry="8" fill={fur.body} />
        {aggro && (
          <g stroke={spec.claw} strokeWidth="2" strokeLinecap="round">
            <line x1="104" y1="93" x2="102" y2="87" />
            <line x1="110" y1="91" x2="110" y2="85" />
            <line x1="116" y1="93" x2="118" y2="87" />
          </g>
        )}
      </g>

      {/* -------- MacBook, back of the lid facing us -------- */}
      <g className="cat-laptop">
        {/* screen glow leaking around the lid */}
        <rect x="26" y="106" width="118" height="100" rx="10" className="cat-glow" fill="#d8f0e2" opacity="0.07" />
        <rect x="31" y="112" width="108" height="92" rx="8" className="cat-glow" fill="#d8f0e2" opacity="0.14" />
        {/* aluminium lid */}
        <path
          d="M42 118 Q38 118 37.6 122 L33.2 196 Q33 200 37 200 L133 200 Q137 200 136.8 196 L132.4 122 Q132 118 128 118 Z"
          fill="#d4d8dd"
        />
        <path d="M128 118 Q132 118 132.4 122 L136.8 196 Q137 200 133 200 L124 200 L118 118 Z" fill="#c2c7cd" />
        {/* glowing paw logo */}
        <g>
          <ellipse cx="85" cy="162" rx="12" ry="10" fill="#ffffff" opacity="0.18" />
          <ellipse cx="85" cy="164" rx="6.5" ry="5.5" fill="#ffffff" opacity="0.92" />
          <circle cx="77" cy="155" r="2.6" fill="#ffffff" opacity="0.92" />
          <circle cx="85" cy="152.5" r="2.6" fill="#ffffff" opacity="0.92" />
          <circle cx="93" cy="155" r="2.6" fill="#ffffff" opacity="0.92" />
        </g>
        {/* keyboard base sliver + shadow */}
        <rect x="30" y="200" width="110" height="5.5" rx="2.5" fill="#b7bdc4" />
        <rect x="34" y="205" width="102" height="1.6" fill="#8f959c" opacity="0.6" />
        {/* clack ticks where the paws land */}
        <g stroke="#eef7f1" strokeWidth="2" strokeLinecap="round">
          <line className="cat-clack cat-clack--l" x1="56" y1="114" x2="64" y2="114" />
          <line className="cat-clack cat-clack--r" x1="106" y1="114" x2="114" y2="114" />
        </g>
      </g>
      <ellipse cx="85" cy="207" rx="56" ry="2.5" fill="#000000" opacity="0.15" />

      {/* coffee mug for the senior */}
      {spec.mug && (
        <g>
          <g className="cat-steam" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5">
            <path d="M150 172 q3 -6 0 -12" />
            <path d="M157 174 q3 -5 0 -10" />
          </g>
          <rect x="142" y="178" width="21" height="26" rx="3" fill="#d97706" />
          <path d="M163 183 q9 2 6 10 q-2 6 -8 5" stroke="#d97706" strokeWidth="4" fill="none" />
          <ellipse cx="152.5" cy="179" rx="9" ry="2.4" fill="#8a4a04" />
        </g>
      )}

      {/* -------- head -------- */}
      <g className="cat-head">
        {spec.hoodie ? (
          <g>
            {/* hood up: rounded bumps instead of ears, ring of fabric round the face */}
            <circle cx="56" cy="22" r="11" fill={spec.hoodie} />
            <circle cx="114" cy="22" r="11" fill={spec.hoodie} />
            <path
              d="M85 12 Q44 12 36 46 Q29 68 39 88 Q49 108 85 116 Q121 108 131 88 Q141 68 134 46 Q126 12 85 12 Z"
              fill={spec.hoodie}
            />
          </g>
        ) : (
          <g className="cat-ears">
            <path d="M50 40 L36 2 L76 28 Z" fill={fur.body} />
            <path d="M120 40 L134 2 L94 28 Z" fill={fur.body} />
            <path d="M53 34 L45 11 L67 26 Z" fill={fur.ear} />
            <path d="M117 34 L125 11 L103 26 Z" fill={fur.ear} />
          </g>
        )}

        {/* bow between the ears */}
        {spec.girl && (
          <g>
            <path d="M74 12 L60 4 L62 20 Z" fill="#e2637f" />
            <path d="M88 12 L102 4 L100 20 Z" fill="#e2637f" />
            <circle cx="81" cy="12" r="4.5" fill="#c94a66" />
          </g>
        )}

        {/* AirPods Max: band behind the head, cups at the cheeks */}
        {spec.airpods && (
          <path d="M50 40 Q85 6 120 40" stroke={spec.airpods} strokeWidth="7" fill="none" strokeLinecap="round" />
        )}

        {/* angular head with cheek tufts */}
        <path
          ref={headRef}
          d="M85 24 Q60 24 51 40 Q43 55 47 70 L36 76 L49 81 Q54 99 85 108 Q116 99 121 81 L134 76 L123 70 Q127 55 119 40 Q110 24 85 24 Z"
          fill={fur.body}
        />
        {/* screen light on the face */}
        <ellipse cx="85" cy="92" rx="26" ry="14" fill="#d8f0e2" opacity="0.09" />

        {spec.airpods && (
          <g>
            <rect x="38" y="56" width="15" height="24" rx="7" fill={spec.airpods} transform="rotate(-8 45 68)" />
            <rect x="117" y="56" width="15" height="24" rx="7" fill={spec.airpods} transform="rotate(8 125 68)" />
            <ellipse cx="45.5" cy="68" rx="4" ry="7" fill="#00000022" transform="rotate(-8 45 68)" />
            <ellipse cx="124.5" cy="68" rx="4" ry="7" fill="#00000022" transform="rotate(8 125 68)" />
          </g>
        )}

        {/* forehead stripes */}
        {spec.stripes && (
          <g stroke={fur.brow} strokeWidth="3.5" strokeLinecap="round" opacity="0.7">
            <line x1="85" y1="27" x2="85" y2="40" />
            <line x1="74" y1="29" x2="70" y2="41" />
            <line x1="96" y1="29" x2="100" y2="41" />
          </g>
        )}

        {/* muzzle */}
        <ellipse cx="85" cy="92" rx="17" ry="12" fill={fur.belly} />

        {/* eyes */}
        {shouting ? (
          // screaming: eyes squeezed shut
          <g stroke="#0c0c0c" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M58 66 Q68 60 78 66" />
            <path d="M92 66 Q102 60 112 66" />
          </g>
        ) : (
          <g>
            <ellipse cx="68" cy="66" rx="10" ry="7.5" fill="#fbfbf7" />
            <ellipse cx="102" cy="66" rx="10" ry="7.5" fill="#fbfbf7" />
            <g className="cat-pupils" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
              <circle cx="68" cy="66" r="5" fill={spec.iris} />
              <circle cx="102" cy="66" r="5" fill={spec.iris} />
              <ellipse cx="68" cy="66" rx={2.3 * dilate} ry={6.2 / dilate} fill="#0c0c0c" />
              <ellipse cx="102" cy="66" rx={2.3 * dilate} ry={6.2 / dilate} fill="#0c0c0c" />
              <circle cx="66.5" cy="63.5" r="1" fill="#ffffff" opacity="0.85" />
              <circle cx="100.5" cy="63.5" r="1" fill="#ffffff" opacity="0.85" />
            </g>
            {/* half-closed angry lids */}
            <path d="M57 63 Q68 56 79 63 L79 58 Q68 52 57 57 Z" fill={fur.body} />
            <path d="M91 63 Q102 56 113 63 L113 58 Q102 52 91 57 Z" fill={fur.body} />
          </g>
        )}

        {/* heavy brows — a V driven into the bridge of the nose */}
        <g stroke="#0a0a0a" strokeWidth="5.5" strokeLinecap="round">
          <line x1="55" y1="55" x2="81" y2="66" />
          <line x1="115" y1="55" x2="89" y2="66" />
        </g>

        {/* lashes + blush for the girl */}
        {spec.girl && !shouting && (
          <g>
            <g stroke="#141414" strokeWidth="1.6" strokeLinecap="round">
              <line x1="59" y1="61" x2="54" y2="57" />
              <line x1="58" y1="65" x2="52" y2="63" />
              <line x1="111" y1="61" x2="116" y2="57" />
              <line x1="112" y1="65" x2="118" y2="63" />
            </g>
            <circle cx="58" cy="80" r="4" fill="#e2637f" opacity="0.3" />
            <circle cx="112" cy="80" r="4" fill="#e2637f" opacity="0.3" />
          </g>
        )}

        {/* reading glasses low on the nose — eyes glare over the rims */}
        {spec.glasses && (
          <g stroke="#2b2d31" strokeWidth="2" fill="#ffffff" fillOpacity="0.06">
            <circle cx="68" cy="74" r="8.5" />
            <circle cx="102" cy="74" r="8.5" />
            <path d="M76.5 73 Q85 69 93.5 73" fill="none" />
            <line x1="59.5" y1="72" x2="48" y2="66" />
            <line x1="110.5" y1="72" x2="122" y2="66" />
          </g>
        )}

        {/* sunglasses — slide down the nose when your password shows */}
        {spec.shades && (
          <g className={staring ? "cat-shades cat-shades--peek" : "cat-shades"}>
            <rect x="53" y="58" width="28" height="17" rx="7" fill="#0c0d10" stroke="#6a6e78" strokeWidth="1.6" />
            <rect x="89" y="58" width="28" height="17" rx="7" fill="#0c0d10" stroke="#6a6e78" strokeWidth="1.6" />
            <path d="M81 63 Q85 60 89 63" stroke="#6a6e78" strokeWidth="2.4" fill="none" />
            <line x1="53" y1="63" x2="44" y2="58" stroke="#6a6e78" strokeWidth="2.4" />
            <line x1="117" y1="63" x2="126" y2="58" stroke="#6a6e78" strokeWidth="2.4" />
            <line x1="59" y1="62" x2="66" y2="70" stroke="#ffffff" strokeWidth="2.2" opacity="0.38" />
            <line x1="95" y1="62" x2="102" y2="70" stroke="#ffffff" strokeWidth="2.2" opacity="0.38" />
          </g>
        )}

        {/* nose */}
        <path d="M79 90 L91 90 L85 98 Z" fill="#d97b8e" />

        {/* mouth: scream > snarl > scowl */}
        {shouting ? (
          <g>
            <path d="M70 98 Q85 94 100 98 Q102 116 85 121 Q68 116 70 98 Z" fill="#5e1a24" />
            <ellipse cx="85" cy="115" rx="8" ry="4" fill="#e0697d" />
            <path d="M72 99 L78 99 L75 107 Z" fill="#ffffff" />
            <path d="M98 99 L92 99 L95 107 Z" fill="#ffffff" />
          </g>
        ) : aggro ? (
          <g>
            <path d="M70 100 Q85 117 100 100 Q85 106 70 100 Z" fill="#5e1a24" />
            <path d="M72 101 L77 101 L74.5 109 Z" fill="#ffffff" />
            <path d="M98 101 L93 101 L95.5 109 Z" fill="#ffffff" />
          </g>
        ) : (
          <path d="M74 102 Q85 97 96 102" stroke="#141414" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}

        {/* whiskers */}
        <g stroke={spec.whisker} strokeWidth="1.2" strokeLinecap="round">
          <line x1="64" y1="88" x2="36" y2="82" />
          <line x1="64" y1="93" x2="37" y2="96" />
          <line x1="106" y1="88" x2="134" y2="82" />
          <line x1="106" y1="93" x2="133" y2="96" />
        </g>

        {/* grawlix bubble while screaming */}
        {shouting && (
          <g className="cat-grawlix">
            <path d="M120 22 L112 34 L128 25 Z" fill="#ffd84a" />
            <rect x="110" y="2" width="52" height="22" rx="10" fill="#ffd84a" stroke="#141414" strokeWidth="1.5" />
            <text x="136" y="18" textAnchor="middle" fontSize="13" fontWeight="800" fill="#141414">
              #@?!
            </text>
          </g>
        )}
      </g>

      {/* hover: rear up and swing at the cursor, claws out */}
      {swat && !reduced && (
        <g className="cat-swatarm">
          <line
            x1={swatDir > 0 ? 118 : 52}
            y1="132"
            x2={swatDir > 0 ? 132 : 38}
            y2="76"
            stroke={fur.body}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <ellipse cx={swatDir > 0 ? 133 : 37} cy="72" rx="10.5" ry="9.5" fill={fur.body} />
          <g stroke={spec.claw} strokeWidth="2.4" strokeLinecap="round">
            <line x1={swatDir > 0 ? 126 : 30} y1="64" x2={swatDir > 0 ? 123 : 27} y2="56" />
            <line x1={swatDir > 0 ? 133 : 37} y1="62" x2={swatDir > 0 ? 133 : 37} y2="53" />
            <line x1={swatDir > 0 ? 140 : 44} y1="64" x2={swatDir > 0 ? 143 : 47} y2="56" />
          </g>
        </g>
      )}

      {/* the haymaker: wind up overhead, swing across into the neighbour */}
      {slapping && (
        <g className="cat-reacharm">
          <line x1={reachX} y1="132" x2={reachX} y2="58" stroke={fur.body} strokeWidth="14" strokeLinecap="round" />
          <ellipse cx={reachX} cy="52" rx="11" ry="10" fill={fur.body} />
          <g stroke={spec.claw} strokeWidth="2.4" strokeLinecap="round">
            <line x1={reachX - 7} y1="44" x2={reachX - 10} y2="36" />
            <line x1={reachX} y1="42" x2={reachX} y2="33" />
            <line x1={reachX + 7} y1="44" x2={reachX + 10} y2="36" />
          </g>
        </g>
      )}

      {/* got clobbered: impact burst on the struck cheek */}
      {recoil && (
        <g className="cat-impact" transform={`translate(${recoilDir < 0 ? 126 : 44}, 70)`}>
          <path
            d="M0 -17 L4.5 -5 L16 -6 L6.5 2 L12 15 L0 6.5 L-12 15 L-6.5 2 L-16 -6 L-4.5 -5 Z"
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
  const [shout, setShout] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const catRowRef = useRef<HTMLDivElement>(null);

  const staring = showPassword && password.length > 0;

  // Respect prefers-reduced-motion: no tracking, no brawling, no screaming.
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

  // Random, unprovoked cat-on-cat violence — the haymaker actually lands.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // ponytail: crypto-free jitter is fine for cosmetic timing.
      const wait = 1600 + Math.random() * 2800;
      timer = setTimeout(() => {
        const from = Math.floor(Math.random() * CATS.length);
        const to = Math.random() < 0.5 ? from - 1 : from + 1;
        if (to >= 0 && to < CATS.length) {
          setSlap({ from, to });
          setTimeout(() => setSlap(null), 800);
        }
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduced]);

  // And every so often somebody just screams at their screen.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = 2400 + Math.random() * 3600;
      timer = setTimeout(() => {
        setShout(Math.floor(Math.random() * CATS.length));
        setTimeout(() => setShout(null), 950);
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
            The team&apos;s been shipping all night and tempers are gone. Hover a
            cat if you don&apos;t need that cursor.
          </p>
        </div>

        {/* the desk of feuding cats */}
        <div className="relative z-10">
          <div
            ref={catRowRef}
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
                  // mid-swing sits on top so the paw lands over the victim
                  zIndex: slap?.from === i ? 30 : hovered === i ? 20 : 10 - i,
                }}
              >
                <Cat
                  spec={spec}
                  mouseX={mouse.x}
                  mouseY={mouse.y}
                  staring={staring}
                  swat={hovered === i}
                  swatDir={mouse.x < catCenterX(i) ? -1 : 1}
                  shouting={shout === i}
                  recoil={slap?.to === i}
                  recoilDir={slap && slap.from < i ? 1 : -1}
                  slapping={slap?.from === i}
                  slapDir={slap && slap.to > slap.from ? 1 : -1}
                  reduced={reduced}
                />
              </div>
            ))}
          </div>
          {/* the desk */}
          <div className="clv-desk relative h-3.5 rounded-[3px]" />
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
                  Four sets of eyes just locked onto your password. One lowered
                  its sunglasses.
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
   also stops tracking / brawling / screaming when reduced. */
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
  background: linear-gradient(#1a5f49, #113f31);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}

.clv-cat-slot { display: flex; justify-content: center; }
.cat-root { width: 100%; height: auto; overflow: visible; }
.cat-pupils { transition: transform 0.09s ease-out; }
.cat-shades { transition: transform 0.25s ease-out; }
.cat-shades--peek { transform: translateY(9px) rotate(2deg); }

/* screen glow flickers */
.cat-live .cat-glow { animation: clv-flicker 1.1s steps(2, jump-none) infinite; }
@keyframes clv-flicker { 50% { opacity: 0.22; } }

/* the lid shudders under the hammering */
.cat-laptop { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-laptop { animation: clv-shake 0.18s ease-in-out infinite; }
@keyframes clv-shake { 50% { transform: translateY(0.8px); } }

/* head bobs with the typing */
.cat-head { transform-box: fill-box; transform-origin: 50% 100%; }
.cat-live .cat-head { animation: clv-bob 0.26s ease-in-out infinite; }
@keyframes clv-bob { 50% { transform: translateY(1.6px) rotate(0.5deg); } }
/* screaming overrides the bob: head thrown back */
.cat-live.cat-shout .cat-head { animation: clv-yell 0.95s ease-in-out; }
@keyframes clv-yell {
  0%,100% { transform: rotate(0deg) translateY(0); }
  20%,80% { transform: rotate(-9deg) translateY(-4px); }
}
.cat-grawlix { transform-box: fill-box; transform-origin: 20% 100%; animation: clv-pop 0.95s ease-out; }

/* tail lashes fast and angry */
.cat-tail { transform-box: fill-box; transform-origin: 0% 100%; }
.cat-live .cat-tail { animation: clv-lash 0.7s ease-in-out infinite; }
@keyframes clv-lash { 0%,100% { transform: rotate(7deg); } 50% { transform: rotate(-17deg); } }

/* arms hammering the keys behind the lid, out of phase */
.cat-arm { transform-box: fill-box; }
.cat-arm--l { transform-origin: 25% 95%; }
.cat-arm--r { transform-origin: 75% 95%; }
.cat-live .cat-arm--l { animation: clv-hammer-l 0.18s ease-in-out infinite; }
.cat-live .cat-arm--r { animation: clv-hammer-r 0.18s ease-in-out infinite; animation-delay: 0.09s; }
@keyframes clv-hammer-l { 50% { transform: rotate(10deg) translateY(9px); } 100% { transform: rotate(-12deg); } }
@keyframes clv-hammer-r { 50% { transform: rotate(-10deg) translateY(9px); } 100% { transform: rotate(12deg); } }
/* clack ticks blink where the paws land */
.cat-clack { opacity: 0; }
.cat-live .cat-clack--l { animation: clv-clack 0.18s steps(1) infinite; }
.cat-live .cat-clack--r { animation: clv-clack 0.18s steps(1) infinite; animation-delay: 0.09s; }
@keyframes clv-clack { 45% { opacity: 0.9; } 65% { opacity: 0; } }

/* ears flatten back when the cat is riled */
.cat-ears { transform-box: fill-box; transform-origin: 50% 100%; transition: transform 0.12s ease-out; }
.cat-aggro .cat-ears { transform: scaleY(0.62) translateY(8px); }

/* hover: rear up + repeated overhead swings at the cursor */
.cat-lunge { animation: clv-lunge 0.42s ease-in-out infinite; }
@keyframes clv-lunge {
  0%,100% { transform: translateX(0) rotate(0deg); }
  45% { transform: translateX(calc(var(--swat-dir) * 9px)) rotate(calc(var(--swat-dir) * 3deg)); }
}
.cat-swatarm { transform-box: fill-box; transform-origin: 50% 92%; animation: clv-swat 0.42s cubic-bezier(0.5, 0, 0.4, 1) infinite; }
@keyframes clv-swat {
  0%,100% { transform: rotate(calc(var(--swat-dir) * -14deg)); }
  30% { transform: rotate(calc(var(--swat-dir) * -85deg)) translateY(-4px); }
  52% { transform: rotate(calc(var(--swat-dir) * 62deg)); }
  68% { transform: rotate(calc(var(--swat-dir) * 48deg)); }
}

/* the haymaker: wind up overhead, then swing down across into the neighbour */
.cat-reacharm { transform-box: fill-box; transform-origin: 50% 94%; animation: clv-haymaker 0.62s cubic-bezier(0.45, 0, 0.3, 1) both; }
@keyframes clv-haymaker {
  0% { transform: rotate(0deg); }
  28% { transform: rotate(calc(var(--slap-dir) * -32deg)) translateY(-4px); }
  48% { transform: rotate(calc(var(--slap-dir) * 102deg)) scale(1.06); }
  62% { transform: rotate(calc(var(--slap-dir) * 94deg)); }
  100% { transform: rotate(calc(var(--slap-dir) * 20deg)); }
}
/* aggressor lunges bodily into the swing */
.cat-lean { animation: clv-lean 0.62s ease-out both; }
@keyframes clv-lean {
  0%,12% { transform: translateX(0) rotate(0deg); }
  48% { transform: translateX(calc(var(--slap-dir) * 24px)) rotate(calc(var(--slap-dir) * 6deg)); }
  70% { transform: translateX(calc(var(--slap-dir) * 14px)) rotate(calc(var(--slap-dir) * 3deg)); }
  100% { transform: translateX(0) rotate(0deg); }
}
/* the victim snaps away from the blow — delayed until the paw arrives */
.cat-recoil { animation: clv-recoil 0.55s cubic-bezier(0.3, 0, 0.2, 1) 0.18s backwards; }
@keyframes clv-recoil {
  0% { transform: translateX(0) rotate(0deg); }
  30% { transform: translateX(calc(var(--recoil-dir) * 18px)) rotate(calc(var(--recoil-dir) * 11deg)); }
  62% { transform: translateX(calc(var(--recoil-dir) * 7px)) rotate(calc(var(--recoil-dir) * 4deg)); }
  100% { transform: translateX(0) rotate(0deg); }
}
/* impact burst pops on contact */
.cat-impact { transform-box: fill-box; transform-origin: 50% 50%; animation: clv-pop 0.5s ease-out 0.2s backwards; }
@keyframes clv-pop {
  0% { opacity: 0; scale: 0.2; }
  25% { opacity: 1; scale: 1.18; }
  70% { opacity: 1; scale: 1; }
  100% { opacity: 0; scale: 1; }
}

/* coffee steam */
.cat-steam path { animation: clv-steam 2.2s ease-in-out infinite; }
.cat-steam path:last-child { animation-delay: 0.7s; }
@keyframes clv-steam {
  0%,100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-4px); opacity: 0.15; }
}
`;
