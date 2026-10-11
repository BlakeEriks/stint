// `supabase migration new` writes this UTC timestamp, so two branches collide
// only if both create a migration in the same second. The numbered files
// before it keep their names: they sort first, and production has run them.
const TIMESTAMPED =
  /^20\d\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])[0-5]\d[0-5]\d_[\w-]+\.sql$/;

/**
 * Migrations on main and in this tree, each a Map of filename to SQL, in;
 * one message per problem out. `supabase start` keys a migration on its
 * number and `migrate.mjs` on its filename, so a file on main can't be
 * renamed or edited, and no two files may share a number.
 */
export function migrationProblems(main, current) {
  return [
    ...changedOnMain(main, current),
    ...misnamed(main, current),
    ...sharedVersions(current),
  ];
}

function changedOnMain(main, current) {
  const problems = [];
  for (const [name, sql] of main) {
    if (!current.has(name)) {
      problems.push(
        `${name} is on main and gone here. Production has run it under that name; never rename or delete one.`,
      );
    } else if (current.get(name) !== sql) {
      problems.push(
        `${name} is on main and changed here. Production has run it and won't again; put the change in a new migration.`,
      );
    }
  }
  return problems;
}

// A fresh build applies migrations in name order and production in merge
// order, so a new one must sort after everything on main for both to agree.
function misnamed(main, current) {
  const last = [...main.keys()].sort().at(-1) ?? '';
  const problems = [];
  for (const name of current.keys()) {
    if (main.has(name)) continue;
    if (!TIMESTAMPED.test(name)) {
      problems.push(
        `${name} isn't named by timestamp. Create it with \`supabase migration new <name>\`.`,
      );
    } else if (name <= last) {
      problems.push(
        `${name} sorts before ${last}, already on main. Recreate it with \`supabase migration new <name>\` so it runs last everywhere.`,
      );
    }
  }
  return problems;
}

function sharedVersions(current) {
  const problems = [];
  const byVersion = new Map();
  for (const name of current.keys()) {
    const version = name.split('_')[0];
    if (byVersion.has(version)) {
      problems.push(`${byVersion.get(version)} and ${name} share a version.`);
    }
    byVersion.set(version, name);
  }
  return problems;
}
