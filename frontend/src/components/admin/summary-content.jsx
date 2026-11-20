'use client';

import { Fragment } from 'react';
import { StatusBadge } from '@/components/admin/status-badge';

/**
 * Renders the dashboard summary (Gemini's markdown, or the raw status brief when no AI key is set)
 * as sections with bullet rows. Handles `**Heading:**` / `## Heading` lines, `-` / `*` bullets and
 * `**bold**` inside text. CRITICAL / WARNING / NORMAL words become status badges.
 */

const NO_KEY_PREFIX = /^AI key not configured\s*[–-]\s*raw status:\s*/i;
const LEVEL_WORD = /\b(CRITICAL|WARNING|NORMAL)\b/;
const TONE = { CRITICAL: 'critical', WARNING: 'warning', NORMAL: 'normal' };

function parse(text) {
  const sections = [];
  let current = null;
  const ensure = () => {
    if (!current) {
      current = { title: null, items: [], paragraphs: [] };
      sections.push(current);
    }
    return current;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Short lines like "**Alerts:**", "## Alerts" or "Alerts:" are headings; a long sentence ending
    // in ":" ("Here is the summary based on the data:") is an intro paragraph.
    const heading =
      line.match(/^#{1,4}\s+(.+?):?$/) ||
      line.match(/^\*\*([^*]{1,40}?):?\*\*:?$/) ||
      (line.length <= 40 ? line.match(/^([^*]+?):$/) : null);
    const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
    if (heading && !bullet) {
      current = { title: heading[1].replace(/\*\*/g, '').replace(/:$/, ''), items: [], paragraphs: [] };
      sections.push(current);
    } else if (bullet) {
      ensure().items.push(bullet[1]);
    } else {
      ensure().paragraphs.push(line);
    }
  }
  return sections;
}

/** `**bold**` → <strong>, and the first level word → a badge at the end of the row. */
function Inline({ text }) {
  const level = text.match(LEVEL_WORD)?.[1];
  // "**Lobby**: CRITICAL alert with a count of 255." → "**Lobby** · 255 people" + Critical badge.
  // "**CRITICAL: Lobby** — ..." → "**Lobby** — ..." (the label moves into the badge).
  const clean = text
    .replace(/:\s*(CRITICAL|WARNING|NORMAL) alert with a count of (\d+)\.?/i, ' · $2 people')
    .replace(/\b(CRITICAL|WARNING|NORMAL)\s*:\s*/g, '')
    .replace(/^(\*\*)?\s*:\s*/, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
  const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span>
        {parts.map((p, i) =>
          p.startsWith('**') ? (
            <strong key={i} className="font-semibold text-ds-ink">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <Fragment key={i}>{p.replace(/\s{2,}/g, ' ')}</Fragment>
          ),
        )}
      </span>
      {level && <StatusBadge tone={TONE[level]}>{level[0] + level.slice(1).toLowerCase()}</StatusBadge>}
    </span>
  );
}

export function SummaryContent({ text }) {
  if (!text) return null;
  const noKey = NO_KEY_PREFIX.test(text);
  const sections = parse(text.replace(NO_KEY_PREFIX, ''));

  return (
    <div className="space-y-3">
      {noKey && (
        <p className="rounded-xl bg-ds-warning-tint px-3 py-2 text-xs text-ds-warning">
          AI summary is off (no Gemini key). Showing the live status instead.
        </p>
      )}
      {sections.map((s, i) => (
        <section key={i} className="rounded-xl border border-ds-border bg-ds-surface p-3">
          {s.title && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-muted">{s.title}</h3>
          )}
          {s.paragraphs.map((p, j) => (
            <p key={j} className="text-sm text-ds-ink-2">
              <Inline text={p} />
            </p>
          ))}
          {s.items.length > 0 && (
            <ul className="divide-y divide-ds-divider">
              {s.items.map((item, j) => (
                <li key={j} className="py-2 text-sm text-ds-ink-2 first:pt-0 last:pb-0">
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
