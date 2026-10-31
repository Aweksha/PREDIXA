import { Link } from "react-router-dom";

function ProductPreview() {
  return (
    <section id="preview" style={styles.section}>
      <div style={styles.textCol}>
        <p style={styles.kicker}>Live Product View</p>
        <h2 style={styles.title}>A dashboard that feels like a real product</h2>
        <p style={styles.sub}>
          Use this section to showcase your existing stock dashboard. You can
          start with a screenshot, then later replace it with a live embedded
          component or short animation.
        </p>

        <ul style={styles.list}>
          <li>Dynamic charting</li>
          <li>Market signal overview</li>
          <li>AI-assisted interpretation</li>
          <li>Expandable to watchlists and plan-gated features</li>
        </ul>

        <div style={styles.btnRow}>
          <Link to="/dashboard" style={styles.primaryBtn}>
            Try Demo
          </Link>
        </div>
      </div>

      <div style={styles.previewWrap}>
        <div style={styles.browser}>
          <div style={styles.browserTop}>
            <span style={styles.dotRed} />
            <span style={styles.dotYellow} />
            <span style={styles.dotGreen} />
          </div>

          <div style={styles.previewBody}>
            <div style={styles.previewHeader} />
            <div style={styles.previewGrid}>
              <div style={styles.bigPanel} />
              <div style={styles.sidePanel} />
              <div style={styles.bottomPanel} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    maxWidth: "1300px",
    margin: "0 auto",
    padding: "30px 40px 96px",
    display: "grid",
    gridTemplateColumns: "0.9fr 1.1fr",
    gap: "32px",
    alignItems: "center",
  },
  textCol: {},
  kicker: {
    color: "#4ade80",
    fontWeight: 700,
  },
  title: {
    fontSize: "2.5rem",
    margin: "12px 0",
  },
  sub: {
    color: "#aab6c8",
    lineHeight: 1.7,
  },
  list: {
    color: "#d6dfeb",
    lineHeight: 2,
    paddingLeft: "18px",
  },
  btnRow: {
    marginTop: "20px",
  },
  primaryBtn: {
    display: "inline-block",
    padding: "14px 20px",
    borderRadius: "14px",
    background: "linear-gradient(90deg, #22c55e, #fb923c)",
    color: "#07111f",
    fontWeight: 800,
  },
  previewWrap: {},
  browser: {
    borderRadius: "26px",
    overflow: "hidden",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  browserTop: {
    display: "flex",
    gap: "8px",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  dotRed: { width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" },
  dotYellow: { width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b" },
  dotGreen: { width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" },
  previewBody: {
    padding: "20px",
    background: "linear-gradient(180deg, rgba(7,17,31,0.92), rgba(11,23,40,0.92))",
  },
  previewHeader: {
    height: "42px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.06)",
    marginBottom: "16px",
  },
  previewGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "260px 180px",
    gap: "14px",
  },
  bigPanel: {
    borderRadius: "18px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  sidePanel: {
    borderRadius: "18px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  bottomPanel: {
    gridColumn: "1 / span 2",
    borderRadius: "18px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
};

export default ProductPreview;