'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Map, MapPin } from 'lucide-react';
import { nanoid } from 'nanoid';
import { crowdManagementChatbot } from '@/ai/flows/crowd-management-chatbot.client';
import { cn } from '@/lib/utils';
import { MedicalDraftCard, MissingPersonDraftCard } from './report-drafts';

/** Assistant chat (docs/design/mockups/AttendeeChat.dc.html). */

const WELCOME = {
  id: 'welcome',
  role: 'bot',
  text: 'Hi, I’m the Dristhi assistant. I can get you medical help, report someone who is missing, or show you the nearest washroom, water or exit.',
};

const POI_LABEL = {
  Washroom: 'washroom',
  'Hydration Area': 'drinking water',
  'Cloak Room': 'cloak room',
  'Smoking Zone': 'smoking zone',
  'Lost and Found': 'lost and found desk',
};

const QUICK = [
  {
    label: 'Medical help',
    run: () => [
      { role: 'user', text: 'I need medical help' },
      {
        role: 'bot',
        text: 'Tell me what happened and where you are, then tap Send. If someone is unconscious or not breathing, also call 112.',
        attachment: { kind: 'medical', startEditing: true },
      },
    ],
  },
  {
    label: 'Someone is missing',
    run: () => [
      { role: 'user', text: 'Someone I came with is missing' },
      {
        role: 'bot',
        text: 'I’m sorry. Add a recent photo, what they look like, and where and when you last saw them. Staff start looking as soon as you tap Send.',
        attachment: { kind: 'missing' },
      },
    ],
  },
  {
    label: 'Nearest washroom',
    run: () => [
      { role: 'user', text: 'Where is the nearest washroom?' },
      {
        role: 'bot',
        text: 'Here’s the nearest washroom.',
        attachment: { kind: 'map', poi: 'Washroom', label: 'washroom' },
      },
    ],
  },
  {
    label: 'Drinking water',
    run: () => [
      { role: 'user', text: 'Where can I get water?' },
      {
        role: 'bot',
        text: 'Here’s the nearest drinking water.',
        attachment: { kind: 'map', poi: 'Hydration Area', label: 'drinking water' },
      },
    ],
  },
];

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';

export default function AssistantChat() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  const add = (...items) => setMessages((prev) => [...prev, ...items.map((m) => ({ ...m, id: nanoid() }))]);

  const ask = async (text) => {
    const query = text.trim();
    if (!query || thinking) return;
    const history = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ id: m.id, role: m.role, text: m.text }));
    add({ role: 'user', text: query });
    setInput('');
    setThinking(true);
    try {
      const r = await crowdManagementChatbot({ query, history });
      let attachment;
      if (r.category === 'MEDICAL_EMERGENCY') attachment = { kind: 'medical', info: r.extractedInfo };
      else if (r.category === 'MISSING_PERSON') attachment = { kind: 'missing', info: r.extractedInfo };
      else if (r.category === 'MAP_DIRECTIONS') {
        const poi = r.extractedInfo?.poi ?? null;
        attachment = { kind: 'map', poi, label: poi ? POI_LABEL[poi] : 'venue map' };
      }
      add({ role: 'bot', text: r.response, attachment });
    } catch {
      add({
        role: 'bot',
        text: 'Sorry, I couldn’t reach the assistant. Use the buttons below, or try again in a moment.',
      });
    } finally {
      setThinking(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col lg:mx-0">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="font-display text-[22px] font-semibold">Assistant</h1>
          <p className="text-[13px] text-ds-muted">Nothing reaches the control room until you tap Send.</p>
        </div>
        <Link
          href="/user/map"
          aria-label="Open venue map"
          className={cn(
            'flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-ink-2 hover:bg-ds-divider',
            focusRing,
          )}
        >
          <Map className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      <ol aria-live="polite" aria-label="Conversation" className="flex flex-col gap-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn('flex flex-col gap-3', m.role === 'user' ? 'items-end' : 'items-start')}
          >
            <p
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-[15px] leading-relaxed sm:max-w-[75%]',
                m.role === 'user'
                  ? 'rounded-tr-md bg-ds-accent text-ds-on-accent'
                  : 'rounded-tl-md border border-ds-border bg-ds-surface text-ds-ink',
              )}
            >
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Assistant: '}</span>
              {m.text}
            </p>
            {m.attachment && <AttachmentView a={m.attachment} />}
          </li>
        ))}
        {thinking && (
          <li className="flex items-start">
            <p
              className="flex gap-1 rounded-[18px] rounded-tl-md border border-ds-border bg-ds-surface px-4 py-4"
              aria-label="Assistant is typing"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-bounce rounded-full bg-ds-muted"
                  style={{ animationDelay: `${i * 120}ms` }}
                  aria-hidden
                />
              ))}
            </p>
          </li>
        )}
      </ol>
      <div ref={endRef} className="h-56 flex-none sm:h-4" aria-hidden />

      {/* Composer: fixed above the phone tab bar, sticky at the bottom from 640 px. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t border-ds-border bg-ds-ground px-4 pb-3 pt-2.5 backdrop-blur',
          'sm:sticky sm:bottom-0 sm:-mx-1 sm:rounded-t-2xl sm:border-x sm:px-3',
        )}
      >
        <div className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={thinking}
              onClick={() => add(...q.run())}
              className={cn(
                'min-h-10 flex-none whitespace-nowrap rounded-full border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-ink hover:border-ds-accent disabled:opacity-60',
                focusRing,
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex items-center gap-2.5">
          <label className="flex-1">
            <span className="sr-only">Message</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              enterKeyHint="send"
              className="h-12 w-full rounded-full border border-ds-border bg-ds-surface px-5 text-[15px] text-ds-ink placeholder:text-ds-muted focus:border-ds-accent focus:outline-none focus:ring-2 focus:ring-ds-accent-tint"
            />
          </label>
          <button
            type="submit"
            aria-label="Send message"
            disabled={thinking || !input.trim()}
            className={cn(
              'flex h-12 w-12 flex-none items-center justify-center rounded-full bg-ds-accent text-ds-on-accent hover:opacity-90 disabled:opacity-50',
              focusRing,
            )}
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

function AttachmentView({ a }) {
  if (a.kind === 'medical') {
    return (
      <div className="w-full sm:max-w-[440px]">
        <MedicalDraftCard
          startEditing={a.startEditing}
          initial={{
            details: a.info?.details ?? '',
            where: a.info?.location ?? '',
            urgency: a.info?.urgency ?? 'High',
          }}
        />
      </div>
    );
  }
  if (a.kind === 'missing') {
    return (
      <div className="w-full sm:max-w-[440px]">
        <MissingPersonDraftCard
          initial={{
            name: a.info?.name ?? '',
            description: a.info?.details ?? '',
            lastSeenPlace: a.info?.location ?? '',
            lastSeenTime: /^\d{1,2}:\d{2}$/.test(a.info?.lastSeenTime ?? '')
              ? a.info.lastSeenTime.padStart(5, '0')
              : '',
          }}
        />
      </div>
    );
  }
  return (
    <Link
      href={a.poi ? `/user/map?poi=${encodeURIComponent(a.poi)}` : '/user/map'}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-2xl border border-ds-border bg-ds-surface px-4 py-3 text-[15px] font-semibold text-ds-accent-ink hover:border-ds-accent',
        focusRing,
      )}
    >
      <MapPin className="h-5 w-5 flex-none" strokeWidth={1.75} aria-hidden />
      Show {a.label} on the map
    </Link>
  );
}
