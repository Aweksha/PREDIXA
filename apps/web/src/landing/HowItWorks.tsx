import Reveal from "./Reveal";

const STEPS = [
  {
    title: "Rewind the clock",
    text: "PREDIXA sets its working date about 30 days in the past, so the models only see data available at that point.",
  },
  {
    title: "Make the forecasts",
    text: "Machine learning models estimate the next-day price, the 5-day direction and a 10-day signal from price history and market features.",
  },
  {
    title: "Check the outcome",
    text: "Because the real prices are already known, every forecast sits next to the actual result, with its error and direction.",
  },
];

const LIMITS = [
  "Markets react to events that no historical model can see coming.",
  "A forecast that was right once may just be luck.",
  "Confidence figures come from the models and aren't a promise of accuracy.",
  "PREDIXA doesn't know your finances, goals or tolerance for risk.",
];

function HowItWorks() {
  return (
    <>
      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-container">
          <Reveal className="section-head">
            <p className="kicker">How it works</p>
            <h2 className="section-title">A forecast you can grade immediately</h2>
          </Reveal>

          <ol className="steps">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.06}>
                <li className="step">
                  <span className="step-number">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container limits">
          <Reveal>
            <p className="kicker">Limitations</p>
            <h2 className="section-title">What PREDIXA can&apos;t do</h2>
            <p className="section-copy">
              This is a research project, and it can&apos;t yet properly predict
              stocks. Treat it as a way to explore how forecasting models behave,
              not as a source of trading decisions.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <ul className="limits-list">
              {LIMITS.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default HowItWorks;
