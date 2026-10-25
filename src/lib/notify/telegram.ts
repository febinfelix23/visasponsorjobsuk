/**
 * Sends a message to the founder's Telegram chat through the run-report bot.
 * Never throws and never logs the token: a failed report must not fail the job it reports on.
 */
export async function sendTelegram(html: string): Promise<"sent" | "not_configured" | "failed"> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return "not_configured";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "sent";
    // Telegram's error description names the problem (bad chat id, blocked bot) without echoing the token.
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    console.warn(`Telegram refused the message: ${res.status} ${body?.description ?? ""}`);
    return "failed";
  } catch (error) {
    console.warn(`Couldn't reach Telegram: ${error instanceof Error ? error.name : "error"}`);
    return "failed";
  }
}
