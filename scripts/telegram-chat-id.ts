/**
 * Finds the chat ID for the run-report bot: message the bot once in Telegram, then run
 *
 *   npm run telegram:chat-id
 *
 * Reads TELEGRAM_BOT_TOKEN from .env.local and never prints it.
 */
import "./load-env";

type Update = { message?: { chat: { id: number; type: string; first_name?: string; username?: string; title?: string } } };

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("Add TELEGRAM_BOT_TOKEN=<token from BotFather> to .env.local first.");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const body = (await res.json()) as { ok: boolean; description?: string; result?: Update[] };
  if (!body.ok) {
    console.log(`Telegram said: ${body.description ?? res.status}. Check the token is copied exactly.`);
    return;
  }
  const chats = new Map<number, string>();
  for (const u of body.result ?? []) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, c.title ?? [c.first_name, c.username && `@${c.username}`].filter(Boolean).join(" "));
  }
  if (chats.size === 0) {
    console.log("No messages yet. Open your bot in Telegram, send it any message, then run this again.");
    return;
  }
  for (const [id, name] of chats) console.log(`Chat ID ${id}  (${name})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
