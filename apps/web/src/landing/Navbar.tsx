import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";

function Navbar() {
  return (
    <SiteHeader
      links={
        <>
          <a href="#features" className="site-nav-link landing-anchor">
            Features
          </a>
          <a href="#how-it-works" className="site-nav-link landing-anchor">
            How it works
          </a>
          <a href="#faq" className="site-nav-link landing-anchor">
            FAQ
          </a>
        </>
      }
    >
      <Link to="/markets" className="btn">
        Explore stocks
      </Link>
    </SiteHeader>
  );
}

export default Navbar;
