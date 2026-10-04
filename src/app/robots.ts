import type { MetadataRoute } from "next";

// The Hub is private: no search engine or AI crawler may read or keep any
// of it. Staff pages need a sign-in anyway; this also covers the customer
// proposal and crew work order links (/p/..., /w/...), which don't.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "CCBot",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "cohere-ai",
  "Diffbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
      { userAgent: "*", disallow: "/" },
    ],
  };
}
