import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/** Read-only Calendar access (list events). */
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * Must match a redirect URI in Google Cloud Console (APIs & Services → Credentials → OAuth client).
 * Override in production, e.g. https://your-host/oauth/google/callback
 */
export function getOAuthRedirectUri(): string {
  if (process.env.OAUTH_REDIRECT_URI?.trim()) {
    return process.env.OAUTH_REDIRECT_URI.trim();
  }
  const port = process.env.PORT || "8080";
  return `http://localhost:${port}/oauth/google/callback`;
}

export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    getOAuthRedirectUri()
  );
}

export function assertOAuthClientConfigured(): void {
  if (!process.env.CLIENT_ID?.trim() || !process.env.CLIENT_SECRET?.trim()) {
    throw new Error("CLIENT_ID and CLIENT_SECRET must be set in the environment.");
  }
}

/**
 * Uses a long-lived refresh token from env so API calls work after a one-time browser login.
 */
export function applyRefreshTokenFromEnv(auth: OAuth2Client): void {
  const rt = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (rt) {
    auth.setCredentials({ refresh_token: rt });
  }
}

export function getGoogleAuthUrl(auth: OAuth2Client): string {
  return auth.generateAuthUrl({
    access_type: "offline",
    scope: CALENDAR_SCOPES,
    prompt: "consent",
  });
}
