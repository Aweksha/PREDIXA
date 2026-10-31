import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { SUPPORTED_STOCKS } from "../data/supportedStocks";
import Reveal from "./Reveal";

const FAQS = [
  {
    q: "Can PREDIXA predict the stock market?",
    a: "Not reliably. In testing on data the models never saw, their direction calls didn't beat simple baselines. They were much better at estimating how much a stock is likely to move. Each stock page shows this track record, and every forecast sits next to the actual outcome.",
  },
  {
    q: "Should I trade based on these signals?",
    a: "No. Nothing on this site is financial advice, including the buy, hold and sell labels. They are model outputs for study.",
  },
  {
    q: "Why are the dates in the past?",
    a: "PREDIXA works from a virtual date about 30 days back. That leaves time for the real prices to come in, so each forecast can be checked against them.",
  },
  {
    q: "Which stocks are covered?",
    a: `${SUPPORTED_STOCKS.length} large US companies across technology, consumer, financials and energy. You can see them all on the Markets page.`,
  },
  {
    q: "Where does the data come from?",
    a: "Daily prices, company fundamentals and news headlines come from Yahoo Finance, and prices are stored in PREDIXA's database when it's available. News sentiment is labelled by Gemini.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="landing-section landing-section-alt">
      <div className="landing-container faq">
        <Reveal>
          <p className="kicker">FAQ</p>
          <h2 className="section-title">Common questions</h2>
        </Reveal>

        <Reveal delay={0.08}>
          {FAQS.map((faq, index) => {
            const isOpen = open === index;
            return (
              <div className="faq-item" key={faq.q}>
                <button
                  type="button"
                  className="faq-question"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  {faq.q}
                  <Plus
                    size={18}
                    aria-hidden="true"
                    className={`faq-icon${isOpen ? " faq-icon-open" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="faq-answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <p>{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

export default FAQ;
