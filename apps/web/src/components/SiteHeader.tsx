import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

export default function SiteHeader({
  links,
  children,
}: {
  links?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          PREDIXA
        </Link>
        <nav className="site-nav" aria-label="Main">
          {links}
          <NavLink
            to="/markets"
            className={({ isActive }) =>
              `site-nav-link${isActive ? " site-nav-link-active" : ""}`
            }
          >
            Markets
          </NavLink>
        </nav>
        <div className="site-header-end">{children}</div>
      </div>
    </header>
  );
}
