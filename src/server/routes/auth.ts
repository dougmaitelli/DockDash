import type { Request } from "express";
import { Router } from "express";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";

import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { oidcService } from "../services/oidcService.js";

function callbackUrl(req: Request): string {
  // Explicit override takes precedence for unusual proxy setups
  if (config.oidcRedirectUri) return config.oidcRedirectUri;

  return `${req.protocol}://${req.get("host")}/auth/callback`;
}

// Extend express-session with OIDC and user data
declare module "express-session" {
  interface SessionData {
    user?: {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    };
    oidcState?: string;
    oidcCodeVerifier?: string;
  }
}

const router = Router();

// Returns current auth state — always 200 so the client can bootstrap without error handling
router.get("/me", (req, res) => {
  if (!config.oidcEnabled) {
    res.json({ enabled: false, user: null });

    return;
  }

  res.json({ enabled: true, user: req.session.user ?? null });
});

// Redirect to OIDC provider
router.get("/login", async (req, res) => {
  if (!config.oidcEnabled) {
    res.redirect("/");

    return;
  }

  try {
    const oidcConfig = await oidcService.getConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();

    req.session.oidcCodeVerifier = codeVerifier;
    req.session.oidcState = state;

    const authUrl = buildAuthorizationUrl(oidcConfig, {
      scope: config.oidcScopes,
      redirect_uri: callbackUrl(req),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    res.redirect(authUrl.href);
  } catch (err) {
    logger.error(`OIDC login error: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ error: "OIDC configuration error" });
  }
});

// Handle redirect back from OIDC provider
router.get("/callback", async (req, res) => {
  if (!req.session.oidcCodeVerifier || !req.session.oidcState) {
    res.redirect("/login?error=invalid_state");

    return;
  }

  try {
    const oidcConfig = await oidcService.getConfig();
    const currentUrl = new URL(req.originalUrl, callbackUrl(req));

    const tokenSet = await authorizationCodeGrant(oidcConfig, currentUrl, {
      pkceCodeVerifier: req.session.oidcCodeVerifier,
      expectedState: req.session.oidcState,
    });

    const claims = tokenSet.claims();

    if (!claims) throw new Error("No ID token claims in response");

    // Regenerate the session ID on login to prevent session fixation, then
    // explicitly save before redirecting so the new cookie reaches the client.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = {
      sub: claims.sub,
      name: typeof claims.name === "string" ? claims.name : undefined,
      email: typeof claims.email === "string" ? claims.email : undefined,
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
    };

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.redirect("/");
  } catch (err) {
    logger.error(`OIDC callback error: ${err instanceof Error ? err.message : String(err)}`);
    res.redirect("/login?error=callback_failed");
  }
});

// Destroy session and redirect to login page
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
