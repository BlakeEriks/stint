'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { formatCurrency, resolveRate, resolveRateSource } from '@stint/core';
import { Button } from '@/components/ui/button';
import { api, type Client, type Expense, type Project } from '@/lib/client/api';
import {
  INTERNAL_SWATCH,
  useAllProjects,
} from '@/lib/client/use-project-colors';
import { Listing, Page } from './page';
import { Pip } from './home-shell';
import { ClientDialog } from './client-dialog';
import { ProjectDialog } from './project-dialog';
import { ClientExpenses } from './client-expenses';
import { ExpenseDialog } from './expense-dialog';
import { keys } from '@/lib/client/query-keys';
import { rowBleed, rowButton } from './row-button';

/**
 * Every client as a card holding its projects and the expenses it owes back
 * — the one place all three are managed, and the only screen that reaches a
 * project with no client, since there is no client page to open for one.
 *
 * It is for editing, not reporting: what is owed and how many hours went in
 * belong to a reports screen. Every action is the Edit on the thing it
 * changes, opening a dialog; a project or an expense is added from the card
 * it belongs to. Archived clients and projects show with their badge: there
 * is no filter. The designs are `specs/002-clients-nav/design/` and
 * `specs/002-reimbursable-expenses/design/`.
 */
export function ClientList() {
  /* `null` is a new project for no client; a string, for that client. */
  const [creating, setCreating] = useState<string | null | undefined>();
  const [editing, setEditing] = useState<Project | undefined>();
  const [editingClient, setEditingClient] = useState<Client | undefined>();
  const [addingExpense, setAddingExpense] = useState<Client | undefined>();

  const clientQuery = useQuery({
    queryKey: keys.clients({ archived: true }),
    /* Archived clients too: otherwise their projects would fall into
       "No client", which would be a lie. */
    queryFn: () => api.clients({ includeArchived: true }),
  });
  const projectQuery = useAllProjects();
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });
  const defaultRate = settings?.defaultHourlyRate ?? null;
  /* One read for every card: recurring, waiting, and on an unpaid invoice. */
  const { data: expenseData } = useQuery({
    queryKey: keys.expenses(),
    queryFn: () => api.expenses(),
  });
  const expensesOf = useMemo(() => {
    const by = new Map<string, Expense[]>();
    for (const e of expenseData?.expenses ?? [])
      by.set(e.clientId, [...(by.get(e.clientId) ?? []), e]);
    return by;
  }, [expenseData]);

  const groups = useMemo(
    () =>
      clientQuery.data && projectQuery.data
        ? group(projectQuery.data.projects, clientQuery.data.clients)
        : undefined,
    [clientQuery.data, projectQuery.data],
  );

  return (
    <Page>
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="type-title text-strong">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">
            <Plus aria-hidden strokeWidth={2.25} />
            Add client
          </Link>
        </Button>
      </header>

      <Listing
        query={{
          data: groups,
          error: clientQuery.error ?? projectQuery.error,
          isLoading: clientQuery.isLoading || projectQuery.isLoading,
        }}
        empty="No clients yet. Add one to set a rate and bill against it."
      >
        {(shown) => (
          <div className="flex flex-col gap-3">
            {shown.map((g) => (
              <Card
                key={g.client?.id ?? '__none__'}
                client={g.client}
                defaultRate={defaultRate}
                onEditClient={setEditingClient}
                onAdd={() => setCreating(g.client?.id ?? null)}
                onAddExpense={() => g.client && setAddingExpense(g.client)}
                expenses={
                  g.client ? (
                    <ClientExpenses
                      client={g.client}
                      expenses={expensesOf.get(g.client.id) ?? []}
                    />
                  ) : null
                }
              >
                {g.projects.map((project) => (
                  <Row
                    key={project.id}
                    project={project}
                    client={g.client}
                    defaultRate={defaultRate}
                    onEdit={() => setEditing(project)}
                  />
                ))}
              </Card>
            ))}
          </div>
        )}
      </Listing>

      <ProjectDialog
        open={creating !== undefined}
        onOpenChange={(open) => !open && setCreating(undefined)}
        defaultClientId={creating}
      />
      <ProjectDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        existing={editing}
      />
      {addingExpense ? (
        <ExpenseDialog
          open
          onOpenChange={(open) => !open && setAddingExpense(undefined)}
          client={addingExpense}
        />
      ) : null}
      {editingClient ? (
        <ClientDialog
          open
          onOpenChange={(open) => !open && setEditingClient(undefined)}
          client={editingClient}
        />
      ) : null}
    </Page>
  );
}

const rateLabel = (rate: number, client: Client | null) =>
  `${formatCurrency(rate, client?.currency ?? undefined)}/h`;

/**
 * One client and its projects. The spine down the left edge is the client's
 * color, repeated as each row's dot, so the belonging is drawn rather than
 * labeled — no "Projects" subheader.
 *
 * "No client" is a grouping, not a record: dashed, with no rate, link or
 * Edit. Nor is it "Internal work" — null also covers work not yet assigned
 * to a client and speculative work, and only `isBillableDefault` tells them
 * apart.
 */
function Card({
  client,
  defaultRate,
  onEditClient,
  onAdd,
  onAddExpense,
  expenses,
  children,
}: {
  client: Client | null;
  defaultRate: number | null;
  onEditClient: (client: Client) => void;
  onAdd: () => void;
  onAddExpense: () => void;
  /** The card's Expenses, below its projects. "No client" has none: an
   *  expense is always some client's to pay back. */
  expenses: React.ReactNode;
  children: React.ReactNode[];
}) {
  const spine = client?.color ?? INTERNAL_SWATCH;
  return (
    <section
      className={`rounded-lg border ${
        client
          ? 'border-edge-subtle bg-surface-elevated'
          : 'border-dashed border-edge-default'
      }`}
      style={client ? { boxShadow: `inset 3px 0 0 ${spine}` } : undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* A flex box, not bare inline: the dot sizes itself only as a flex
            or block item. */}
        <span className="flex pt-[7px]">
          <Pip color={client?.color} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2
              className={`truncate type-heading ${client ? 'text-strong' : 'text-muted'}`}
            >
              {client ? (
                <Link
                  href={`/clients/${client.id}`}
                  className="hover:underline hover:underline-offset-4"
                >
                  {client.name}
                </Link>
              ) : (
                'No client'
              )}
            </h2>
            {client?.archivedAt ? (
              <span className="flex-none type-badge text-subtle">Archived</span>
            ) : null}
          </div>
          <p className="truncate type-support text-subtle">
            {client
              ? [
                  client.hourlyRate != null
                    ? rateLabel(client.hourlyRate, client)
                    : defaultRate != null
                      ? `${rateLabel(defaultRate, client)} · default`
                      : 'No rate',
                  client.email,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Not assigned to a client'}
          </p>
        </div>
        {client ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditClient(client)}
            aria-label={`Edit ${client.name}`}
            className="flex-none"
          >
            <Pencil aria-hidden strokeWidth={1.75} />
            {/* The pencil alone on a phone, where the name needs the width;
                the button's aria-label names it either way. */}
            <span className="max-sm:hidden">Edit</span>
          </Button>
        ) : null}
      </div>

      {/* Rows start where the client's name does — the header's padding,
          its 9px pip and the gap after it — so they read as the client's,
          not its siblings. Only the left edge moves; amounts stay right. */}
      <div className="border-t border-edge-subtle pt-1 pr-4 pb-2 pl-[calc(1rem+9px+0.75rem)]">
        {children.length > 0 ? (
          <ul className="divide-y divide-edge-grid">{children}</ul>
        ) : (
          <p className="pt-2.5 pb-0.5 type-support text-subtle">
            No projects yet.
          </p>
        )}
        {expenses}
        {/* Side by side at the card's foot. Each names where it lands; its
            dialog opens with this client chosen. */}
        <div className="-mx-2 mt-1 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdd}
            aria-label={
              client ? `Project for ${client.name}` : 'Project with no client'
            }
            className="text-muted"
          >
            <Plus aria-hidden strokeWidth={2.25} />
            Project
          </Button>
          {client ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddExpense}
              aria-label={`Expense for ${client.name}`}
              className="text-muted"
            >
              <Plus aria-hidden strokeWidth={2.25} />
              Expense
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const SOURCE = {
  entry: 'own rate',
  project: 'own rate',
  client: 'from client',
  default: 'from default',
  none: '',
} as const;

/**
 * A project: its name, and the rate it bills at with where that rate comes
 * from, so it's plain whether changing the client's rate would move it.
 * `resolveRate` is the function that bills (`@stint/core`).
 */
function Row({
  project,
  client,
  defaultRate,
  onEdit,
}: {
  project: Project;
  client: Client | null;
  defaultRate: number | null;
  onEdit: () => void;
}) {
  const ctx = {
    projectRate: project.hourlyRate,
    clientRate: client?.hourlyRate ?? null,
    userDefaultRate: defaultRate,
  };
  const rate = resolveRate(ctx);
  const archived = project.archivedAt != null;
  /* The row is the button, so a card has one Edit (the client's) rather
     than one per project; the pencil says it opens where there's no hover
     (.claude/rules/web-ui.md). */
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${project.name}`}
        className={`${rowButton} ${rowBleed} flex items-center gap-3 py-2.5`}
      >
        {/* An archived row recedes: it bills nothing new, so its name and
            rate step down a shade and the badge sits with the name. */}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`truncate type-control ${archived ? 'text-muted' : 'text-strong'}`}
          >
            {project.name}
          </span>
          {archived ? (
            <span className="flex-none type-badge text-subtle">Archived</span>
          ) : null}
        </span>
        <span className="flex-none text-right">
          {!project.isBillableDefault ? (
            <span className="type-support text-subtle">Non-billable</span>
          ) : rate == null ? (
            /* Not cosmetic: invoicing refuses unrated entries, so this is
               found here rather than at billing. */
            <span className="type-support text-danger">No rate</span>
          ) : (
            <>
              <span
                className={`block type-duration ${archived ? 'text-subtle' : project.hourlyRate != null ? 'text-primary' : 'text-muted'}`}
              >
                {rateLabel(rate, client)}
              </span>
              <span className="block type-meta text-subtle max-sm:hidden">
                {SOURCE[resolveRateSource(ctx)]}
              </span>
            </>
          )}
        </span>
        <Pencil
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 flex-none text-subtle group-hover:text-strong"
        />
      </button>
    </li>
  );
}

interface Group {
  client: Client | null;
  projects: Project[];
}

/**
 * Clients in name order, then "No client" last.
 *
 * Last because it is the residue, not a peer: everything above is a named
 * engagement and this is what did not belong to one. Every client shows,
 * even one with no projects: this is the only list of clients.
 */
function group(projects: Project[], clients: Client[]): Group[] {
  const byId = new Map(clients.map((c) => [c.id, c]));

  const named: Group[] = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((client) => ({
      client,
      projects: projects.filter((p) => p.clientId === client.id),
    }));

  /* A project whose client is missing (not merely archived) would otherwise
     vanish. Keep it visible under "No client" rather than dropping a row. */
  const orphaned = projects.filter(
    (p) => p.clientId == null || !byId.has(p.clientId),
  );
  return orphaned.length > 0
    ? [...named, { client: null, projects: orphaned }]
    : named;
}
