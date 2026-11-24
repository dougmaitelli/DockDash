import { httpErrorSummary } from "@server/lib/httpRequest.js";
import { expect, it } from "vitest";

it("logs HTTP status and code without serializing credentials or response bodies", () => {
  const token = "synthetic-secret";
  const error = Object.assign(new Error(token), {
    code: "ECONNABORTED",
    config: { headers: { Authorization: `Bearer ${token}` } },
    response: { status: 503, data: token },
  });

  expect(httpErrorSummary(error)).toBe("Request failed; ECONNABORTED; HTTP 503");
});
