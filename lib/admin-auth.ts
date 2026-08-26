import { redirect } from "next/navigation";

import { chatGPTSignInPath, getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";

function allowedEmails() {
  return new Set(
    (process.env.ADMIN_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedForecastAdmin(user: ChatGPTUser | null) {
  if (!user) return false;
  const allowed = allowedEmails();
  return allowed.size === 0 || allowed.has(user.email.toLowerCase());
}

export async function getForecastAdmin() {
  const user = await getChatGPTUser();
  return isAllowedForecastAdmin(user) ? user : null;
}

export async function requireForecastAdmin(returnTo: string) {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath(returnTo));
  if (!isAllowedForecastAdmin(user)) redirect("/");
  return user;
}
