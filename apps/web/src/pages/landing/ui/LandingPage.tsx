import { animate, motion, useInView, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCameraStore } from '@/entities/camera'
import { APP_PATH, GITHUB_URL } from '@/shared/config'
import {
  BellIcon,
  CameraIcon,
  CheckIcon,
  EASE_OUT,
  LocateIcon,
  LogoMark,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  cn,
} from '@/shared/ui'
import { GitHubStarButton } from './GitHubStarButton'
import { HeroScene } from './HeroScene'
import { ArrowRightIcon, GitHubIcon } from './icons'

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
}
const stagger: Variants = { show: { transition: { staggerChildren: 0.09 } } }

/** Fades and lifts its children in once they scroll into view. */
function Reveal({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'ul' | 'section'
}) {
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </Tag>
  )
}

export function LandingPage() {
  const returning = useCameraStore((s) => s.cameras.length > 0)
  const appLabel = returning ? 'Open your cameras' : 'Open the app'

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <Backdrop />
      <Nav appLabel={returning ? 'Your cameras' : 'Open app'} />

      <main>
        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-32 lg:pt-24">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.a
              variants={rise}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1.5 pr-3 text-xs font-medium text-muted backdrop-blur transition hover:border-ink/30 hover:text-ink"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-free/15 px-2 py-0.5 text-free">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-free opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-free" />
                </span>
                Live in Spain
              </span>
              Open source · MIT
              <ArrowRightIcon width={12} height={12} />
            </motion.a>

            <motion.h1
              variants={rise}
              className="mt-6 text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl lg:text-[4.1rem]"
            >
              Find a <span className="text-free">free spot</span> before you get there.
            </motion.h1>
            <motion.p
              variants={rise}
              className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted"
            >
              Parking Vision watches public street cameras and marks free curb space in green, so
              you know where to park before you leave home.
            </motion.p>

            <motion.div variants={rise} className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={APP_PATH}
                className="group inline-flex h-14 items-center gap-2 rounded-full bg-ink px-7 text-base font-medium text-bg shadow-lg shadow-ink/15 transition hover:opacity-90"
              >
                {appLabel}
                <ArrowRightIcon
                  width={18}
                  height={18}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </a>
              <GitHubStarButton size="lg" />
            </motion.div>
            <motion.ul
              variants={rise}
              className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted"
            >
              {['No account needed', 'Your own AI key', 'Runs in your browser'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckIcon width={15} height={15} className="text-free" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <div className="mx-auto w-full max-w-xl lg:max-w-none">
            <HeroScene />
          </div>
        </section>

        <Stats />
        <HowItWorks />
        <Features />
        <OpenSource />
        <FinalCta label={appLabel} />
      </main>

      <Footer />
    </div>
  )
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px]">
      <div className="absolute left-1/2 top-[-220px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--free)_16%,transparent),transparent)]" />
      <div className="absolute right-[-200px] top-[120px] h-[460px] w-[620px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_12%,transparent),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  )
}

function Logo() {
  return (
    <a href="/" className="flex items-center gap-2.5 rounded-xl" aria-label="Parking Vision home">
      <LogoMark size={32} className="drop-shadow-[0_4px_10px_rgba(16,185,129,0.3)]" />
      <span className="whitespace-nowrap font-semibold tracking-tight">Parking Vision</span>
    </a>
  )
}

function Nav({ appLabel }: { appLabel: string }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-line/70 bg-bg/75 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Logo />
        <div className="ml-6 hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#how" className="transition hover:text-ink">
            How it works
          </a>
          <a href="#features" className="transition hover:text-ink">
            Features
          </a>
          <a href="#open-source" className="transition hover:text-ink">
            Open source
          </a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:block">
            <GitHubStarButton size="sm" label="Star" />
          </span>
          <a
            href={APP_PATH}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-medium text-bg transition hover:opacity-90"
          >
            {appLabel}
            <ArrowRightIcon width={14} height={14} />
          </a>
        </div>
      </nav>
    </header>
  )
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? to : 0)
  useEffect(() => {
    if (!inView || reduced) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: EASE_OUT,
      onUpdate: (v) => setValue(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, reduced, to])
  return (
    <span ref={ref} className="tabular-nums">
      {value.toLocaleString('en-US')}
      {suffix}
    </span>
  )
}

function Stats() {
  const stats: [ReactNode, string][] = [
    [<CountUp key="c" to={2500} suffix="+" />, 'live cameras'],
    [<CountUp key="s" to={4} />, 'open-data sources'],
    [<CountUp key="a" to={0} />, 'accounts to create'],
    [<CountUp key="m" to={100} suffix="%" />, 'open source'],
  ]
  return (
    <Reveal as="section" className="mx-auto max-w-6xl border-y border-line/80 px-5 sm:px-8">
      <dl className="grid grid-cols-2 divide-line/80 md:grid-cols-4 md:divide-x">
        {stats.map(([value, label]) => (
          <motion.div key={label} variants={rise} className="px-2 py-8 text-center md:py-10">
            <dt className="sr-only">{label}</dt>
            <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">{value}</dd>
            <dd className="mt-2 text-sm text-muted">{label}</dd>
          </motion.div>
        ))}
      </dl>
    </Reveal>
  )
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body?: string
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <motion.p
        variants={rise}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-free"
      >
        {eyebrow}
      </motion.p>
      <motion.h2
        variants={rise}
        className="mt-3 text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.1]"
      >
        {title}
      </motion.h2>
      {body && (
        <motion.p variants={rise} className="mt-4 text-pretty text-lg leading-8 text-muted">
          {body}
        </motion.p>
      )}
    </Reveal>
  )
}

function HowItWorks() {
  const steps = [
    {
      icon: <SearchIcon width={20} height={20} />,
      title: 'Pick a camera',
      body: 'Search a street or tap Near me. Vigo, Madrid, Málaga and road cameras across Spain, each with a live preview.',
    },
    {
      icon: <PencilIcon width={20} height={20} />,
      title: 'Draw the curb once',
      body: 'Trace where cars park. When a camera turns, every saved viewpoint is recognised and its curb lines follow.',
    },
    {
      icon: <BellIcon width={20} height={20} />,
      title: 'Know when it frees up',
      body: 'Gaps long enough for a car turn green. Turn on the bell and get an alert the moment a space opens.',
    },
  ]
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, then it watches for you."
        body="No sensors, no hardware. Just the public cameras your city already runs."
      />
      <Reveal as="ul" className="relative mt-16 grid gap-5 md:grid-cols-3">
        <div
          aria-hidden
          className="absolute left-[16%] right-[16%] top-[2.1rem] hidden h-px bg-gradient-to-r from-transparent via-line to-transparent md:block"
        />
        {steps.map((step, i) => (
          <motion.li
            key={step.title}
            variants={rise}
            className="relative rounded-3xl border border-line bg-surface/80 p-7 backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-free/12 text-free">
                {step.icon}
              </span>
              <span className="font-mono text-sm text-muted">0{i + 1}</span>
            </div>
            <h3 className="mt-6 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 leading-7 text-muted">{step.body}</p>
          </motion.li>
        ))}
      </Reveal>
    </section>
  )
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="m11 12 9-9m-3 0h3v3m-6 0 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function Features() {
  const features = [
    {
      icon: <LocateIcon width={20} height={20} />,
      title: 'Near me, anywhere in Spain',
      body: 'One search across 2,500+ city and road cameras. Share your location and the closest come first.',
      wide: true,
    },
    {
      icon: <KeyIcon />,
      title: 'Bring your own AI key',
      body: 'Detection runs on Replicate with your token. You only pay for the cameras you watch.',
    },
    {
      icon: <LockIcon />,
      title: 'Private by default',
      body: 'No accounts, no database. Cameras, zones and saved searches stay in your browser.',
    },
    {
      icon: <RefreshIcon width={20} height={20} />,
      title: 'Cameras that turn',
      body: 'Rotating cameras are matched to the right viewpoint every frame, small pans included.',
    },
    {
      icon: <CheckIcon width={20} height={20} />,
      title: 'Alerts that don’t cry wolf',
      body: 'A gap must stay free across two images before it turns green.',
    },
    {
      icon: <CameraIcon width={20} height={20} />,
      title: 'Any public camera',
      body: 'City not listed? Paste a direct image link from any public camera in the world.',
      wide: true,
    },
  ]
  return (
    <section
      id="features"
      className="scroll-mt-24 border-y border-line/70 bg-surface/40 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Small app. Sharp eyes."
          body="Everything you need to stop circling the block, nothing you don’t."
        />
        <Reveal as="ul" className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <motion.li
              key={f.title}
              variants={rise}
              className={cn(
                'group rounded-3xl border border-line bg-bg p-7 transition duration-300 hover:border-free/40',
                f.wide && 'lg:col-span-2',
              )}
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-ink transition duration-300 group-hover:bg-free group-hover:text-white">
                {f.icon}
              </span>
              <h3 className="mt-6 font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
            </motion.li>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

const SELF_HOST = `git clone ${GITHUB_URL}
cd parking-vision
docker compose up --build`

function OpenSource() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <section
      id="open-source"
      className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32"
    >
      <Reveal className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div variants={rise}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-free">Open source</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.1]">
            Built in the open. Yours to run.
          </h2>
          <p className="mt-4 text-pretty text-lg leading-8 text-muted">
            Parking Vision is MIT licensed. Self-host it in one command, add your city’s cameras, or
            send a pull request. A star helps more people find it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <GitHubStarButton size="lg" />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-14 items-center gap-2 rounded-full px-5 text-base font-medium text-muted transition hover:text-ink"
            >
              View the code <ArrowRightIcon width={16} height={16} />
            </a>
          </div>
        </motion.div>

        <motion.div
          variants={rise}
          className="overflow-hidden rounded-3xl border border-line bg-[#0b0f14] shadow-2xl shadow-black/20"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 flex items-center gap-1.5 text-xs text-white/50">
              <GitHubIcon width={12} height={12} /> elrincondeldev/parking-vision
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(SELF_HOST).then(() => setCopied(true))
              }}
              className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto p-6 font-mono text-[12px] leading-7 text-white/85 sm:text-[13px]">
            {SELF_HOST.split('\n').map((line) => (
              <div key={line}>
                <span className="select-none text-free">$ </span>
                {line}
              </div>
            ))}
            <div className="mt-2 text-white/45"># open http://localhost:8080</div>
          </pre>
        </motion.div>
      </Reveal>
    </section>
  )
}

function FinalCta({ label }: { label: string }) {
  return (
    <section className="px-5 pb-24 sm:px-8 sm:pb-32">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0f14] px-6 py-16 text-center text-white shadow-2xl shadow-black/20 sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--free)_45%,transparent),transparent)]"
        />
        <motion.h2
          variants={rise}
          className="relative mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-5xl sm:leading-[1.08]"
        >
          Your next parking spot is already on camera.
        </motion.h2>
        <motion.p variants={rise} className="relative mx-auto mt-4 max-w-md text-white/65">
          Free to use. No sign-up. Ready in under a minute.
        </motion.p>
        <motion.div variants={rise} className="relative mt-9 flex justify-center">
          <a
            href={APP_PATH}
            className="group inline-flex h-14 items-center gap-2 rounded-full bg-free px-8 text-base font-semibold text-white shadow-lg shadow-free/30 transition hover:brightness-110"
          >
            {label}
            <ArrowRightIcon
              width={18}
              height={18}
              className="transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </a>
        </motion.div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:px-8 md:flex-row md:items-center">
        <Logo />
        <p className="max-w-xl leading-6 md:ml-6">
          Camera images from Concello de Vigo, Ayuntamiento de Madrid, Ayuntamiento de Málaga and
          the DGT, via their open-data portals.
        </p>
        <div className="flex items-center gap-5 md:ml-auto">
          <a
            href={`${GITHUB_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink"
          >
            MIT License
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Parking Vision on GitHub"
            className="hover:text-ink"
          >
            <GitHubIcon width={18} height={18} />
          </a>
        </div>
      </div>
    </footer>
  )
}
