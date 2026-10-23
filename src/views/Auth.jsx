import { useState } from "react";
import { pb } from "../lib/pb";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await pb.collection("users").create({
          name: form.name,
          email: form.email,
          password: form.password,
          passwordConfirm: form.password,
        });
      }
      await pb.collection("users").authWithPassword(form.email, form.password);
    } catch (err) {
      const fieldErrors = Object.values(err.response?.data || {}).map((d) => d.message);
      setError(fieldErrors.join(" ") || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="card">
        <h1>Dayline</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Your calendar, to-dos and habits — with rewards you actually want.
        </p>
        <form className="form" onSubmit={submit}>
          {mode === "signup" && (
            <label className="field">
              <span>Your name</span>
              <input className="input" value={form.name} onChange={set("name")} required />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={form.email} onChange={set("email")} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              minLength={8}
              value={form.password}
              onChange={set("password")}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {mode === "login" ? "Log in" : "Create account"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "New here? Create an account" : "Have an account? Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
