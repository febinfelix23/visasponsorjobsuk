import { ImageResponse } from "next/og";
import { LOGO_PATHS } from "@/components/site/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the brand mark on its navy square (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#16233f" }}>
        <svg viewBox="2 2 28 28" width={180} height={180}>
          <path d={LOGO_PATHS.frame} fill="none" stroke="#e3f1ef" strokeWidth="1.3" />
          <path d={LOGO_PATHS.tick} fill="none" stroke="#5fc2b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
