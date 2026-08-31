'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// Custom Typewriter Hook
function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let index = 0;
    let timer: NodeJS.Timeout;

    const delayTimer = setTimeout(() => {
      timer = setInterval(() => {
        if (index < text.length) {
          setDisplayed(text.slice(0, index + 1));
          index++;
        } else {
          setDone(true);
          clearInterval(timer);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(delayTimer);
      if (timer) clearInterval(timer);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPills, setShowPills] = useState(false);
  const [copied, setCopied] = useState(false);

  // Typewriter effect
  const fullText = "Glad you stopped in. Good taste tends to find us. Now, what are we building?";
  const { displayed, done } = useTypewriter(fullText, 38, 600);

  // Video scrubbing refs & state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prevXRef = useRef<number | null>(null);
  const targetTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);

  // Show pills after 400ms delay independently
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPills(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Handle Video Scrubbing via Mouse Movement
  const handleSeeked = useCallback(() => {
    isSeekingRef.current = false;
    if (videoRef.current) {
      const diff = Math.abs(videoRef.current.currentTime - targetTimeRef.current);
      if (diff > 0.05) {
        isSeekingRef.current = true;
        videoRef.current.currentTime = targetTimeRef.current;
      }
    }
  }, []);

  useEffect(() => {
    const SENSITIVITY = 0.8;

    const handleMouseMove = (e: MouseEvent) => {
      const video = videoRef.current;
      if (!video || !video.duration || isNaN(video.duration)) return;

      if (prevXRef.current === null) {
        prevXRef.current = e.clientX;
        return;
      }

      const delta = e.clientX - prevXRef.current;
      prevXRef.current = e.clientX;

      const duration = video.duration;
      const timeOffset = (delta / window.innerWidth) * SENSITIVITY * duration;
      let newTarget = targetTimeRef.current + timeOffset;
      newTarget = Math.max(0, Math.min(duration, newTarget));
      targetTimeRef.current = newTarget;

      if (!isSeekingRef.current) {
        isSeekingRef.current = true;
        video.currentTime = newTarget;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Copy email to clipboard
  const handleCopyEmail = () => {
    navigator.clipboard.writeText('hello@mainframe.co');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden text-black select-none" style={{ backgroundColor: '#e8e8e8' }}>
      {/* BEAKER VIDEO — positioned on the right side, blend mode hides video background */}
      <div 
        className="absolute right-0 top-0 w-[55%] md:w-[45%] h-full z-[1] pointer-events-none flex items-center justify-center overflow-hidden"
      >
        <video
          ref={videoRef}
          src="/Glass_beaker_rotating_on_pedestal_202608200027.mp4"
          muted
          playsInline
          preload="auto"
          onSeeked={handleSeeked}
          className="w-full h-full object-contain pointer-events-none"
          style={{ 
            objectPosition: 'center', 
            mixBlendMode: 'multiply',
          }}
        />
      </div>

      {/* NAVBAR (fixed, z-index: 10) */}
      <nav className="fixed top-0 left-0 right-0 z-10 px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
        {/* Logo (left) */}
        <div className="flex items-center gap-3">
          <span 
            className="text-[21px] sm:text-[26px] tracking-tight text-black font-heading"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Mainframe®
          </span>
          <span 
            className="text-[25px] sm:text-[30px] text-black select-none" 
            style={{ letterSpacing: '-0.02em' }}
          >
            ✳︎
          </span>
        </div>

        {/* Desktop nav links (center, hidden below md) */}
        <div className="hidden md:flex items-center text-[23px] text-black">
          <Link href="/survey" className="hover:opacity-60 transition-opacity">Labs</Link>
          <span className="mr-2">,</span>
          <a href="#studio" className="hover:opacity-60 transition-opacity">Studio</a>
          <span className="mr-2">,</span>
          <a href="#openings" className="hover:opacity-60 transition-opacity">Openings</a>
          <span className="mr-2">,</span>
          <a href="#shop" className="hover:opacity-60 transition-opacity">Shop</a>
        </div>

        {/* Desktop CTA (right, hidden below md) */}
        <div className="hidden md:block">
          <Link 
            href="/survey" 
            className="text-[23px] text-black underline underline-offset-2 hover:opacity-60 transition-opacity"
          >
            Get in touch
          </Link>
        </div>

        {/* Mobile hamburger (visible below md) */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden z-20 flex flex-col justify-center items-center w-8 h-8 gap-[5px] cursor-pointer"
          aria-label="Toggle menu"
        >
          <span 
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isMenuOpen ? 'rotate-45 translate-y-[7px]' : ''
            }`} 
          />
          <span 
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isMenuOpen ? 'opacity-0' : 'opacity-100'
            }`} 
          />
          <span 
            className={`w-6 h-[2px] bg-black transition-all duration-300 ${
              isMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''
            }`} 
          />
        </button>
      </nav>

      {/* Mobile Overlay Menu (z-index: 9) */}
      <div 
        className={`fixed inset-0 bg-white/95 backdrop-blur-sm z-[9] flex flex-col justify-center px-8 gap-8 transition-all duration-300 md:hidden ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <Link 
          href="/survey" 
          onClick={() => setIsMenuOpen(false)}
          className="text-[32px] font-medium text-black"
        >
          Labs
        </Link>
        <a 
          href="#studio" 
          onClick={() => setIsMenuOpen(false)}
          className="text-[32px] font-medium text-black"
        >
          Studio
        </a>
        <a 
          href="#openings" 
          onClick={() => setIsMenuOpen(false)}
          className="text-[32px] font-medium text-black"
        >
          Openings
        </a>
        <a 
          href="#shop" 
          onClick={() => setIsMenuOpen(false)}
          className="text-[32px] font-medium text-black"
        >
          Shop
        </a>
        <Link 
          href="/survey" 
          onClick={() => setIsMenuOpen(false)}
          className="text-[32px] font-medium text-black underline underline-offset-4 mt-4"
        >
          Get in touch
        </Link>
      </div>

      {/* HERO SECTION (z-index: 1) */}
      <section className="relative z-1 w-full h-screen flex flex-col justify-end pb-12 md:justify-center md:pb-0 px-5 sm:px-8 md:px-10 overflow-hidden">
        <div className="max-w-xl relative z-10">
          
          {/* 1. Blurred intro label */}
          <div 
            className="pointer-events-none select-none mb-5 sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: '#000',
              filter: 'blur(4px)',
            }}
          >
            Hey there, meet A.R.I.A,<br />
            Mainframe's Adaptive Response Interface Agent
          </div>

          {/* 2. Typewriter text */}
          <p 
            className="text-black mb-5 sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.35,
              fontWeight: 400,
              minHeight: '54px',
            }}
          >
            {displayed}
            {!done && (
              <span className="inline-block w-[2px] h-[1.1em] bg-black align-middle ml-[2px] animate-cursor-blink" />
            )}
          </p>

          {/* 3. Action pill buttons */}
          <div 
            className={`flex flex-wrap gap-y-1 transition-all duration-400 ${
              showPills ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            {/* White Pill 1 */}
            <Link 
              href="/survey" 
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              Pitch us an idea
            </Link>

            {/* White Pill 2 */}
            <a 
              href="#work" 
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              Come work here
            </a>

            {/* White Pill 3 */}
            <a 
              href="#hello" 
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              Send a brief hello
            </a>

            {/* White Pill 4 */}
            <a 
              href="#operate" 
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer"
            >
              See how we operate
            </a>

            {/* Outline Pill 5 (Copy Email) */}
            <button
              onClick={handleCopyEmail}
              className="inline-flex items-center justify-center text-white bg-transparent border border-white rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] gap-2 sm:gap-3 whitespace-nowrap hover:bg-white hover:text-black transition-colors duration-200 cursor-pointer relative"
              title="Click to copy email"
            >
              <span>
                Reach us: <span className="underline underline-offset-1">hello@mainframe.co</span>
              </span>
              
              {/* Copy Icon (12x12 SVG of two overlapping rectangles) */}
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
              >
                <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
                <rect x="1" y="1" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
              </svg>

              {copied && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] px-2 py-0.5 rounded shadow">
                  Copied!
                </span>
              )}
            </button>

          </div>

        </div>
      </section>
    </div>
  );
}
