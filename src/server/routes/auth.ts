import type { Request } from "express";
import { Router } from "express";

import { config } from "../lib/config.js";
import { generators, oidcService } from "../services/oidcService.js";

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
    const client = await oidcService.getClient();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    req.session.oidcCodeVerifier = codeVerifier;
    req.session.oidcState = state;

    const authUrl = client.authorizationUrl({
      scope: config.oidcScopes,
      redirect_uri: callbackUrl(req),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    res.redirect(authUrl);
  } catch (err) {
    console.error("OIDC login error:", err);
    res.status(500).json({ error: "OIDC configuration error" });
  }
});

// Handle redirect back from OIDC provider
router.get("/callback", async (req, res) => {
  try {
    const client = await oidcService.getClient();
    const params = client.callbackParams(req);

    const tokenSet = await client.callback(callbackUrl(req), params, {
      code_verifier: req.session.oidcCodeVerifier,
      state: req.session.oidcState,
    });

    const claims = tokenSet.claims();

    req.session.user = {
      sub: claims.sub,
      name: typeof claims.name === "string" ? claims.name : undefined,
      email: typeof claims.email === "string" ? claims.email : undefined,
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
    };

    delete req.session.oidcCodeVerifier;
    delete req.session.oidcState;

    res.redirect("/");
  } catch (err) {
    console.error("OIDC callback error:", err);
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
