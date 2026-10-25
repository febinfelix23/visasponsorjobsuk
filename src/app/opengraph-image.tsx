import { SHARE_SIZE, shareCard } from "@/lib/admin/cards";

export const alt = "Visa Sponsor Jobs UK: graduate jobs at UK employers licensed to sponsor visas";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return shareCard({
    title: "Graduate jobs at UK employers licensed to sponsor visas",
    subtitle: "Each checked against the Skilled Worker salary and occupation rules",
  });
}
