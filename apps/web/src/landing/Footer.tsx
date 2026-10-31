import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="landing-container">
        <div className="site-footer-top">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            PREDIXA
          </Link>
          <nav className="site-nav" aria-label="Footer">
            <Link to="/markets" className="site-nav-link">
              Markets
            </Link>
            <Link to="/#how-it-works" className="site-nav-link">
              How it works
            </Link>
            <Link to="/#faq" className="site-nav-link">
              FAQ
            </Link>
          </nav>
        </div>
        <p className="site-footer-note">
          PREDIXA is a research project and can&apos;t yet reliably predict stocks.
          Nothing on this site is financial advice. Prices and forecasts may be
          delayed, incomplete or wrong.
        </p>
        <p className="site-footer-note">© 2026 Predixa. Senior Design Project.</p>
      </div>
    </footer>
  );
}

export default Footer;
