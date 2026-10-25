import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BADGE, formatClosing, formatSalary, shortLocation } from "@/components/site/format";
import { FIELD_LABEL } from "@/lib/scoring/fields";
import type { Sponsorability } from "@/lib/scoring/score";
import { SITE_URL } from "@/lib/site/config";
import type { JobListItem } from "@/lib/site/queries";

/**
 * Instagram carousel slides (1080×1350, Instagram's 4:5 portrait), drawn in the site's
 * visa-document style: an ink band with a guilloche, and the sponsorship result as a stamp.
 */

export const CARD_SIZE = { width: 1080, height: 1350 };
// ImageResponse defaults to a year of public caching; these are admin-only.
const PRIVATE = { "Cache-Control": "private, no-store" };

const C = {
  paper: "#f4f7f6",
  ink: "#16233f",
  inkSoft: "#4a5872",
  line: "#d3dcd9",
  teal: "#0e6e68",
  tealWash: "#e3f1ef",
  amber: "#a75b0a",
  amberWash: "#fbf0e1",
  red: "#ad2a1e",
  redWash: "#f9e7e4",
};

const STAMP: Record<Sponsorability, { border: string; bg: string; fg: string }> = {
  sponsorship_mentioned: { border: C.teal, bg: C.teal, fg: "#ffffff" },
  likely_eligible: { border: C.teal, bg: C.tealWash, fg: C.teal },
  check_with_employer: { border: C.amber, bg: C.amberWash, fg: C.amber },
  unknown: { border: C.inkSoft, bg: "#ffffff", fg: C.inkSoft },
  ineligible: { border: C.red, bg: C.redWash, fg: C.red },
};

// Static instances: the card renderer can't use the site's variable font.
const font = (weight: number) => readFile(join(process.cwd(), `assets/fonts/archivo-latin-${weight}-normal.ttf`));
const fonts = Promise.all([500, 700, 800].map(async (weight) => ({ name: "Archivo", data: await font(weight), weight: weight as 500 | 700 | 800, style: "normal" as const })));

export const siteHost = () => new URL(SITE_URL).host.replace(/^www\./, "");

function guillochePaths(width: number, height: number): string[] {
  const paths: string[] = [];
  for (let k = 0; k < 7; k++) {
    const phase = (k * Math.PI) / 7;
    const amp = height * (0.28 + (k % 3) * 0.08);
    let d = "";
    for (let x = 0; x <= width; x += 12) {
      const y = height / 2 + amp * Math.sin(x / 52 + phase) * Math.cos(x / 207 - phase / 2);
      d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return paths;
}

function Guilloche({ height, opacity, width = CARD_SIZE.width }: { height: number; opacity: number; width?: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ opacity }}>
      {guillochePaths(width, height).map((d, i) => (
        <path key={i} d={d} fill="none" stroke={C.tealWash} strokeWidth={1.4} />
      ))}
    </svg>
  );
}

function Band({ right }: { right: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: C.ink, color: "#ffffff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "56px 72px 20px" }}>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>Visa Sponsor Jobs UK</div>
        <div style={{ fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{right}</div>
      </div>
      <Guilloche height={56} opacity={0.45} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "50%", paddingBottom: 28 }}>
      <div style={{ fontSize: 28, color: C.inkSoft }}>{label}</div>
      <div style={{ fontSize: 38, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

/** Long titles step down in size so they never run past four lines. */
const titleSize = (title: string) => (title.length > 70 ? 58 : title.length > 45 ? 68 : 80);

export async function jobCard(job: JobListItem, slide?: { index: number; of: number }) {
  const stamp = STAMP[job.sponsorability];
  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const closing = formatClosing(job.closingDate);
  const place = shortLocation(job.locationText);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.paper, color: C.ink, fontFamily: "Archivo" }}>
        <Band right={job.field ? (FIELD_LABEL[job.field] ?? "") : ""} />
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "64px 72px 56px" }}>
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
                padding: "14px 24px",
                border: `5px solid ${stamp.border}`,
                borderRadius: 10,
                background: stamp.bg,
                color: stamp.fg,
                transform: "rotate(-1.5deg)",
              }}
            >
              {BADGE[job.sponsorability].label}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: titleSize(job.title), fontWeight: 800, lineHeight: 1.06, letterSpacing: -1, marginTop: 52, lineClamp: 4 }}>
            {job.title}
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, marginTop: 32 }}>{job.employerName}</div>
          {place ? <div style={{ display: "flex", fontSize: 34, color: C.inkSoft, marginTop: 8, lineClamp: 1 }}>{place}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 48, paddingTop: 36, borderTop: `2px solid ${C.line}` }}>
            <Fact label="Salary" value={salary ? `${salary} a year` : "Not shown"} />
            <Fact label="Closing date" value={closing ? closing.replace("Closes ", "") : "Not shown"} />
            {job.isGradScheme ? <Fact label="Type" value="Graduate scheme" /> : null}
          </div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: 1.35, color: C.inkSoft, marginTop: 12 }}>{BADGE[job.sponsorability].summary}</div>
          <div style={{ display: "flex", flexGrow: 1 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, color: C.inkSoft }}>Full sponsorship check and apply link</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: C.teal, marginTop: 6 }}>{`Link in bio: ${siteHost()}`}</div>
            </div>
            {slide ? <div style={{ fontSize: 30, color: C.inkSoft }}>{`${slide.index}/${slide.of}`}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: C.inkSoft, marginTop: 24 }}>Facts from the job ad and the Skilled Worker rules, not immigration advice.</div>
        </div>
      </div>
    ),
    { ...CARD_SIZE, fonts: await fonts, headers: PRIVATE },
  );
}

export async function coverCard({ count, date }: { count: number; date: string }) {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.ink, color: "#ffffff", fontFamily: "Archivo" }}>
        <div style={{ display: "flex", padding: "64px 72px 0", fontSize: 36, fontWeight: 800 }}>Visa Sponsor Jobs UK</div>
        <div style={{ display: "flex", marginTop: 48 }}>
          <Guilloche height={150} opacity={0.5} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", padding: "0 72px" }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2 }}>Graduate jobs at UK visa sponsors</div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 500, marginTop: 44, color: "rgba(255,255,255,0.85)" }}>
            {`${count} ${count === 1 ? "pick" : "picks"} for ${date}, each checked against the Skilled Worker salary and occupation rules.`}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 72px 64px" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: C.tealWash }}>Swipe for the jobs</div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.7)" }}>{siteHost()}</div>
        </div>
      </div>
    ),
    { ...CARD_SIZE, fonts: await fonts, headers: PRIVATE },
  );
}

export const SHARE_SIZE = { width: 1200, height: 630 };

/**
 * Link previews (Open Graph, 1200×630) for the public site: a job with its stamp, or the
 * site itself. Public and cacheable, unlike the admin carousel.
 */
export async function shareCard({ title, subtitle, status }: { title: string; subtitle?: string; status?: Sponsorability }) {
  const stamp = status ? STAMP[status] : null;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.paper, color: C.ink, fontFamily: "Archivo" }}>
        <div style={{ display: "flex", flexDirection: "column", background: C.ink, color: "#ffffff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "36px 64px 12px" }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>Visa Sponsor Jobs UK</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{siteHost()}</div>
          </div>
          <Guilloche height={44} opacity={0.45} width={SHARE_SIZE.width} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", padding: "0 64px" }}>
          {stamp && status ? (
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 700,
                  padding: "10px 20px",
                  border: `4px solid ${stamp.border}`,
                  borderRadius: 9,
                  background: stamp.bg,
                  color: stamp.fg,
                  transform: "rotate(-1.5deg)",
                }}
              >
                {BADGE[status].label}
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: title.length > 60 ? 52 : 64, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1, marginTop: stamp ? 32 : 0, lineClamp: 3 }}>
            {title}
          </div>
          {subtitle ? <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: C.inkSoft, marginTop: 20, lineClamp: 2 }}>{subtitle}</div> : null}
        </div>
      </div>
    ),
    { ...SHARE_SIZE, fonts: await fonts },
  );
}
