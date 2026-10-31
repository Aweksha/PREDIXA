import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import Reveal from "./Reveal";

function FinalCTA() {
  return (
    <section className="landing-section">
      <div className="landing-container">
        <Reveal className="cta">
          <h2 className="section-title">See how the forecasts held up</h2>
          <p className="section-copy">
            Pick a stock and compare what the models said with what really happened.
          </p>
          <Link to="/markets" className="btn btn-lg">
            Explore stocks
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCTA;
