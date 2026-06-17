"use client";

import { useState } from "react";

export default function ReactTestPage() {
  const [clickCount, setClickCount] = useState(0);

  function handleClick() {
    setClickCount((currentCount) => currentCount + 1);
    window.alert("react works");
  }

  return (
    <main
      style={{
        alignItems: "center",
        background: "#050505",
        color: "#ffffff",
        display: "flex",
        minHeight: "100vh",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          border: "1px solid rgba(216, 195, 106, 0.45)",
          borderRadius: "24px",
          maxWidth: "420px",
          padding: "24px",
          textAlign: "center",
          width: "100%",
        }}
      >
        <p
          style={{
            color: "#D8C36A",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          React Isolation Test
        </p>
        <h1 style={{ fontSize: "32px", margin: "12px 0 20px" }}>
          Minimal Client Page
        </h1>
        <button
          type="button"
          onClick={handleClick}
          style={{
            background: "#D8C36A",
            border: 0,
            borderRadius: "999px",
            color: "#000000",
            fontSize: "18px",
            fontWeight: 800,
            minHeight: "52px",
            padding: "0 24px",
          }}
        >
          Test React Click
        </button>
        <p style={{ color: "#a1a1aa", marginTop: "16px" }}>
          Click count: {clickCount}
        </p>
      </section>
    </main>
  );
}
