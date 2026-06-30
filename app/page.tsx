"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  // Signalen uit de API-respons, alleen aanwezig op agent-berichten.
  suggest_task?: boolean;
  task_reason?: string;
  suggest_booking?: boolean;
}

const BOOKING_PLACEHOLDER_URL = "https://calendly.com/sous-spotlight/placeholder";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Alleen role + content naar de API; signalen zijn frontend-only.
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Er ging iets mis.");
      }

      const agentMessage: Message = {
        role: "assistant",
        content: data.reply,
        suggest_task: data.suggest_task,
        task_reason: data.task_reason,
        suggest_booking: data.suggest_booking,
      };
      setMessages((prev) => [...prev, agentMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function openBooking() {
    window.open(BOOKING_PLACEHOLDER_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <main style={styles.page}>
      <div style={styles.logoBar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://i.imgur.com/u4XcUK2.png" alt="SOUS" style={styles.logo} />
      </div>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>SOUS Spotlight-assistent</h1>
          <p style={styles.subtitle}>
            Stel een vraag over je online zichtbaarheid, reviews en ranking.
          </p>
        </header>

        <div style={styles.chat}>
          {messages.length === 0 && !loading && (
            <p style={styles.empty}>
              Begin het gesprek, bijvoorbeeld: &ldquo;Hoeveel reviews heb ik de
              afgelopen 90 dagen?&rdquo;
            </p>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              <div
                style={{
                  ...styles.bubbleRow,
                  justifyContent:
                    m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    ...(m.role === "user"
                      ? styles.userBubble
                      : styles.agentBubble),
                  }}
                >
                  {m.content}
                </div>
              </div>

              {m.role === "assistant" && m.suggest_task && (
                <div style={styles.taskCard}>
                  <div style={styles.taskCardTitle}>
                    📋 Voorstel: taak voor account manager
                  </div>
                  {m.task_reason && (
                    <div style={styles.taskReason}>{m.task_reason}</div>
                  )}
                  <div style={styles.note}>
                    In productie zou dit een taak op het merchant-record in
                    HubSpot aanmaken.
                  </div>
                </div>
              )}

              {m.role === "assistant" && m.suggest_booking && (
                <div style={styles.bookingWrap}>
                  <button style={styles.bookingButton} onClick={openBooking}>
                    📅 Plan een gesprek met je account manager
                  </button>
                  <div style={styles.note}>
                    In productie opent dit de agenda van de toegewezen account
                    manager.
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ ...styles.bubbleRow, justifyContent: "flex-start" }}>
              <div style={{ ...styles.bubble, ...styles.agentBubble }}>
                <span style={styles.typing}>De assistent denkt na…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.inputRow}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ je vraag…"
            disabled={loading}
          />
          <button
            style={styles.sendButton}
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            Verstuur
          </button>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#1a1a1a",
    background: "#f5f5f5",
    minHeight: "100vh",
    padding: "24px 16px",
  },
  logoBar: {
    maxWidth: 700,
    margin: "0 auto",
    padding: 16,
    display: "flex",
    justifyContent: "flex-start",
  },
  logo: { height: 32, width: "auto", display: "block" },
  container: {
    maxWidth: 700,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
  },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 14, color: "#666", margin: "4px 0 0" },
  chat: {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 10,
    padding: 16,
    minHeight: 320,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  empty: { color: "#999", fontSize: 14, textAlign: "center", margin: "auto" },
  bubbleRow: { display: "flex", margin: "6px 0" },
  bubble: {
    maxWidth: "80%",
    padding: "10px 14px",
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  userBubble: {
    background: "#F1F1F4",
    color: "#1a1a1a",
    borderBottomRightRadius: 4,
  },
  agentBubble: {
    background: "#00073D",
    color: "#fff",
    borderBottomLeftRadius: 4,
  },
  typing: { color: "#c7cad8", fontStyle: "italic" },
  taskCard: {
    border: "1px solid #e0e0e0",
    borderLeft: "4px solid #00073D",
    background: "#fafafa",
    borderRadius: 10,
    padding: 12,
    margin: "4px 0 10px",
  },
  taskCardTitle: { fontWeight: 600, fontSize: 14 },
  taskReason: { fontSize: 14, color: "#444", marginTop: 4 },
  bookingWrap: { margin: "4px 0 10px" },
  bookingButton: {
    background: "#00073D",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  note: { fontSize: 12, fontStyle: "italic", color: "#888", marginTop: 6 },
  error: { color: "#c0392b", fontSize: 14, marginTop: 10 },
  inputRow: { display: "flex", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #ccc",
    borderRadius: 8,
    outline: "none",
  },
  sendButton: {
    background: "#00073D",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
