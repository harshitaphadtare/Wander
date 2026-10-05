import {
  ArrowRight,
  BookOpen,
  Check,
  CloudFog,
  Coffee,
  Compass,
  Database,
  Fingerprint,
  Flame,
  Footprints,
  Gift,
  KeyRound,
  Lock,
  MapPin,
  MapPinned,
  Mountain,
  Navigation,
  Smartphone,
  Sparkles,
  Sun,
  Sunset,
  Trees,
  UtensilsCrossed,
  Utensils,
  Wand2,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { linkProps, navigate } from '../lib/router'
import { CountUp } from '../ui/bits'
import { AppIcon } from '../ui/Logo'
import HeroMap from './HeroMap'
import './landing.css'

const ease = [0.16, 1, 0.3, 1] as const
const YEAR = new Date().getFullYear()

export default function Landing({ signedIn }: { signedIn: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const heroCta = useRef<HTMLDivElement>(null)
  const finalCta = useRef<HTMLDivElement>(null)
  const { scrollY, scrollYProgress } = useScroll({ container: scroller })
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40 })

  // Phones: a sticky sign-up bar once the hero buttons scroll away, gone again at the final CTA.
  const heroCtaVisible = useInView(heroCta, { root: scroller })
  const finalVisible = useInView(finalCta, { root: scroller, margin: '0px 0px -10% 0px' })
  const showSticky = !signedIn && !heroCtaVisible && !finalVisible && scrolled

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="lp" ref={scroller}>
      <motion.div className="lp-progress" style={{ scaleX: progress }} />

      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <a className="lp-logo" href="/" onClick={(e) => (e.preventDefault(), scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }))}>
            <AppIcon size={30} />
            <span className="display">Wander</span>
          </a>
          <nav className="lp-links" aria-label="Sections">
            <button onClick={() => jump('features')}>Features</button>
            <button onClick={() => jump('explore')}>Explore</button>
            <button onClick={() => jump('how')}>How it works</button>
            <button onClick={() => jump('privacy')}>Privacy</button>
          </nav>
          <div className="lp-nav-cta">
            {signedIn ? (
              <a className="lp-btn primary small" {...linkProps('/app')}>
                Open Wander <ArrowRight size={16} strokeWidth={2.4} />
              </a>
            ) : (
              <>
                <a className="lp-btn ghost" {...linkProps('/login')}>
                  Sign in
                </a>
                <a className="lp-btn primary small hide-sm" {...linkProps('/signup')}>
                  Get started
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <Hero scroller={scroller} ctaRef={heroCta} signedIn={signedIn} />
      <Marquee />
      <Features />
      <ExploreSpotlight />
      <HowItWorks />
      <Privacy />
      <FinalCta ctaRef={finalCta} signedIn={signedIn} />

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo">
              <AppIcon size={26} />
              <span className="display">Wander</span>
            </span>
            <p>Your personal explore map.</p>
          </div>
          <nav className="lp-footer-links" aria-label="Footer">
            <a {...linkProps('/signup')}>Create account</a>
            <a {...linkProps('/login')}>Sign in</a>
            <button onClick={() => jump('privacy')}>Privacy</button>
          </nav>
          <p className="lp-footer-fine">
            Map data © OpenStreetMap contributors · OpenFreeMap · Photon · © {YEAR} Wander
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {showSticky && (
          <motion.div
            className="lp-sticky"
            initial={{ y: '120%' }}
            animate={{ y: 0 }}
            exit={{ y: '120%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <a className="lp-btn ghost" {...linkProps('/login')}>
              Sign in
            </a>
            <a className="lp-btn primary" {...linkProps('/signup')}>
              Create free account <ArrowRight size={17} strokeWidth={2.4} />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------- Hero ---------------- */

const heroText: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease } },
}

function Hero({ scroller, ctaRef, signedIn }: { scroller: RefObject<HTMLDivElement | null>; ctaRef: RefObject<HTMLDivElement | null>; signedIn: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ container: scroller, target: ref, offset: ['start start', 'end start'] })
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 90])
  const phoneTilt = useTransform(scrollYProgress, [0, 1], [8, 0])
  const floatA = useTransform(scrollYProgress, [0, 1], [0, -70])
  const floatB = useTransform(scrollYProgress, [0, 1], [0, -30])

  return (
    <section className="lp-hero" id="top" ref={ref}>
      <div className="lp-hero-bg" aria-hidden>
        <div className="lp-blob a" />
        <div className="lp-blob b" />
        <div className="lp-grid" />
      </div>
      <div className="lp-container lp-hero-inner">
        <motion.div className="lp-hero-copy" variants={heroText} initial="hidden" animate="show">
          <motion.button className="lp-pill" variants={rise} onClick={() => document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })}>
            <span className="lp-pill-new">New</span>
            Explore by mood
            <ArrowRight size={14} strokeWidth={2.4} />
          </motion.button>
          <motion.h1 className="display" variants={rise}>
            Every place you love, <em>on&nbsp;one&nbsp;map.</em>
          </motion.h1>
          <motion.p className="lp-lede" variants={rise}>
            Wander remembers the cafés, parks and corners you keep going back to, finds somewhere new when you’re bored, and plans the
            walk there around sunset and the weather.
          </motion.p>
          <motion.div className="lp-hero-cta" variants={rise} ref={ctaRef}>
            {signedIn ? (
              <MagneticLink className="lp-btn primary" to="/app">
                Open Wander <ArrowRight size={18} strokeWidth={2.4} />
              </MagneticLink>
            ) : (
              <>
                <MagneticLink className="lp-btn primary" to="/signup">
                  Create free account <ArrowRight size={18} strokeWidth={2.4} />
                </MagneticLink>
                <a className="lp-btn secondary" {...linkProps('/login')}>
                  Sign in
                </a>
              </>
            )}
          </motion.div>
          <motion.ul className="lp-trust" variants={rise}>
            <li>
              <Check size={14} strokeWidth={3} /> Free, no ads
            </li>
            <li>
              <Check size={14} strokeWidth={3} /> Works offline
            </li>
            <li>
              <Check size={14} strokeWidth={3} /> Encrypted sync
            </li>
          </motion.ul>
        </motion.div>

        <div className="lp-hero-visual">
          {/* Soft circular stage the phone sits on: rings like a map's distance circles. */}
          <motion.div
            className="lp-stage"
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease, delay: 0.1 }}
          />
          <div className="lp-device">
          <motion.div
            className="lp-phone"
            style={{ y: phoneY, rotateX: phoneTilt, transformPerspective: 1400 }}
            initial={{ opacity: 0, y: 70, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.1, ease, delay: 0.25 }}
          >
            <div className="lp-phone-notch" />
            <div className="lp-phone-screen">
              <HeroMap />
            </div>
          </motion.div>

          <motion.div className="lp-float a" style={{ y: floatA }} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease, delay: 1.1 }}>
            <span className="lp-float-icon" style={{ background: '#7357F6' }}>
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Local legend</strong>
              <small>10 visits to Brunetti</small>
            </div>
          </motion.div>
          <motion.div className="lp-float b" style={{ y: floatB }} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease, delay: 1.3 }}>
            <span className="lp-float-icon" style={{ background: '#f2542d' }}>
              <Flame size={15} />
            </span>
            <div>
              <strong>
                <CountUp value={6} /> week streak
              </strong>
              <small>somewhere new, every week</small>
            </div>
          </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Primary link-button that leans gently toward the cursor (mouse only). */
function MagneticLink({ children, className, to }: { children: ReactNode; className: string; to: '/signup' | '/app' }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const x = useSpring(0, { stiffness: 300, damping: 20 })
  const y = useSpring(0, { stiffness: 300, damping: 20 })
  return (
    <motion.a
      ref={ref}
      className={className}
      style={{ x, y }}
      whileTap={{ scale: 0.97 }}
      {...linkProps(to)}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * 0.16)
        y.set((e.clientY - r.top - r.height / 2) * 0.28)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.a>
  )
}

/* ---------------- Marquee ---------------- */

const MARQUEE: [LucideIcon, string][] = [
  [MapPin, 'One-tap check-ins'],
  [Compass, 'Explore by mood'],
  [Sparkles, 'Places that level up'],
  [Navigation, 'Walk planner'],
  [Sunset, 'Sunset-aware timing'],
  [CloudFog, 'Explored %'],
  [Gift, 'Wander Wrapped'],
  [BookOpen, 'Notes & photos'],
  [WifiOff, 'Offline first'],
  [Lock, 'Encrypted sync'],
]

function Marquee() {
  const row = MARQUEE.map(([Icon, text]) => (
    <span key={text} className="lp-marquee-item">
      <Icon size={16} strokeWidth={2.2} />
      {text}
    </span>
  ))
  return (
    <div className="lp-marquee" aria-hidden>
      <div className="lp-marquee-track">
        {row}
        {row}
      </div>
    </div>
  )
}

/* ---------------- Shared ---------------- */

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <Reveal className="lp-head">
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2 className="display">{title}</h2>
      {children && <p>{children}</p>}
    </Reveal>
  )
}

/* ---------------- Features ---------------- */

/** Card that tilts toward the pointer and lights up where you hover (mouse only). */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const rx = useSpring(0, { stiffness: 220, damping: 22 })
  const ry = useSpring(0, { stiffness: 220, damping: 22 })
  return (
    <motion.article
      ref={ref}
      className={`lp-card ${className}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width
        const py = (e.clientY - r.top) / r.height
        ry.set((px - 0.5) * 5)
        rx.set((0.5 - py) * 5)
        ref.current.style.setProperty('--mx', `${px * 100}%`)
        ref.current.style.setProperty('--my', `${py * 100}%`)
      }}
      onPointerLeave={() => {
        rx.set(0)
        ry.set(0)
      }}
    >
      {children}
    </motion.article>
  )
}

function CardText({ icon: Icon, color, title, children }: { icon: LucideIcon; color: string; title: string; children: ReactNode }) {
  return (
    <div className="lp-card-text">
      <span className="lp-card-icon" style={{ background: color }}>
        <Icon size={17} strokeWidth={2.3} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

const FEATURE_CARDS: { key: string; span: string; icon: LucideIcon; color: string; title: string; body: string; demo: () => ReactNode }[] = [
  {
    key: 'checkin',
    span: 'span-4',
    icon: MapPin,
    color: '#f2542d',
    title: 'Check in with one tap',
    body: 'Wander suggests the café, park or bar you’re actually standing in. Open the app at a saved place and it asks “You’re at…?”',
    demo: () => <CheckInDemo />,
  },
  {
    key: 'levels',
    span: 'span-2',
    icon: Sparkles,
    color: '#7357F6',
    title: 'Places level up',
    body: 'Two visits makes a Favourite. Ten makes you a Local legend.',
    demo: () => <LevelsDemo />,
  },
  {
    key: 'walk',
    span: 'span-3',
    icon: Navigation,
    color: '#2f7bf6',
    title: 'Walks that know what’s open',
    body: 'Cafés along your route, greyed out if they’ll be shut by the time you walk past.',
    demo: () => <RouteDemo />,
  },
  {
    key: 'timing',
    span: 'span-3',
    icon: Sun,
    color: '#F29D0C',
    title: 'Leave at the right moment',
    body: 'Leave now, leave at, or arrive by. Lined up with sunset and the hourly forecast.',
    demo: () => <WeatherDemo />,
  },
  {
    key: 'fog',
    span: 'span-2',
    icon: CloudFog,
    color: '#5b6b7d',
    title: 'Clear the fog',
    body: 'Your neighbourhood starts misty and clears as you explore it.',
    demo: () => <FogDemo />,
  },
  {
    key: 'heat',
    span: 'span-2',
    icon: Flame,
    color: '#E8457A',
    title: 'Your heatmap',
    body: 'See where you really spend your time, week by week.',
    demo: () => <HeatDemo />,
  },
  {
    key: 'journal',
    span: 'span-2',
    icon: BookOpen,
    color: '#12A187',
    title: 'A journal with memories',
    body: 'Every visit, with a note and photos, grouped by week, month and year.',
    demo: () => <JournalDemo />,
  },
  {
    key: 'wrapped',
    span: 'span-3',
    icon: Gift,
    color: '#6247e6',
    title: 'Wander Wrapped',
    body: 'Your month and year in places: new spots, new suburbs, your top café and a weekly streak.',
    demo: () => <WrappedDemo />,
  },
  {
    key: 'install',
    span: 'span-3',
    icon: Smartphone,
    color: '#14120f',
    title: 'Installs like an app',
    body: 'Add it to your iPhone home screen. Full screen, works offline, syncs with your laptop.',
    demo: () => (
      <div className="lp-mini-badges">
        <span>
          <WifiOff size={14} /> Offline
        </span>
        <span>
          <Database size={14} /> Backups
        </span>
        <span>
          <Lock size={14} /> Encrypted sync
        </span>
      </div>
    ),
  },
]

function Features() {
  const rail = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const onScroll = () => {
    const el = rail.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    if (!card) return
    setActive(Math.round(el.scrollLeft / (card.offsetWidth + 14)))
  }
  const go = (i: number) => {
    const el = rail.current
    const card = el?.children[i] as HTMLElement | undefined
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 16, behavior: 'smooth' })
  }

  return (
    <section className="lp-section" id="features">
      <div className="lp-container">
        <SectionHead eyebrow="Features" title={<>Built for the way you <em>actually</em> explore.</>}>
          No feeds, no reviews, no strangers. Just your places, your walks and your city, getting richer every time you step out.
        </SectionHead>
      </div>
      <Reveal>
        <div className="lp-container lp-bento-wrap">
          <div className="lp-bento" ref={rail} onScroll={onScroll}>
            {FEATURE_CARDS.map((f) => (
              <Card key={f.key} className={f.span}>
                <CardText icon={f.icon} color={f.color} title={f.title}>
                  {f.body}
                </CardText>
                {f.demo()}
              </Card>
            ))}
          </div>
          <div className="lp-dots" role="tablist" aria-label="Features">
            {FEATURE_CARDS.map((f, i) => (
              <button key={f.key} role="tab" aria-selected={i === active} aria-label={f.title} onClick={() => go(i)}>
                {i === active && <motion.span layoutId="lp-dot" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              </button>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function CheckInDemo() {
  const items: [LucideIcon, string, string, string][] = [
    [Coffee, 'Market Lane Coffee', '12 m', '#F29D0C'],
    [Utensils, 'Tipo 00', '38 m', '#E8457A'],
    [Trees, 'Flagstaff Gardens', '120 m', '#12A187'],
  ]
  return (
    <div className="lp-demo checkin">
      {items.map(([Icon, name, dist, color], i) => (
        <motion.div
          key={name}
          className={`lp-row ${i === 0 ? 'active' : ''}`}
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease, delay: 0.2 + i * 0.1 }}
        >
          <span className="lp-row-icon" style={{ background: color }}>
            <Icon size={14} strokeWidth={2.5} />
          </span>
          <span className="lp-row-name">{name}</span>
          <span className="lp-row-meta">{dist}</span>
          {i === 0 && (
            <motion.span
              className="lp-row-cta"
              initial={{ scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.7 }}
            >
              Check in
            </motion.span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

const LEVELS = [
  ['Visited', '#12A187', 1],
  ['Favourite', '#F29D0C', 2],
  ['Regular', '#E8457A', 5],
  ['Local legend', '#7357F6', 10],
] as const

function LevelsDemo() {
  return (
    <div className="lp-demo levels">
      {LEVELS.map(([label, color, n], i) => (
        <div key={label} className="lp-level">
          <span className="lp-level-name">
            <i style={{ background: color }} />
            {label}
          </span>
          <span className="lp-level-bar">
            <motion.span
              style={{ background: color }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: n / 10 }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease, delay: 0.2 + i * 0.12 }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

function RouteDemo() {
  const d = 'M20 110 C 80 110, 90 40, 150 50 S 230 100, 300 30'
  const stops = [
    { x: 92, y: 74, open: true, label: 'Open till 4' },
    { x: 196, y: 70, open: true, label: '+3 min' },
    { x: 262, y: 52, open: false, label: 'Closed' },
  ]
  return (
    <div className="lp-demo route">
      <svg viewBox="0 0 320 140" aria-hidden>
        <path d={d} fill="none" stroke="var(--hairline)" strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={d}
          fill="none"
          stroke="#2f7bf6"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.2 }}
        />
        <circle cx="20" cy="110" r="7" fill="#2f7bf6" stroke="#fff" strokeWidth="3" />
        <circle cx="300" cy="30" r="8" fill="#f2542d" stroke="#fff" strokeWidth="3" />
      </svg>
      {stops.map((s, i) => (
        <motion.span
          key={i}
          className={`lp-stop ${s.open ? '' : 'closed'}`}
          style={{ left: `${(s.x / 320) * 100}%`, top: `${(s.y / 140) * 100}%` }}
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.8 + i * 0.25 }}
        >
          <Coffee size={11} strokeWidth={2.6} />
          <em>{s.label}</em>
        </motion.span>
      ))}
    </div>
  )
}

function WeatherDemo() {
  const hours = [
    ['3pm', 22, 'sun'],
    ['4pm', 21, 'sun'],
    ['5pm', 19, 'sun'],
    ['6pm', 17, 'sunset'],
    ['7pm', 15, 'moon'],
  ] as const
  return (
    <div className="lp-demo weather">
      {hours.map(([h, t, kind], i) => (
        <motion.div
          key={h}
          className={`lp-hour ${i === 2 ? 'pick' : ''}`}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease, delay: 0.15 + i * 0.07 }}
        >
          <small>{h}</small>
          {kind === 'sunset' ? <Sunset size={18} /> : kind === 'moon' ? <span className="lp-moon" /> : <Sun size={18} />}
          <strong>{t}°</strong>
        </motion.div>
      ))}
      <motion.span className="lp-leave" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.8 }}>
        Leave by 5:40 to catch the sunset
      </motion.span>
    </div>
  )
}

/** Deterministic pseudo-random 0–1, so demos look organic but never jump between renders. */
const noise = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1

function HeatDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const cells = Array.from({ length: 40 }, (_, i) => {
    const cx = (i % 8) - 3.5
    const cy = Math.floor(i / 8) - 2
    const center = Math.max(0, 1 - Math.hypot(cx, cy) / 4.2)
    return Math.min(1, center * 0.9 + noise(i) * 0.35)
  })
  return (
    <div className="lp-demo heat" ref={ref}>
      {cells.map((v, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={inView ? { opacity: 0.15 + v * 0.85, scale: 1 } : {}}
          transition={{ duration: 0.5, ease, delay: 0.1 + (i % 8) * 0.03 + Math.floor(i / 8) * 0.05 }}
          style={{ background: v > 0.66 ? '#f2542d' : v > 0.4 ? '#f9905f' : '#fcd2bd' }}
        />
      ))}
    </div>
  )
}

/** Hexes of mist that clear along a path, with a counting percentage. */
function FogDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const cols = 9
  const rows = 5
  const cleared = new Set([3, 4, 12, 13, 14, 21, 22, 23, 24, 30, 31, 40, 41, 15, 5])
  return (
    <div className="lp-demo fog" ref={ref}>
      <div className="lp-hexes" style={{ '--cols': cols } as CSSProperties}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const clear = cleared.has(i)
          return (
            <motion.span
              key={i}
              className={`lp-hex ${Math.floor(i / cols) % 2 ? 'odd' : ''}`}
              initial={{ opacity: 0.9 }}
              animate={inView && clear ? { opacity: 0, scale: 0.6 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + [...cleared].indexOf(i) * 0.08 }}
            />
          )
        })}
      </div>
      <span className="lp-fog-pct">
        <strong className="display">
          {inView ? <CountUp value={33} /> : 0}%
        </strong>{' '}
        of Carlton explored
      </span>
    </div>
  )
}

function JournalDemo() {
  const [period, setPeriod] = useState(1)
  const data = [
    [6, 3],
    [23, 11],
    [184, 62],
  ]
  return (
    <div className="lp-demo journal">
      <div className="lp-seg">
        {['Week', 'Month', 'Year'].map((p, i) => (
          <button key={p} onClick={() => setPeriod(i)} aria-pressed={period === i}>
            {period === i && <motion.span layoutId="lp-seg" className="lp-seg-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span>{p}</span>
          </button>
        ))}
      </div>
      <div className="lp-stats">
        <div>
          <strong>
            <CountUp value={data[period][0]} />
          </strong>
          <small>check-ins</small>
        </div>
        <div>
          <strong>
            <CountUp value={data[period][1]} />
          </strong>
          <small>new places</small>
        </div>
      </div>
      <p className="lp-memo">“Got the pistachio croissant. Worth the queue.”</p>
    </div>
  )
}

function WrappedDemo() {
  return (
    <div className="lp-demo wrapped">
      <div className="lp-wrapped-hero">
        <span className="lp-wrapped-glow" aria-hidden />
        <strong className="display">
          <CountUp value={14} />
        </strong>
        <span>new places in October</span>
      </div>
      <div className="lp-wrapped-bars" aria-hidden>
        {[3, 5, 2, 6, 4, 9, 7].map((n, i) => (
          <span key={i}>
            <motion.i initial={{ scaleY: 0 }} whileInView={{ scaleY: n / 9 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.05, type: 'spring', stiffness: 260, damping: 22 }} />
            <b>{'MTWTFSS'[i]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Explore spotlight ---------------- */

const MOODS: { key: string; label: string; icon: LucideIcon; color: string; pick: { name: string; kind: string; reason: string; facts: string[] } }[] = [
  {
    key: 'new',
    label: 'Somewhere new',
    icon: Compass,
    color: '#2F7BF6',
    pick: { name: 'Ngarara Place', kind: 'Garden', reason: 'A garden in a part of town you rarely go.', facts: ['Never been', '7 min walk', 'Clear, 18°'] },
  },
  {
    key: 'food',
    label: 'New food',
    icon: UtensilsCrossed,
    color: '#E8457A',
    pick: { name: 'Nefes', kind: 'Turkish restaurant', reason: 'A Turkish place you’ve never eaten at.', facts: ['Never been', '3 min walk', 'Open till 11'] },
  },
  {
    key: 'coffee',
    label: 'Coffee break',
    icon: Coffee,
    color: '#B5651D',
    pick: { name: 'Market Lane', kind: 'Café', reason: 'The closest café that’s still open.', facts: ['Been 3×', '2 min walk', 'Closes 4:00'] },
  },
  {
    key: 'sunset',
    label: 'Sunset spot',
    icon: Sunset,
    color: '#F2542D',
    pick: { name: 'Princes Pier', kind: 'Pier', reason: 'Get there before the sun goes down at 7:42.', facts: ['Never been', '24 min walk', 'Sunset 7:42'] },
  },
  {
    key: 'stroll',
    label: 'Stroll',
    icon: Footprints,
    color: '#12A187',
    pick: { name: '4.2 km loop', kind: 'Starts and ends here', reason: 'Through two parks you haven’t walked yet.', facts: ['54 min', 'Back by 6:10', 'Clear skies'] },
  },
  {
    key: 'hike',
    label: 'Hike',
    icon: Mountain,
    color: '#5B7F3A',
    pick: { name: 'Dandenong Ranges', kind: 'National park', reason: 'A proper day outside, with tall forest.', facts: ['Never been', '38 km away', 'Directions'] },
  },
  {
    key: 'surprise',
    label: 'Surprise me',
    icon: Wand2,
    color: '#7357F6',
    pick: { name: 'Abbotsford Convent', kind: 'Arts centre', reason: 'Gardens, galleries and a bakery, all new to you.', facts: ['Never been', '2.8 km away', 'Open till 5'] },
  },
]

function ExploreSpotlight() {
  const [mood, setMood] = useState(0)
  const [auto, setAuto] = useState(true)
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { margin: '-20%' })

  // Gently cycle through moods until someone taps one.
  useEffect(() => {
    if (!auto || !inView) return
    const t = setInterval(() => setMood((m) => (m + 1) % MOODS.length), 2800)
    return () => clearInterval(t)
  }, [auto, inView])

  const m = MOODS[mood]
  return (
    <section className="lp-section alt" id="explore" ref={ref}>
      <div className="lp-container lp-explore">
        <div className="lp-explore-copy">
          <SectionHead eyebrow="New · Explore" title={<>What do you <em>feel like?</em></>}>
            Pick a mood and Wander finds three to five real places nearby, ranked by what’s new to you, what’s open when you’d arrive, the
            weather and time to sunset. Each week it saves a few spots near you, a suburb for the month and a day trip for the year.
          </SectionHead>
          <div className="lp-moods" role="tablist" aria-label="Moods">
            {MOODS.map((x, i) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={i === mood}
                className={`lp-mood ${i === mood ? 'on' : ''}`}
                style={{ '--c': x.color } as CSSProperties}
                onClick={() => {
                  setAuto(false)
                  setMood(i)
                }}
              >
                <x.icon size={16} strokeWidth={2.3} />
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="lp-explore-demo" style={{ '--c': m.color } as CSSProperties}>
          <div className="lp-explore-glow" aria-hidden />
          <AnimatePresence mode="wait">
            <motion.div
              key={m.key}
              className="lp-pick"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.45, ease }}
            >
              <div className="lp-pick-head">
                <span className="lp-pick-icon">
                  <m.icon size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <strong>{m.pick.name}</strong>
                  <small>{m.pick.kind}</small>
                </div>
              </div>
              <p className="lp-pick-reason">{m.pick.reason}</p>
              <div className="lp-pick-facts">
                {m.pick.facts.map((f, i) => (
                  <motion.span key={f} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }} className={i === 0 && f === 'Never been' ? 'new' : ''}>
                    {f}
                  </motion.span>
                ))}
              </div>
              <div className="lp-pick-actions">
                <span>Want to go</span>
                <span className="primary">
                  <Footprints size={14} /> Walk there
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
          <p className="lp-explore-note">
            <Sparkles size={13} /> Optional AI writes the reasons. It only ranks real places, so it can’t invent one.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------- How it works ---------------- */

const STEPS: [LucideIcon, string, string][] = [
  [Smartphone, 'Add it to your home screen', 'Open Wander in Safari, tap Share, then Add to Home Screen. No App Store needed.'],
  [MapPinned, 'Check in as you go', 'One tap when you arrive. Wander does the remembering, counting and levelling up.'],
  [Compass, 'Go somewhere new', 'Ask Explore when you’re bored. Watch the fog clear and your streak grow.'],
]

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })
  return (
    <section className="lp-section" id="how">
      <div className="lp-container">
        <SectionHead eyebrow="How it works" title={<>Three steps to a city that feels <em>yours</em>.</>} />
        <div className="lp-steps" ref={ref}>
          <motion.span className="lp-steps-line" initial={{ scaleX: 0, scaleY: 0 }} animate={inView ? { scaleX: 1, scaleY: 1 } : {}} transition={{ duration: 1.4, ease, delay: 0.3 }} aria-hidden />
          {STEPS.map(([Icon, title, body], i) => (
            <motion.div key={title} className="lp-step" initial={{ opacity: 0, y: 26 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, ease, delay: 0.2 + i * 0.2 }}>
              <span className="lp-step-num">
                <Icon size={20} strokeWidth={2.2} />
                <em>{i + 1}</em>
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Privacy ---------------- */

const SECURITY: [LucideIcon, string, string][] = [
  [Lock, 'Encrypted before upload', 'Every synced place, visit and walk is sealed with AES-256-GCM on your device. The server only stores ciphertext.'],
  [KeyRound, 'A key for each person', 'Each account gets its own key, derived from a secret held in an encrypted vault, never in the data table.'],
  [Database, 'Locked-down rows', 'Row-level security means every query only ever sees the signed-in person’s own records.'],
  [Fingerprint, 'Passwords done properly', 'Hashed with bcrypt, strength-checked, and screened against known breaches without the password leaving your device.'],
]

const PLAIN = '{ "place": "Market Lane Coffee", "visits": 7 }'
const GLYPHS = 'abcdef0123456789ABCDEF+/='

/** Text that scrambles from readable JSON into ciphertext and back. */
function CipherText() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-80px' })
  const [text, setText] = useState(PLAIN)
  useEffect(() => {
    if (!inView || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let raf = 0
    let encrypted = false
    let pause = 40
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (pause > 0) {
        pause--
        return
      }
      frame++
      const k = Math.min(PLAIN.length, frame * 1.4)
      setText(
        [...PLAIN]
          .map((c, i) => {
            const flipped = encrypted ? i >= k : i < k
            if (c === ' ' && !flipped) return ' '
            return flipped ? GLYPHS[(i * 7 + frame * 3) % GLYPHS.length] : c
          })
          .join(''),
      )
      if (k >= PLAIN.length) {
        encrypted = !encrypted
        frame = 0
        pause = 110
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView])
  return (
    <div className="lp-cipher" ref={ref}>
      <div className="lp-cipher-bar">
        <span />
        <span />
        <span />
        <em>what the server sees</em>
      </div>
      <code>{text}</code>
    </div>
  )
}

function Privacy() {
  return (
    <section className="lp-section dark" id="privacy">
      <div className="lp-container lp-privacy">
        <div>
          <SectionHead eyebrow="Privacy" title={<>Your places are <em>nobody else’s</em> business.</>}>
            Turn on sync and your data is encrypted before it ever leaves your phone. Photos never leave it at all.
          </SectionHead>
          <Reveal delay={0.1}>
            <CipherText />
          </Reveal>
        </div>
        <div className="lp-sec-list">
          {SECURITY.map(([Icon, title, body], i) => (
            <Reveal key={title} className="lp-sec" delay={0.06 * i}>
              <span className="lp-sec-icon">
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- CTA ---------------- */

function FinalCta({ ctaRef, signedIn }: { ctaRef: RefObject<HTMLDivElement | null>; signedIn: boolean }) {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-cta">
          <div className="lp-cta-glow" aria-hidden />
          <AppIcon size={64} />
          <h2 className="display">
            Go somewhere <em>new</em> this week.
          </h2>
          <p>Free, private and ready in under a minute.</p>
          <div className="lp-hero-cta center" ref={ctaRef}>
            {signedIn ? (
              <button className="lp-btn light" onClick={() => navigate('/app')}>
                Open Wander <ArrowRight size={18} strokeWidth={2.4} />
              </button>
            ) : (
              <>
                <a className="lp-btn light" {...linkProps('/signup')}>
                  Create free account <ArrowRight size={18} strokeWidth={2.4} />
                </a>
                <a className="lp-btn outline-light" {...linkProps('/login')}>
                  Sign in
                </a>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
