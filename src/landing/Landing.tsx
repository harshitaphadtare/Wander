import {
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  Coffee,
  Database,
  Flame,
  Fingerprint,
  KeyRound,
  Lock,
  MapPin,
  MapPinned,
  Navigation,
  Smartphone,
  Sparkles,
  Sun,
  Sunset,
  Trees,
  Utensils,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import AuthPanel, { type AuthView } from '../auth/AuthPanel'
import { LogoMark } from '../ui/Logo'
import '../auth/auth.css'
import { CountUp } from '../ui/bits'
import HeroMap from './HeroMap'
import './landing.css'

const ease = [0.16, 1, 0.3, 1] as const
const YEAR = new Date().getFullYear()

interface Props {
  standalone: boolean
  onAuth(view: AuthView): void
  onGuest(): void
}

export default function Landing({ standalone, onAuth, onGuest }: Props) {
  // The installed app goes straight to sign-in; the website gets the full story.
  if (standalone) {
    return (
      <div className="auth-page">
        <div className="auth-page-glow" aria-hidden />
        <motion.div className="auth-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <AuthPanel onGuest={onGuest} />
        </motion.div>
      </div>
    )
  }
  return <Marketing onAuth={onAuth} onGuest={onGuest} />
}

function Marketing({ onAuth, onGuest }: Omit<Props, 'standalone'>) {
  const scroller = useRef<HTMLDivElement>(null)
  const { scrollY, scrollYProgress } = useScroll({ container: scroller })
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40 })

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="lp" ref={scroller}>
      <motion.div className="lp-progress" style={{ scaleX: progress }} />

      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <a className="lp-logo" href="#top" onClick={(e) => (e.preventDefault(), scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }))}>
            <span className="lp-logo-mark">
              <LogoMark size={18} />
            </span>
            <span className="display">Wander</span>
          </a>
          <nav className="lp-links" aria-label="Sections">
            <button onClick={() => jump('features')}>Features</button>
            <button onClick={() => jump('how')}>How it works</button>
            <button onClick={() => jump('privacy')}>Privacy</button>
          </nav>
          <div className="lp-nav-cta">
            <button className="lp-btn ghost" onClick={() => onAuth('signin')}>
              Sign in
            </button>
            <button className="lp-btn primary small" onClick={() => onAuth('signup')}>
              Get started
            </button>
          </div>
        </div>
      </header>

      <Hero scroller={scroller} onAuth={onAuth} onGuest={onGuest} />
      <Marquee />
      <Features />
      <HowItWorks />
      <Privacy />
      <FinalCta onAuth={onAuth} onGuest={onGuest} />

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <span className="lp-logo">
            <span className="lp-logo-mark">
              <LogoMark size={16} />
            </span>
            <span className="display">Wander</span>
          </span>
          <p>Map data © OpenStreetMap contributors · OpenFreeMap · Photon</p>
          <p>Made for wandering. © {YEAR}</p>
        </div>
      </footer>
    </div>
  )
}

/* ---------------- Hero ---------------- */

const heroText: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease } },
}

function Hero({ scroller, onAuth, onGuest }: { scroller: RefObject<HTMLDivElement | null> } & Omit<Props, 'standalone'>) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ container: scroller, target: ref, offset: ['start start', 'end start'] })
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const phoneRotate = useTransform(scrollYProgress, [0, 1], [0, -4])
  const floatA = useTransform(scrollYProgress, [0, 1], [0, -90])
  const floatB = useTransform(scrollYProgress, [0, 1], [0, -40])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  return (
    <section className="lp-hero" id="top" ref={ref}>
      <div className="lp-hero-bg" aria-hidden>
        <div className="lp-blob a" />
        <div className="lp-blob b" />
        <div className="lp-grid" />
      </div>
      <div className="lp-container lp-hero-inner">
        <motion.div className="lp-hero-copy" variants={heroText} initial="hidden" animate="show" style={{ opacity: fade }}>
          <motion.span className="lp-pill" variants={rise}>
            <span className="lp-pill-dot" />
            Your personal explore map
          </motion.span>
          <motion.h1 className="display" variants={rise}>
            Every place you love,
            <br />
            <em>on one map.</em>
          </motion.h1>
          <motion.p className="lp-lede" variants={rise}>
            Wander remembers the cafés, parks and corners of your city you keep coming back to, plans walks around sunset and the
            weather, and shows how far you’ve really explored.
          </motion.p>
          <motion.div className="lp-hero-cta" variants={rise}>
            <MagneticButton className="lp-btn primary" onClick={() => onAuth('signup')}>
              Get started, it’s free <ArrowRight size={18} strokeWidth={2.4} />
            </MagneticButton>
            <button className="lp-btn secondary" onClick={onGuest}>
              Try it without an account
            </button>
          </motion.div>
          <motion.ul className="lp-trust" variants={rise}>
            <li>
              <Check size={14} strokeWidth={3} /> No ads, ever
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
          <motion.div
            className="lp-phone"
            style={{ y: phoneY, rotate: phoneRotate }}
            initial={{ opacity: 0, y: 60, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 1.1, ease, delay: 0.2 }}
          >
            <div className="lp-phone-notch" />
            <div className="lp-phone-screen">
              <HeroMap />
            </div>
          </motion.div>

          <motion.div className="lp-float a" style={{ y: floatA }} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease, delay: 1.2 }}>
            <span className="lp-float-icon" style={{ background: '#7357F6' }}>
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Local legend</strong>
              <small>10 visits to Brunetti</small>
            </div>
          </motion.div>
          <motion.div className="lp-float b" style={{ y: floatB }} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease, delay: 1.45 }}>
            <span className="lp-float-icon" style={{ background: '#f2542d' }}>
              <Flame size={15} />
            </span>
            <div>
              <strong>
                <CountUp value={47} /> places
              </strong>
              <small>explored this month</small>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/** Primary button that leans gently toward the cursor. */
function MagneticButton({ children, className, onClick }: { children: ReactNode; className: string; onClick(): void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useSpring(0, { stiffness: 300, damping: 20 })
  const y = useSpring(0, { stiffness: 300, damping: 20 })
  return (
    <motion.button
      ref={ref}
      className={className}
      style={{ x, y }}
      whileTap={{ scale: 0.97 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * 0.18)
        y.set((e.clientY - r.top - r.height / 2) * 0.3)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}

/* ---------------- Marquee ---------------- */

const MARQUEE: [LucideIcon, string][] = [
  [MapPin, 'One-tap check-ins'],
  [Sparkles, 'Places that level up'],
  [Navigation, 'Walk planner'],
  [Sunset, 'Sunset-aware timing'],
  [Flame, 'Exploration heatmap'],
  [BookOpen, 'Journal'],
  [WifiOff, 'Offline first'],
  [Cloud, 'Phone ↔ laptop sync'],
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

/* ---------------- Features ---------------- */

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
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

/** Card that tilts toward the pointer and lights up where you hover. */
function Card({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useSpring(0, { stiffness: 220, damping: 22 })
  const ry = useSpring(0, { stiffness: 220, damping: 22 })
  return (
    <motion.article
      ref={ref}
      className={`lp-card ${className}`}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, ease, delay }}
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

function Features() {
  return (
    <section className="lp-section" id="features">
      <div className="lp-container">
        <SectionHead eyebrow="Features" title={<>Built for the way you <em>actually</em> explore.</>}>
          No feeds, no reviews, no strangers. Just your places, your walks and your city, getting richer every time you step out.
        </SectionHead>

        <div className="lp-bento">
          <Card className="span-4">
            <CardText icon={MapPin} color="#f2542d" title="Check in with one tap">
              Wander looks at what’s around you and suggests the café, park or bar you’re actually standing in. Reopen the app at a
              saved place and it asks “You’re at…?”
            </CardText>
            <CheckInDemo />
          </Card>

          <Card className="span-2" delay={0.08}>
            <CardText icon={Sparkles} color="#7357F6" title="Places level up">
              Every visit counts. A second visit makes it a Favourite; ten makes you a Local legend.
            </CardText>
            <LevelsDemo />
          </Card>

          <Card className="span-3" delay={0.04}>
            <CardText icon={Navigation} color="#2f7bf6" title="A walk planner that knows what’s open">
              Get a walking route with the cafés and restaurants along the way, greyed out if they’ll be closed by the time you arrive.
            </CardText>
            <RouteDemo />
          </Card>

          <Card className="span-3" delay={0.12}>
            <CardText icon={Sun} color="#F29D0C" title="Leave at the right moment">
              Pick leave-now, leave-at or arrive-by. Wander lines your walk up with sunset and the hourly forecast.
            </CardText>
            <WeatherDemo />
          </Card>

          <Card className="span-2" delay={0.04}>
            <CardText icon={Flame} color="#E8457A" title="Your exploration heatmap">
              Watch the neighbourhoods you know glow, week by week.
            </CardText>
            <HeatDemo />
          </Card>

          <Card className="span-2" delay={0.1}>
            <CardText icon={BookOpen} color="#12A187" title="A journal that writes itself">
              Every check-in and walk, grouped by week, month and year.
            </CardText>
            <JournalDemo />
          </Card>

          <Card className="span-2" delay={0.16}>
            <CardText icon={Smartphone} color="#14120f" title="Installs like an app">
              Add it to your iPhone home screen. It opens full-screen and works offline.
            </CardText>
            <div className="lp-mini-badges">
              <span>
                <WifiOff size={14} /> Offline
              </span>
              <span>
                <Cloud size={14} /> Synced
              </span>
              <span>
                <Database size={14} /> Backups
              </span>
            </div>
          </Card>
        </div>
      </div>
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
          transition={{ duration: 0.6, ease, delay: 0.25 + i * 0.1 }}
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
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.8 }}
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
          <motion.i
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease, delay: 0.4 + i * 0.07 }}
            style={{ height: `${(t - 10) * 3}px` }}
          />
        </motion.div>
      ))}
      <motion.span
        className="lp-leave"
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.9 }}
      >
        Leave by 5:40 to catch the sunset
      </motion.span>
    </div>
  )
}

function HeatDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  // Deterministic pseudo-random intensities so the pattern looks organic.
  const cells = Array.from({ length: 48 }, (_, i) => {
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
    const cx = (i % 8) - 3.5
    const cy = Math.floor(i / 8) - 2.5
    const center = Math.max(0, 1 - Math.hypot(cx, cy) / 4.2)
    return Math.min(1, center * 0.9 + r * 0.35)
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
    </div>
  )
}

/* ---------------- How it works ---------------- */

const STEPS: [LucideIcon, string, string][] = [
  [Smartphone, 'Add it to your home screen', 'Open Wander in Safari, tap Share, then Add to Home Screen. No App Store needed.'],
  [MapPinned, 'Check in as you go', 'One tap when you arrive. Wander does the remembering, counting and levelling up.'],
  [Flame, 'Watch your map fill up', 'Favourites rise to the top, your heatmap spreads, and you’ll start seeing the gaps worth exploring.'],
]

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-120px' })
  return (
    <section className="lp-section alt" id="how">
      <div className="lp-container">
        <SectionHead eyebrow="How it works" title={<>Three steps to a city that feels <em>yours</em>.</>} />
        <div className="lp-steps" ref={ref}>
          <svg className="lp-steps-line" viewBox="0 0 1000 4" preserveAspectRatio="none" aria-hidden>
            <motion.line
              x1="0"
              y1="2"
              x2="1000"
              y2="2"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="6 8"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.3 }}
            />
          </svg>
          {STEPS.map(([Icon, title, body], i) => (
            <motion.div
              key={title}
              className="lp-step"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease, delay: 0.2 + i * 0.25 }}
            >
              <span className="lp-step-num">
                <Icon size={20} strokeWidth={2.2} />
                <em>{i + 1}</em>
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
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
  [KeyRound, 'A key for each person', 'Each account gets its own encryption key, derived from a secret held in an encrypted vault, never in the data table.'],
  [Database, 'Locked-down rows', 'Row-level security means every database query only ever sees the signed-in person’s own records.'],
  [Fingerprint, 'Passwords done properly', 'Hashed with bcrypt, strength-checked, and screened against known breaches without the password leaving your device.'],
]

const PLAIN = '{ "place": "Market Lane Coffee", "visits": 7 }'
const GLYPHS = 'abcdef0123456789ABCDEF+/='

/** Text that scrambles from readable JSON into ciphertext as it scrolls into view. */
function CipherText() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-80px' })
  const [text, setText] = useState(PLAIN)
  useEffect(() => {
    if (!inView) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let raf = 0
    let encrypted = false
    let pause = 0
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
    pause = 40
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView])
  return (
    <div className="lp-cipher" ref={ref}>
      <div className="lp-cipher-bar">
        <span />
        <span />
        <span />
        <em>records · what the server sees</em>
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
            Wander works fully on your device. Turn on sync and your data is encrypted before it ever leaves your phone.
          </SectionHead>
          <Reveal delay={0.1}>
            <CipherText />
          </Reveal>
        </div>
        <div className="lp-sec-list">
          {SECURITY.map(([Icon, title, body], i) => (
            <Reveal key={title} className="lp-sec" delay={0.08 * i}>
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

function FinalCta({ onAuth, onGuest }: Omit<Props, 'standalone'>) {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="lp-cta">
          <div className="lp-cta-glow" aria-hidden />
          <h2 className="display">
            Go somewhere <em>new</em> this week.
          </h2>
          <p>Free, private and ready in under a minute.</p>
          <div className="lp-hero-cta center">
            <MagneticButton className="lp-btn light" onClick={() => onAuth('signup')}>
              Create your account <ArrowRight size={18} strokeWidth={2.4} />
            </MagneticButton>
            <button className="lp-btn outline-light" onClick={onGuest}>
              Open the map
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
