'use client';

import { useFailedPress } from '@stint/client';
import { useState } from 'react';
import { Toast } from './toast';

/** The newest failed press (`useFailedPress`), as a refusal toast. */
export function MutationNotice() {
  const shown = useFailedPress();
  /* Kept past a dismiss, so the toast has its words while it leaves. */
  const [message, setMessage] = useState('');
  if (shown && shown.message !== message) setMessage(shown.message);

  return (
    <Toast
      key={message}
      tone="refusal"
      open={shown !== null}
      onOpenChange={(open) => open || shown?.dismiss()}
    >
      {message}
    </Toast>
  );
}
