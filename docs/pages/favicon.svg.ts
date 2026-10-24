import logo from "../../src/client/public/logo.svg?raw";

// Build the favicon from the shared brand without copying application public files.
export async function GET() {
  return new Response(logo, { headers: { "Content-Type": "image/svg+xml" } });
}
