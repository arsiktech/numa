import { Link } from "react-router-dom";
import { ArrowRight, Lock, Wallet, Target, Layers } from "lucide-react";
import { BrandLockup, BrandOrbit } from "@/components/brand/BrandLockup";
import { NUMA_HEADLINE } from "@/lib/productPositioning";

const steps = [
  { title: "Small moments. Clear records.", body: "Add an expense or income with its amount, date, and category. Keep the details together, so your week makes sense.", icon: Wallet },
  { title: "Give your money a direction.", body: "Review weekly spending, set category budgets, and follow your savings goals. Make room for what matters to you.", icon: Target },
  { title: "Your whole picture, in one place.", body: "Bring accounts, holdings, assets, and debts into Capital. Start small and add the pieces as you need them.", icon: Layers }
];

/** Public promises describe the core product available without optional AI providers. */
export function LandingPage() {
  return (
    <div className="nm-site">
      <header className="nm-site-container">
        <nav aria-label="Public navigation" className="nm-site-nav">
          <Link to="/landing" aria-label="Numa Pro home"><BrandLockup /></Link>
          <Link to="/welcome" className="nm-site-link">Sign in <ArrowRight size={16} aria-hidden /></Link>
        </nav>
      </header>
      <main id="main-content" className="nm-site-container">
        <section aria-labelledby="landing-title" className="nm-site-hero">
          <div>
            <p className="nm-site-eyebrow">Your money, in perspective</p>
            <h1 id="landing-title">{NUMA_HEADLINE}<br />Make room<br />for <em>living.</em></h1>
            <p className="nm-site-intro">The everyday details. The bigger ambitions. Bring your spending, savings, and capital into a picture you can understand.</p>
            <div className="nm-site-actions">
              <Link to="/welcome" className="nm-site-cta">Get started <ArrowRight size={19} aria-hidden /></Link>
              <a href="#how-it-works" className="nm-site-link">Meet Numa Pro <ArrowRight size={15} className="rotate-90" aria-hidden /></a>
            </div>
            <p className="nm-site-note"><Lock size={14} aria-hidden /> No bank connection required.</p>
          </div>
          <figure className="nm-site-portfolio">
            <BrandOrbit />
            <figcaption>Example portfolio <span>Personal capital</span></figcaption>
            <p className="nm-site-portfolio-label">Net worth</p>
            <p className="nm-site-portfolio-value nm-num">€56,400</p>
            <p className="nm-site-portfolio-detail">What you own, minus what you owe.</p>
            <div className="nm-site-allocation" aria-hidden="true"><span /><span /></div>
            <dl>
              {[["Cash & savings", "€24,800"], ["Investments", "€43,600"], ["Debts", "−€12,000"]].map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd className="nm-num">{value}</dd></div>
              ))}
            </dl>
            <p className="nm-site-portfolio-disclaimer">Illustrative figures. Your portfolio starts with your own entries.</p>
          </figure>
        </section>
        <section id="how-it-works" aria-labelledby="how-title" className="nm-site-section">
          <p className="nm-site-eyebrow">A little clarity, every week</p>
          <h2 id="how-title">More perspective.<br />Less mental arithmetic.</h2>
          <ol className="nm-site-steps">
            {steps.map(({ title, body, icon: Icon }, index) => (
              <li key={title} className="nm-site-step">
                <p aria-hidden="true" className="nm-site-step-number">0{index + 1} /</p>
                <Icon size={42} aria-hidden="true" />
                <h3>{title}</h3><p>{body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="start-title" className="nm-site-finale">
          <div>
            <h2 id="start-title">Big picture.<br />One small first step.</h2>
            <p>Start with the money you know. Choose everyday spending or a fuller capital view, then make Numa Pro your own.</p>
          </div>
          <Link to="/welcome" className="nm-site-cta">Let’s begin <ArrowRight size={19} aria-hidden /></Link>
        </section>
      </main>
      <footer className="nm-site-container nm-site-footer">
        <BrandLockup size={32} />
        <p>© {new Date().getFullYear()} Numa Pro · Your money, in perspective.</p>
        <nav aria-label="Legal"><Link to="/privacy" className="nm-site-link">Privacy</Link><Link to="/terms" className="nm-site-link">Terms</Link></nav>
      </footer>
    </div>
  );
}
export default LandingPage;
