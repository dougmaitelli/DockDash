import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://dougmaitelli.github.io",
  base: "/DockDash",
  srcDir: ".",
  outDir: "./dist",
  integrations: [
    starlight({
      title: "DockDash",
      description:
        "Documentation for DockDash, the self-hosted update and service monitoring dashboard.",
      logo: {
        src: "../src/client/public/logo.svg",
        alt: "DockDash",
      },
      favicon: "/favicon.svg",
      customCss: ["./styles/docs.css"],
      markdown: {
        processedDirs: ["."],
      },
      components: {
        Hero: "./components/Hero.astro",
      },
      editLink: {
        baseUrl: "https://github.com/dougmaitelli/DockDash/edit/master/docs/",
      },
      lastUpdated: true,
      credits: true,
      social: [
        {
          icon: "github",
          label: "DockDash on GitHub",
          href: "https://github.com/dougmaitelli/DockDash",
        },
      ],
      sidebar: [
        { label: "Overview", slug: "" },
        {
          label: "Start here",
          items: [
            { label: "Features", slug: "features" },
            { label: "Getting started", slug: "getting-started" },
            { label: "Security", slug: "security" },
          ],
        },
        {
          label: "How it works",
          items: [
            {
              label: "Service discovery",
              slug: "concepts/service-discovery",
            },
            {
              label: "Kubernetes integration",
              slug: "concepts/kubernetes-integration",
            },
            {
              label: "Health and resources",
              slug: "concepts/health-and-resources",
            },
            {
              label: "Dashboard and topology",
              slug: "concepts/dashboard-and-topology",
            },
            {
              label: "Update monitoring",
              slug: "concepts/update-monitoring",
            },
            {
              label: "Container operations",
              slug: "concepts/container-operations",
            },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Settings reference", slug: "configuration" },
            {
              label: "Authentication",
              slug: "configuration/authentication",
            },
            {
              label: "Notifications",
              slug: "configuration/notifications",
            },
          ],
        },
        {
          label: "Limitations",
          slug: "limitations-and-roadmap",
        },
      ],
    }),
  ],
});
