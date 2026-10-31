import { Link } from "react-router-dom";

function SignupPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Create Account</h1>
        <p style={styles.sub}>Start using Predixa.</p>

        <input style={styles.input} type="text" placeholder="Full Name" />
        <input style={styles.input} type="email" placeholder="Email" />
        <input style={styles.input} type="password" placeholder="Password" />
        <input style={styles.input} type="password" placeholder="Confirm Password" />
        <button style={styles.button}>Create Account</button>

        <p style={styles.small}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
  },
  card: {
    width: "100%",
    maxWidth: "460px",
    padding: "32px",
    borderRadius: "24px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  sub: {
    color: "#aab6c8",
    marginBottom: "20px",
  },
  input: {
    width: "100%",
    padding: "14px",
    marginBottom: "14px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
  },
  button: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "12px",
    background: "linear-gradient(90deg, #22c55e, #fb923c)",
    color: "#07111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  small: {
    marginTop: "18px",
    color: "#cbd5e1",
  },
};

export default SignupPage;