/**
 * The contract's `text` block, expanded into rows shaped like `assertions`:
 * each text token on each ground it is set on, in both themes. `fg` and `bg`
 * are what the semantic tokens name, so a row resolves like any other.
 */
export const textAssertions = ({ semantic, contract: { text } }) =>
  ['dark', 'light'].flatMap((theme) =>
    text.fg.flatMap((fg) =>
      text.on.map((on) => ({
        fg: semantic[theme][fg],
        bg: semantic[theme][on],
        min: text.min,
        note: `${fg} on ${on}, ${theme}`,
      })),
    ),
  );
