function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "$0",
      subtitle: "For exploring the platform",
      features: ["Basic dashboard", "Limited analytics", "Demo access"],
      highlight: false,
    },
    {
      name: "Pro",
      price: "$19",
      subtitle: "For serious users and demos",
      features: ["AI predictions", "Advanced signals", "Strategy insights"],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "$49",
      subtitle: "For scaled product vision",
      features: ["Everything in Pro", "Extended analytics", "Priority support"],
      highlight: false,
    },
  ];

  return (
    <section id="pricing" style={styles.section}>
      <div style={styles.header}>
        <p style={styles.kicker}>Transparent Pricing</p>
        <h2 style={styles.title}>Simple plans for demo and growth</h2>
        <p style={styles.sub}>
          For now, this can stay demo-driven. Later, you can wire plan selection
          directly into auth and feature gating.
        </p>
      </div>

      <div style={styles.grid}>
        {plans.map((plan) => (
          <div
            key={plan.name}
            style={{
              ...styles.card,
              ...(plan.highlight ? styles.highlightCard : {}),
            }}
          >
            {plan.highlight && <div style={styles.badge}>Most Popular</div>}
            <h3 style={styles.planName}>{plan.name}</h3>
            <div style={styles.priceRow}>
              <span style={styles.price}>{plan.price}</span>
              <span style={styles.per}>/month</span>
            </div>
            <p style={styles.subtitle}>{plan.subtitle}</p>

            <ul style={styles.featureList}>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <button style={plan.highlight ? styles.primaryButton : styles.secondaryButton}>
              Choose Plan
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    maxWidth: "1300px",
    margin: "0 auto",
    padding: "96px 40px",
  },
  header: {
    textAlign: "center",
    maxWidth: "760px",
    margin: "0 auto 34px",
  },
  kicker: {
    color: "#fdba74",
    fontWeight: 700,
  },
  title: {
    fontSize: "2.7rem",
    margin: "12px 0",
  },
  sub: {
    color: "#aab6c8",
    lineHeight: 1.7,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "22px",
  },
  card: {
    position: "relative",
    padding: "28px",
    borderRadius: "24px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  highlightCard: {
    border: "1px solid rgba(74, 222, 128, 0.45)",
    boxShadow: "0 0 40px rgba(74, 222, 128, 0.12)",
  },
  badge: {
    position: "absolute",
    top: "16px",
    right: "16px",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(74, 222, 128, 0.15)",
    color: "#4ade80",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  planName: {
    fontSize: "1.3rem",
    marginBottom: "12px",
  },
  priceRow: {
    display: "flex",
    alignItems: "end",
    gap: "8px",
  },
  price: {
    fontSize: "2.8rem",
    fontWeight: 800,
  },
  per: {
    color: "#aab6c8",
    marginBottom: "8px",
  },
  subtitle: {
    color: "#b8c4d6",
    marginTop: "12px",
    marginBottom: "18px",
  },
  featureList: {
    color: "#dce5f1",
    lineHeight: 2,
    paddingLeft: "18px",
    minHeight: "130px",
  },
  primaryButton: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "14px",
    background: "linear-gradient(90deg, #22c55e, #fb923c)",
    color: "#07111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#f8fafc",
    fontWeight: 800,
    cursor: "pointer",
  },
};

export default Pricing;