import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

export default function Landing() {
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── Custom Cursor ──
  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring) return;

    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let outlineX = cursorX;
    let outlineY = cursorY;
    let animId: number;

    const onMouseMove = (e: MouseEvent) => {
      cursorX = e.clientX;
      cursorY = e.clientY;

      document.querySelectorAll(".interactive-card").forEach((card) => {
        const rect = card.getBoundingClientRect();
        (card as HTMLElement).style.setProperty(
          "--mouse-x",
          `${e.clientX - rect.left}px`
        );
        (card as HTMLElement).style.setProperty(
          "--mouse-y",
          `${e.clientY - rect.top}px`
        );
      });
    };

    const interactables = document.querySelectorAll(
      ".interactive, .interactive-card, .btn"
    );
    const onEnter = () =>
      ring.style.transform = "translate(-50%, -50%) scale(1.5)";
    const onLeave = () =>
      ring.style.transform = "translate(-50%, -50%) scale(1)";
    interactables.forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });

    const smoothCursor = () => {
      outlineX += (cursorX - outlineX) * 0.2;
      outlineY += (cursorY - outlineY) * 0.2;
      dot.style.left = `${cursorX}px`;
      dot.style.top = `${cursorY}px`;
      ring.style.left = `${outlineX}px`;
      ring.style.top = `${outlineY}px`;
      animId = requestAnimationFrame(smoothCursor);
    };

    window.addEventListener("mousemove", onMouseMove);
    animId = requestAnimationFrame(smoothCursor);

    // Hide cursor on touch devices
    const isTouch = "ontouchstart" in window;
    if (isTouch) {
      dot.style.display = "none";
      ring.style.display = "none";
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(animId);
      interactables.forEach((el) => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  // ── Data Loom Canvas ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width: number, height: number;
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;

    const nodes: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      type: number;
      matchedWith: number[];
    }[] = [];
    const numNodes = 150;
    let animId: number;

    function init() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;

      if (nodes.length === 0) {
        const count = window.innerWidth > 768 ? numNodes : 80;
        for (let i = 0; i < count; i++) {
          nodes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            type: Math.floor(Math.random() * 3),
            matchedWith: [],
          });
        }
      }
    }

    function animate() {
      animId = requestAnimationFrame(animate);
      ctx!.clearRect(0, 0, width, height);

      // Reset match states
      nodes.forEach((n) => {
        n.matchedWith = [];
      });

      // Physics and Matching
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];

        const dxMouse = cursorX - n1.x;
        const dyMouse = cursorY - n1.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

        if (distMouse < 250) {
          n1.vx += (dxMouse / distMouse) * 0.02;
          n1.vy += (dyMouse / distMouse) * 0.02;
        }

        n1.x += n1.vx;
        n1.y += n1.vy;
        n1.vx *= 0.98;
        n1.vy *= 0.98;

        if (n1.x < 0 || n1.x > width) n1.vx *= -1;
        if (n1.y < 0 || n1.y > height) n1.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 100 && n1.type !== n2.type) {
            n1.matchedWith.push(j);
            n2.matchedWith.push(i);

            ctx!.beginPath();
            ctx!.moveTo(n1.x, n1.y);
            ctx!.lineTo(n2.x, n2.y);

            if (distMouse < 250) {
              ctx!.strokeStyle = `rgba(16, 185, 129, ${1 - dist / 100})`;
              ctx!.lineWidth = 1.5;
            } else {
              ctx!.strokeStyle = `rgba(255, 255, 255, ${(1 - dist / 100) * 0.1})`;
              ctx!.lineWidth = 0.5;
            }
            ctx!.stroke();

            if (distMouse < 250) {
              n1.vx -= (dx / dist) * 0.05;
              n1.vy -= (dy / dist) * 0.05;
              n2.vx += (dx / dist) * 0.05;
              n2.vy += (dy / dist) * 0.05;
            }
          }
        }
      }

      // Draw Nodes
      nodes.forEach((n) => {
        ctx!.beginPath();

        const dxMouse = cursorX - n.x;
        const dyMouse = cursorY - n.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

        if (n.matchedWith.length >= 2 && distMouse < 250) {
          ctx!.arc(n.x, n.y, 4, 0, Math.PI * 2);
          ctx!.fillStyle = "#10B981";
          ctx!.shadowBlur = 15;
          ctx!.shadowColor = "#10B981";
        } else if (n.matchedWith.length === 1 && distMouse < 250) {
          ctx!.arc(n.x, n.y, 3, 0, Math.PI * 2);
          ctx!.fillStyle = "#06B6D4";
          ctx!.shadowBlur = 10;
          ctx!.shadowColor = "#06B6D4";
        } else {
          ctx!.arc(n.x, n.y, 2, 0, Math.PI * 2);
          const lightness = n.type === 0 ? 0.8 : n.type === 1 ? 0.5 : 0.3;
          ctx!.fillStyle = `rgba(255, 255, 255, ${lightness})`;
          ctx!.shadowBlur = 0;
        }

        ctx!.fill();
        ctx!.shadowBlur = 0;
      });
    }

    const onResize = () => {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
    };

    const onMouseMove = (e: MouseEvent) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    init();
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  // ── Hamburger Menu ──
  const toggleMenu = () => {
    const ham = hamburgerRef.current;
    const nav = navRef.current;
    if (!ham || !nav) return;
    ham.classList.toggle("active");
    nav.classList.toggle("open");
    document.body.classList.toggle("nav-open");
  };

  const closeMenu = () => {
    const ham = hamburgerRef.current;
    const nav = navRef.current;
    if (!ham || !nav) return;
    ham.classList.remove("active");
    nav.classList.remove("open");
    document.body.classList.remove("nav-open");
  };

  return (
    <div className="relative">
      {/* Custom Cursor */}
      <div ref={cursorDotRef} className="cursor-dot" />
      <div ref={cursorRingRef} className="cursor-ring" />

      {/* Canvas Data Loom */}
      <canvas ref={canvasRef} id="loom-canvas" />
      <div className="ambient-scanner" />

      <div className="relative z-10 mx-auto max-w-[1340px] px-8">
        {/* Navigation */}
        <nav className="landing-nav">
          <Link to="/" className="logo">
            <div className="logo-mark" />
            LEDGERPULSE
          </Link>
          <button
            ref={hamburgerRef}
            className="hamburger"
            onClick={toggleMenu}
            aria-label="Toggle navigation"
          >
            <span />
            <span />
            <span />
          </button>
          <div ref={navRef} className="nav-links">
            <a href="#engine" onClick={closeMenu}>
              The Engine
            </a>
            <a href="#infrastructure" onClick={closeMenu}>
              Infrastructure
            </a>
            <a href="#deploy" onClick={closeMenu}>
              Deploy
            </a>
          </div>
          <Link
            to="/login"
            className="btn btn-outline interactive"
          >
            Sign In
          </Link>
        </nav>

        {/* Hero */}
        <section className="hero-section">
          <div>
            <div className="hero-badge" style={{ fontFamily: "var(--font-mono)" }}>
              Status: Phases 0–4 Complete
            </div>
            <h1>
              Supply Chain <br />
              Reconciliation.
            </h1>
            <p>
              A production-ready SaaS boilerplate. Automate the painful process
              of 3-way matching invoices against physical delivery notes and
              government tax logs. Prevent overpayments instantly.
            </p>
            <div className="hero-actions" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <a href="#engine" className="btn btn-primary interactive">
                Explore The Engine
              </a>
              <a
                href="https://github.com/ravikumarve/LedgerPulse"
                className="btn btn-outline interactive"
              >
                View on GitHub
              </a>
            </div>
          </div>

          {/* Match HUD */}
          <div
            className="match-hud interactive-card"
            style={{ marginTop: "4rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "2rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--color-border-dim)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                }}
              >
                Transaction ID: INV-8824
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-emerald)",
                  background: "var(--color-emerald-dim)",
                  padding: "4px 10px",
                  borderRadius: "100px",
                  border: "1px solid rgba(16,185,129,0.3)",
                }}
              >
                MATCH VERIFIED
              </span>
            </div>

            <div className="hud-score">
              0.98 <span>/ 1.00</span>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                <span>INV ↔ DN (Quantity)</span>
                <span>99%</span>
              </div>
              <div className="hud-bar-track">
                <div className="hud-bar-fill" style={{ width: "99%" }} />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                <span>INV ↔ EWB (Tax/GSTIN)</span>
                <span>100%</span>
              </div>
              <div className="hud-bar-track">
                <div className="hud-bar-fill" style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                <span>DN ↔ EWB (Logistics)</span>
                <span>95%</span>
              </div>
              <div className="hud-bar-track">
                <div className="hud-bar-fill" style={{ width: "95%" }} />
              </div>
            </div>
          </div>
        </section>

        {/* Engine Section */}
        <section id="engine" style={{ padding: "10rem 0", borderBottom: "1px solid var(--color-border-dim)" }}>
          <div style={{ marginBottom: "6rem" }}>
            <h2 style={{ fontSize: "clamp(2.5rem, 4vw, 3.5rem)", marginBottom: "1.5rem", fontWeight: 500, letterSpacing: "-0.02em" }}>
              The 3-Way Match <br />
              Pipeline.
            </h2>
            <p style={{ fontSize: "1.15rem", color: "var(--color-muted)", maxWidth: "650px", lineHeight: "1.8" }}>
              Designed for manufacturers and logistics hubs operating across
              complex environments. LedgerPulse automates ingestion, parsing,
              and strict verification.
            </p>
          </div>

          <div className="bento-grid">
            {/* Ingestion */}
            <div className="bento-card col-8 interactive-card">
              <span className="bc-tag">Stage 01 // Ingestion &amp; OCR</span>
              <h3>Multi-Format Parsing</h3>
              <p>
                Accept invoices via IMAP, PDF upload, or manual entry. The
                Tesseract.js engine extracts line items, tax components, and
                totals from unstructured documents with extremely high accuracy.
              </p>
              <div className="code-ui" style={{ marginTop: "3rem" }}>
                {`{`}
                <br />
                &nbsp;&nbsp;
                <span className="code-key">"document_type"</span>:{" "}
                <span className="code-str">"TAX_INVOICE"</span>,<br />
                &nbsp;&nbsp;
                <span className="code-key">"extracted_totals"</span>: {`{`}
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;
                <span className="code-key">"subtotal"</span>:{" "}
                <span className="code-str">45000.00</span>,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;
                <span className="code-key">"igst"</span>:{" "}
                <span className="code-str">8100.00</span>
                <br />
                &nbsp;&nbsp;
                {`}`},<br />
                &nbsp;&nbsp;
                <span className="code-key">"confidence_score"</span>:{" "}
                <span className="code-str">0.96</span>
                <br />
                {`}`}
              </div>
            </div>

            {/* Compliance */}
            <div className="bento-card col-4 interactive-card">
              <span className="bc-tag alert">Alert System</span>
              <h3>Compliance Engine</h3>
              <p>
                Automatically flags price inflation, quantity mismatches,
                duplicate invoices, GSTIN mismatches, and expired E-Way Bills
                before payment is authorized.
              </p>
            </div>

            {/* Match Engine */}
            <div className="bento-card col-12 interactive-card">
              <span className="bc-tag">Stage 02 // The Core</span>
              <h3>Match Scoring Engine</h3>
              <p>
                Generates a composite 0.0–1.0 score across three dimensions:
                Invoice ↔ Delivery Note (50%), Invoice ↔ E-Way Bill (30%), and
                Delivery Note ↔ E-Way Bill (20%). Customizable tolerances allow
                for slight rounding differences without triggering false
                positives.
              </p>
            </div>
          </div>
        </section>

        {/* Infrastructure */}
        <section
          id="infrastructure"
          style={{
            padding: "10rem 0",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8rem",
            alignItems: "center",
            borderBottom: "1px solid var(--color-border-dim)",
          }}
          className="arch-section"
        >
          <div>
            <h2
              style={{
                fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
                marginBottom: "1.5rem",
                fontWeight: 500,
                letterSpacing: "-0.02em",
              }}
            >
              Enterprise <br />
              Infrastructure.
            </h2>
            <p
              style={{
                color: "var(--color-muted)",
                fontSize: "1.15rem",
                lineHeight: "1.8",
                marginBottom: "2rem",
              }}
            >
              LedgerPulse is a fully typed, end-to-end tested SaaS boilerplate.
              Security-hardened with Express, Helmet, rate limiting, and Zod
              validation.
            </p>

            <div className="metric-grid">
              <div className="metric-card">
                <div className="mc-val">41</div>
                <div className="mc-lbl">Integration Tests</div>
              </div>
              <div className="metric-card">
                <div className="mc-val">29+</div>
                <div className="mc-lbl">API Routes</div>
              </div>
              <div className="metric-card">
                <div className="mc-val">0</div>
                <div className="mc-lbl">TS Errors</div>
              </div>
              <div className="metric-card">
                <div className="mc-val" style={{ color: "var(--color-emerald)" }}>
                  100%
                </div>
                <div className="mc-lbl">Critical Paths Tested</div>
              </div>
            </div>
          </div>

          <div>
            <ul className="stack-list">
              <li>
                Frontend Client <span>React + Vite + Tailwind</span>
              </li>
              <li>
                Backend API <span>Node.js + Express + TS</span>
              </li>
              <li>
                Database <span>PostgreSQL via Prisma ORM</span>
              </li>
              <li>
                OCR Engine <span>Tesseract.js</span>
              </li>
              <li>
                Security <span>Zod + Helmet + JWT</span>
              </li>
              <li>
                Testing <span>Jest + Supertest</span>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section
          id="deploy"
          style={{ padding: "10rem 0", borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <div className="cta-band" style={{ margin: "0" }}>
            <h2>Ready for Production.</h2>
            <p>
              Zero-config SQLite for development, production-ready PostgreSQL
              via Prisma. Dockerized and ready to deploy to Railway or Fly.io.
            </p>
            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                justifyContent: "center",
                marginTop: "3rem",
                flexWrap: "wrap",
              }}
            >
              <a
                href="https://github.com/ravikumarve/LedgerPulse"
                className="btn btn-primary interactive"
              >
                Clone Repository
              </a>
              <Link to="/signup" className="btn btn-outline interactive">
                Get Started Free
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="f-brand">
            <Link to="/" className="logo">
              <div className="logo-mark" />
              LEDGERPULSE
            </Link>
            <p>
              Automated Supply Chain Reconciliation &amp; Tax Engine. 3-way
              matching SaaS boilerplate for enterprise logistics.
            </p>
          </div>

          <div className="f-links">
            <div className="f-col">
              <h5>Documentation</h5>
              <ul>
                <li>
                  <a
                    href="/docs/ARCHITECTURE.md"
                    className="interactive"
                  >
                    Architecture ADRs
                  </a>
                </li>
                <li>
                  <a href="/docs/API-SPEC.md" className="interactive">
                    API Specification
                  </a>
                </li>
                <li>
                  <a href="/docs/DATABASE.md" className="interactive">
                    Database Schema
                  </a>
                </li>
              </ul>
            </div>
            <div className="f-col">
              <h5>Security</h5>
              <ul>
                <li>
                  <a href="/docs/SECURITY.md" className="interactive">
                    Threat Model
                  </a>
                </li>
                <li>
                  <a href="/docs/ERROR-HANDLING.md" className="interactive">
                    Error Handling
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </div>

      <div className="f-bottom" style={{ maxWidth: "1340px", margin: "0 auto", paddingLeft: "2rem", paddingRight: "2rem" }}>
        <div>© 2026 LEDGERPULSE. MIT LICENSE.</div>
        <div>
          STATUS:{" "}
          <span style={{ color: "var(--color-emerald)" }}>
            BETA // MATCHING LIVE
          </span>
        </div>
      </div>
    </div>
  );
}
