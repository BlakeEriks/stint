'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, Loader2, MessageSquare } from 'lucide-react';
import { FEEDBACK_MAX } from '@stint/schema';
import { uuidv7 } from '@stint/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { textareaClass } from './field';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { api, ApiError } from '@/lib/client/api';

const FAILED = 'Couldn’t send. Your message is still here. Try again.';

/**
 * The header's Feedback button and the form it opens (#205).
 *
 * The user types only the message. The screen, the client and the version go
 * with it, so a report never needs a reply asking where it happened. It lands
 * in the `feedback` table, which Blake reads in the Supabase dashboard.
 *
 * Nothing to predict, so Send is pending until the server answers, and a
 * refusal stays in the open form beside the text it would have lost.
 */
export function Feedback() {
  const screen = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  /* Made once per message, so a retry after a failure stores it once. */
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    if (!thanked) return;
    const t = setTimeout(() => setThanked(false), 4000);
    return () => clearTimeout(t);
  }, [thanked]);

  const send = useOptimisticMutation({
    queryKey: () => ['feedback'],
    inline: true,
    mutationFn: () =>
      api.sendFeedback({
        id,
        message,
        screen,
        client: 'web',
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
      }),
    onSuccess: () => {
      setOpen(false);
      setMessage('');
      setThanked(true);
    },
    // A server error has no reason worth showing; a refusal does.
    onError: (e) =>
      setError(e instanceof ApiError && e.status < 500 ? e.message : FAILED),
  });

  const blank = message.trim() === '';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // A closed form's message is gone: it is a note, not a record.
          setMessage('');
          setId(uuidv7());
          setError(null);
          setThanked(false);
          setOpen(true);
        }}
        className={`flex flex-none items-center gap-2 rounded-md px-2.5 py-2 type-meta outline-none
                    hover:bg-surface-hover hover:text-muted focus-visible:ring-2 focus-visible:ring-edge-focus
                    ${open ? 'bg-surface-hover text-primary' : 'text-subtle'}`}
      >
        <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} />
        Feedback
      </button>

      <Dialog
        open={open}
        // Closed while it waits, a refusal would show nowhere: it is inline.
        onOpenChange={(next) => send.isPending || setOpen(next)}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (blank) return;
              setError(null);
              send.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                A fault, a question or something you wish it did. It goes
                straight to us.
              </DialogDescription>
            </DialogHeader>

            <textarea
              aria-label="Message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              readOnly={send.isPending}
              maxLength={FEEDBACK_MAX}
              placeholder="What’s in your way?"
              className={textareaClass}
            />

            {error ? (
              <p role="alert" className="type-support text-danger">
                {error}
              </p>
            ) : null}

            <DialogFooter className="items-center sm:justify-between">
              <span className="type-meta text-subtle">
                {message.length.toLocaleString('en-US')} /{' '}
                {FEEDBACK_MAX.toLocaleString('en-US')} · Sent with this screen
                and version
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={send.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  disabled={blank || send.isPending}
                >
                  {send.isPending ? (
                    <>
                      <Loader2 aria-hidden className="animate-spin" />
                      Sending
                    </>
                  ) : (
                    'Send'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {thanked ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
        >
          <div className="flex items-center gap-3 rounded-lg border border-edge-default bg-surface-elevated px-4 py-2 type-support text-primary shadow-float">
            <Check aria-hidden className="size-4 text-success" />
            Thanks. Feedback sent.
          </div>
        </div>
      ) : null}
    </>
  );
}
