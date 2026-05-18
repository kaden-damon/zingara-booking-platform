import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 50% 35%, #35220b 0%, #050505 58%, #000000 100%)",
          color: "#f3da78",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            border: "6px solid rgba(216, 195, 106, 0.75)",
            borderRadius: "999px",
            display: "flex",
            height: "360px",
            justifyContent: "center",
            width: "360px",
          }}
        >
          <span
            style={{
              fontSize: 210,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            Z
          </span>
        </div>
      </div>
    ),
    size,
  );
}
