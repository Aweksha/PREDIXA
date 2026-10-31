import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Disclaimer from "./components/Disclaimer";
import TickerStrip from "./landing/TickerStrip";
import LandingPage from "./pages/LandingPage";
import MarketsPage from "./pages/MarketsPage";
import StockInsight from "./pages/StockInsight";

function AnimatedRoutes() {
  const location = useLocation();
  // Keyed by top-level page so switching tickers updates in place instead of fading out
  const pageKey = location.pathname.split("/")[1];

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => window.scrollTo({ top: 0, behavior: "instant" })}
    >
      <motion.div
        key={pageKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/search" element={<Navigate to="/markets" replace />} />
          <Route path="/dashboard/:ticker" element={<StockInsight />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <Disclaimer />
        <AnimatedRoutes />
        <TickerStrip />
      </MotionConfig>
    </BrowserRouter>
  );
}
