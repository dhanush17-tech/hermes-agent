import type { Connector, ConnectorScanResult } from "../types.js";

type GitHubRepo = { full_name: string; updated_at: string; description: string | null };
type GitHubIssue = { title: string; html_url: string; state: string };

export class GitHubConnector implements Connector {
  readonly name = "github";

  constructor(private readonly token: string) {}

  async scan(): Promise<ConnectorScanResult> {
    try {
      const [repos, issues] = await Promise.all([
        this.fetchRepos(),
        this.fetchAssignedIssues(),
      ]);

      const items: ConnectorScanResult["items"] = [];

      for (const repo of repos.slice(0, 5)) {
        items.push({
          sourceType: "github",
          externalId: `github:repo:${repo.full_name}`,
          title: repo.full_name,
          content: repo.description ?? "No description",
          metadata: JSON.stringify({ updatedAt: repo.updated_at, method: "github_api" }),
        });
      }

      for (const issue of issues.slice(0, 10)) {
        items.push({
          sourceType: "github",
          externalId: `github:issue:${issue.html_url}`,
          title: issue.title,
          content: issue.state,
          metadata: JSON.stringify({ url: issue.html_url, method: "github_api" }),
        });
      }

      return { connector: this.name, items };
    } catch (err) {
      return {
        connector: this.name,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async fetchRepos(): Promise<GitHubRepo[]> {
    const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=10", {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`GitHub repos ${res.status}`);
    return (await res.json()) as GitHubRepo[];
  }

  private async fetchAssignedIssues(): Promise<GitHubIssue[]> {
    const res = await fetch("https://api.github.com/issues?filter=assigned&state=open&per_page=10", {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return [];
    return (await res.json()) as GitHubIssue[];
  }
}

export function createGitHubConnectorFromEnv(): GitHubConnector | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  return new GitHubConnector(token);
}
