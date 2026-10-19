/**
 * The contract's `text` block, expanded into rows shaped like `assertions`:
 * each text token on each ground it is set on, in both themes, then each
 * print ink on the paper it is set on. `fg` and `bg` are token references,
 * so a row resolves like any other.
 */
export const textAssertions = ({ semantic, contract: { text } }) => [
  ...['dark', 'light'].flatMap((theme) =>
    text.fg.flatMap((fg) =>
      text.on.map((on) => ({
        fg: semantic[theme][fg],
        bg: semantic[theme][on],
        min: text.min,
        note: `${fg} on ${on}, ${theme}`,
      })),
    ),
  ),
  ...Object.entries(text.print.on).flatMap(([on, inks]) =>
    inks.map((fg) => ({
      fg: `print.${fg}`,
      bg: `print.${on}`,
      min: text.print.min,
      note: `${fg} on ${on}, print`,
    })),
  ),
];
