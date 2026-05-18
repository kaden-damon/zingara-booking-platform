import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 50% 35%, #3a260c 0%, #050505 62%, #000000 100%)",
          color: "#f3da78",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            border: "3px solid rgba(216, 195, 106, 0.78)",
            borderRadius: "999px",
            display: "flex",
            height: "126px",
            justifyContent: "center",
            width: "126px",
          }}
        >
          <span
            style={{
              fontSize: 76,
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
