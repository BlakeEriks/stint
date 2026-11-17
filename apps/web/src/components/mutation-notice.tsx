'use client';

import { usePressNotice } from '@stint/client';
import { X } from 'lucide-react';
import { Toast, ToastRegion } from './toast';

/** The newest press notice (`usePressNotice`), as a toast with a dismiss. */
export function MutationNotice() {
  const shown = usePressNotice();

  return (
    <ToastRegion>
      {shown && (
        <Toast>
          <span>{shown.message}</span>
          <button
            type="button"
            onClick={shown.dismiss}
            className="text-muted hover:text-primary"
            aria-label="Dismiss"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </Toast>
      )}
    </ToastRegion>
  );
}
