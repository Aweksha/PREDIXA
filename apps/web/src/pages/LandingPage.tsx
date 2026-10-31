import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../landing/Navbar";
import Hero from "../landing/Hero";
import Features from "../landing/Features";
import HowItWorks from "../landing/HowItWorks";
import FAQ from "../landing/FAQ";
import FinalCTA from "../landing/FinalCTA";
import Footer from "../landing/Footer";
import "./LandingPage.css";

function LandingPage() {
  const { hash } = useLocation();

  // Router links like /#faq don't scroll on their own
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="landing-page">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
