'use client';

import { useFailedPress } from '@stint/client';
import { X } from 'lucide-react';
import { Toast, ToastRegion } from './toast';

/** The newest failed press (`useFailedPress`), as a toast with a dismiss. */
export function MutationNotice() {
  const shown = useFailedPress();

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
