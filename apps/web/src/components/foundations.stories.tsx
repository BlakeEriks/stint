import { projectColors, type } from '@stint/design-tokens';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Wordmark } from './wordmark';

/**
 * The design system itself, drawn from the generated tokens, so it cannot
 * show a value the app does not use. Toggle the theme to see the light ramp.
 */
const meta = {
  title: 'Foundations',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-surface-base p-8 text-primary">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Swatches({ title, names }: { title: string; names: string[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 type-region-head text-subtle">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {names.map((name) => (
          <figure key={name} className="w-32">
            <div
              className="h-14 rounded-md border border-edge-subtle"
              style={{ background: `var(--color-${name})` }}
            />
            <figcaption className="mt-1.5 type-meta text-muted">
              {name}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Depth increases toward what is being read: four planes, then the
    hover and active steps. Green is the one color, and it runs a scale:
    `timer-running` is live, `accent-default` acts, `success` is done. */
export const Color: Story = {
  render: () => (
    <>
      <Swatches
        title="Surfaces"
        names={[
          'surface-recessed',
          'surface-base',
          'surface-primary',
          'surface-elevated',
          'surface-hover',
          'surface-active',
        ]}
      />
      <Swatches title="Text" names={['strong', 'primary', 'muted', 'subtle']} />
      <Swatches
        title="Edges"
        names={[
          'edge-grid',
          'edge-subtle',
          'edge-default',
          'edge-control',
          'edge-focus',
        ]}
      />
      <Swatches
        title="Green"
        names={[
          'timer-running',
          'accent-default',
          'accent-hover',
          'accent-subtle',
          'accent-muted',
          'success',
        ]}
      />
      <Swatches title="Status" names={['danger', 'warning', 'info']} />
      <section>
        <h2 className="mb-3 type-region-head text-subtle">Clients</h2>
        {/* The closed set a client picks from: one lightness and chroma,
            all below the accent. */}
        <div className="flex gap-3">
          {projectColors.map((hex) => (
            <div
              key={hex}
              className="size-10 rounded-full"
              style={{ background: hex }}
            />
          ))}
        </div>
      </section>
    </>
  ),
};

/* Literal, so Tailwind emits every role: a class built from a string at
   runtime compiles to nothing. */
const ROLES: Record<keyof typeof type, string> = {
  timer: 'type-timer',
  title: 'type-title',
  hero: 'type-hero',
  figure: 'type-figure',
  'figure-hero': 'type-figure-hero',
  lede: 'type-lede',
  display: 'type-display',
  section: 'type-section',
  heading: 'type-heading',
  body: 'type-body',
  control: 'type-control',
  support: 'type-support',
  amount: 'type-amount',
  'amount-hero': 'type-amount-hero',
  duration: 'type-duration',
  meta: 'type-meta',
  'meta-strong': 'type-meta-strong',
  wordmark: 'type-wordmark',
  'wordmark-small': 'type-wordmark-small',
  nav: 'type-nav',
  'region-head': 'type-region-head',
  label: 'type-label',
  badge: 'type-badge',
};

/** Every role, set in itself. A size the scale lacks is a new role with a
    reason; `pnpm check:type` rejects anything off it. */
export const Type: Story = {
  render: () => (
    <table className="w-full">
      <tbody>
        {Object.entries(ROLES).map(([role, className]) => {
          const spec = type[role as keyof typeof type];
          return (
            <tr key={role} className="border-t border-edge-subtle">
              <td className="w-48 py-3 align-baseline type-meta text-subtle">
                {role}
                <br />
                {spec.family} {spec.size}px {spec.weight}
              </td>
              <td className={`py-3 align-baseline text-strong ${className}`}>
                {role.includes('amount') || role.includes('figure')
                  ? '$12,495.32'
                  : role === 'timer' || role === 'duration'
                    ? '1:45:00'
                    : 'Invoice what you worked'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  ),
};

/** `|Stint|`: the bounds are the `brand.mark` token, one drawing across the
    web and macOS. */
export const Mark: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-8">
      <Wordmark />
      <Wordmark size="small" />
    </div>
  ),
};
