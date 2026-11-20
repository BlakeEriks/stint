import { markOutline, theme } from '@stint/design-tokens';
import { ImageResponse } from 'next/og';
import { MarkOutline } from '@/components/mark-outline';

/* The mark for the sign-in email (`supabase/templates/magic_link.html`),
   which can draw neither an inline SVG nor the app's font. A PNG because
   Gmail shows no SVG image, on a clear ground because the email paints its
   own. The `.png` keeps it out of the proxy's matcher, so a mail client
   needs no session. */

/* The email shows it at a third of this, for a dense screen. */
const SIZE = 57;

export function GET() {
  return new ImageResponse(
    <MarkOutline
      size={SIZE}
      bounds={theme.dark.mark}
      name={theme.dark['text-strong']}
    />,
    {
      width: Math.ceil((markOutline.width / 1000) * SIZE),
      height: Math.ceil((markOutline.height / 1000) * SIZE),
    },
  );
}
