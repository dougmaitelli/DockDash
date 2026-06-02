import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkEmoji from "remark-emoji";
import styled from "styled-components";
import { colors } from "../../styles/vars";
import { serviceApi } from "../../services/api";
import type { ChangelogResponse } from "@shared";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  flex: 1;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const VersionBadge = styled.span`
  font-size: 0.75rem;
  font-family: "SF Mono", "Fira Code", monospace;
  background: ${colors.bgPrimary};
  border: 1px solid ${colors.border};
  border-radius: 4px;
  padding: 2px 8px;
  color: ${colors.accentBlue};
`;

const DateLabel = styled.span`
  font-size: 0.75rem;
  color: ${colors.textMuted};
`;

const GithubLink = styled.a`
  font-size: 0.75rem;
  color: ${colors.accentBlue};
  text-decoration: none;
  margin-left: auto;

  &:hover {
    text-decoration: underline;
  }
`;

const MarkdownBody = styled.div`
  font-size: 0.82rem;
  color: ${colors.textSecondary};
  line-height: 1.6;
  overflow-y: auto;
  flex: 1;

  h1,
  h2,
  h3,
  h4 {
    color: ${colors.textPrimary};
    margin: 14px 0 6px;
    font-size: 0.9rem;
  }

  p {
    margin: 4px 0;
  }

  ul,
  ol {
    padding-left: 18px;
    margin: 4px 0;
  }

  code {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.78rem;
    background: ${colors.bgPrimary};
    border-radius: 3px;
    padding: 1px 5px;
  }

  pre code {
    display: block;
    padding: 10px;
    overflow-x: auto;
  }

  a {
    color: ${colors.accentBlue};
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }

  hr {
    border-color: ${colors.border};
    margin: 10px 0;
  }
`;

const Message = styled.div`
  font-size: 0.82rem;
  color: ${colors.textMuted};
  padding: 20px 0;
  text-align: center;
`;

interface ChangelogProps {
  serviceId: string;
}

export function Changelog({ serviceId }: ChangelogProps) {
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    serviceApi
      .getChangelog(serviceId)
      .then((res) => setData(res.data))
      .catch(() => setData({ available: false, reason: "Failed to fetch changelog" }))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) return <Message>Loading…</Message>;

  if (!data || !data.available) {
    return <Message>{data?.reason ?? "Changelog not available"}</Message>;
  }

  const { release } = data;

  return (
    <Wrap>
      <Meta>
        <VersionBadge>{release.version}</VersionBadge>
        <DateLabel>{new Date(release.publishedAt).toLocaleDateString()}</DateLabel>
        <GithubLink href={release.htmlUrl} target="_blank" rel="noreferrer">
          View on GitHub ↗
        </GithubLink>
      </Meta>
      <MarkdownBody>
        <ReactMarkdown remarkPlugins={[remarkEmoji]}>
          {release.body || "_No release notes provided._"}
        </ReactMarkdown>
      </MarkdownBody>
    </Wrap>
  );
}
