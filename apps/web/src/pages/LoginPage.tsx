import { Link } from "react-router-dom";

function LoginPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Log In</h1>
        <p style={styles.sub}>Welcome back to Predixa.</p>

        <input style={styles.input} type="email" placeholder="Email" />
        <input style={styles.input} type="password" placeholder="Password" />
        <button style={styles.button}>Log In</button>

        <p style={styles.small}>
          Don’t have an account? <Link to="/signup">Create one</Link>
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
    maxWidth: "440px",
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

export default LoginPage;