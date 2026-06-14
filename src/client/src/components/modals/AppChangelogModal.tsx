import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkEmoji from "remark-emoji";

import type { ChangelogRelease } from "@shared";

import { Button } from "@/components/ui/Button";

import { BaseModal, ModalActions, ModalActionsRight } from "./BaseModal";

import "../Changelog.css";

interface AppChangelogModalProps {
  release: ChangelogRelease;
  onClose: () => void;
}

export function AppChangelogModal({ release, onClose }: AppChangelogModalProps) {
  return (
    <BaseModal
      title={`What's new in ${release.version}`}
      onClose={onClose}
      width={640}
      actions={
        <ModalActions>
          <ModalActionsRight>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button asChild>
              <a href={release.htmlUrl} target="_blank" rel="noreferrer">
                View on GitHub ↗
              </a>
            </Button>
          </ModalActionsRight>
        </ModalActions>
      }
    >
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <span className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 text-primary">
          {release.version}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(release.publishedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="changelog-body max-h-[60vh] overflow-y-auto">
        <ReactMarkdown remarkPlugins={[remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
          {release.body || "_No release notes provided._"}
        </ReactMarkdown>
      </div>
    </BaseModal>
  );
}
