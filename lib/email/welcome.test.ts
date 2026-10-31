import { describe, expect, it } from "vitest";
import { appUrl, welcomeEmail } from "./welcome";

describe("welcomeEmail", () => {
  const email = welcomeEmail({
    inviterName: "AJ <script>",
    role: "editor",
    appUrl: "https://rpc.example.com",
    email: "adam@example.com",
  });

  it("says who added them, their role, and how to sign in", () => {
    expect(email.text).toContain("AJ <script> added you");
    expect(email.text).toContain("You're an Editor: Can also edit contacts");
    expect(email.text).toContain("https://rpc.example.com");
    expect(email.text).toContain("adam@example.com");
  });

  it("escapes names in the html", () => {
    expect(email.html).toContain("AJ &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("picks a or an for the role", () => {
    expect(welcomeEmail({ inviterName: "AJ", role: "admin", appUrl: "x", email: "y" }).text).toContain("You're an Admin");
    expect(welcomeEmail({ inviterName: "AJ", role: "viewer", appUrl: "x", email: "y" }).text).toContain("You're a Viewer");
  });
});

describe("appUrl", () => {
  it("prefers BETTER_AUTH_URL, then the Vercel production host", () => {
    expect(appUrl({ BETTER_AUTH_URL: "https://rpc.example.com/" })).toBe("https://rpc.example.com");
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" })).toBe("https://app.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
