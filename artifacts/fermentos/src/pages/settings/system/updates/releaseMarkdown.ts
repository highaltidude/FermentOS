// Tiny + safe markdown renderer for GitHub release notes. Deliberately not
// pulling in react-markdown — release notes are short, mostly bullets/links/
// inline code, and the bundle cost isn't worth it. We escape HTML first, then
// apply a small whitelist of inline transforms, so even a malicious release
// body can't inject script tags.
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
export function renderReleaseMarkdown(src: string): string {
  // release-please always opens a release body with a heading like
  // "## [1.1.1](compare-url) (2026-08-06)" — that duplicates the tag/name/
  // date already shown in the row header above this body, so drop it before
  // anything else runs. No-op if the body doesn't start with that pattern.
  const body = src.replace(/^\s*#{1,3}\s+.*\(\d{4}-\d{2}-\d{2}\)\s*\n+/, "");
  // Escape first — every transform below operates on already-safe text and
  // emits a fixed set of tags, so nothing user-controlled reaches the DOM raw.
  let html = escapeHtml(body);
  // Fenced code blocks ```...``` (do this before inline so backticks inside
  // aren't mangled).
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre class="text-[10px] font-mono bg-muted/60 border border-border rounded p-2 overflow-auto whitespace-pre-wrap">${code.trim()}</pre>`);
  // Inline code `...`
  html = html.replace(/`([^`\n]+)`/g, '<code class="font-mono text-[11px] bg-muted/60 px-1 py-0.5 rounded">$1</code>');
  // Bold **...**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Markdown links [text](url) — only allow http(s) URLs. PR references
  // (#123) stay prominent; bare commit hashes are secondary metadata, so
  // render them smaller/muted instead of competing equally for attention.
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => {
    const isCommitHash = /^[0-9a-f]{7,40}$/i.test(text);
    const cls = isCommitHash
      ? "font-mono text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted"
      : "text-primary underline";
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${cls}">${text}</a>`;
  });
  // Bare URLs
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, (_m, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${url}</a>`);
  // Headings (### / ## / #) at line start
  html = html.replace(/^###\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  html = html.replace(/^##\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  html = html.replace(/^#\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  // Bullet lines starting with -, *, or +
  html = html.replace(/^[\-*+]\s+(.+)$/gm, '<div class="flex gap-2"><span class="text-muted-foreground">•</span><span>$1</span></div>');
  // Paragraph breaks for double-newlines
  html = html.replace(/\n{2,}/g, '<div class="h-1.5"></div>');
  // Single newlines → <br>
  html = html.replace(/\n/g, "<br>");
  return html;
}
