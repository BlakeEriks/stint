'use client';

import { useMemo, useState } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useQuery } from '@tanstack/react-query';
import { ArchiveRestore, ChevronRight, Pencil, Plus } from 'lucide-react';
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
import { BILLING_PERIOD_LABELS } from '@stint/core';
import { ProjectRate, rateLabel } from './project-rate';
import { useRestoreClient } from '@/lib/client/use-archive-client';
import { useRestoreProject } from '@/lib/client/use-restore-project';

/**
 * Every client as a card holding its projects and the expenses it owes back
 * — the one place all three are managed, and the only screen that reaches a
 * project with no client.
 *
 * It is for editing, not reporting: what is owed and how many hours went in
 * belong to a reports screen. Every action is the Edit on the thing it
 * changes, opening a dialog; a project or an expense is added from the card
 * it belongs to. Archived clients wait below the active ones in a collapsed
 * section whose count stays visible, so nothing looks deleted; each archived
 * row restores in one press. The designs are `specs/002-clients-nav/design/`
 * and `specs/002-reimbursable-expenses/design/`.
 */
export function ClientList() {
  /* `null` is a new project for no client; a string, for that client. */
  const [creating, setCreating] = useState<string | null | undefined>();
  const editing = useDialog<Project>();
  const editingClient = useDialog<Client>();
  const addingExpense = useDialog<Client>();
  const [addingClient, setAddingClient] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const clientQuery = useQuery({
    queryKey: keys.clients({ archived: true }),
    /* Archived clients too: otherwise their projects would fall into
       "No client", which would be a lie. */
    queryFn: () => api.clients({ includeArchived: true }),
  });
  const projectQuery = useAllProjects();
  const settings = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });
  const defaultRate = settings.data?.defaultHourlyRate ?? null;
  /* One read for every card: recurring, waiting, and on an unpaid invoice. */
  const expenses = useQuery({
    queryKey: keys.expenses(),
    queryFn: () => api.expenses(),
  });
  const expenseData = expenses.data;
  const expensesOf = useMemo(() => {
    const by = new Map<string, Expense[]>();
    for (const e of expenseData?.expenses ?? [])
      by.set(e.clientId, [...(by.get(e.clientId) ?? []), e]);
    return by;
  }, [expenseData]);

  const restoreClient = useRestoreClient();
  const restoreProject = useRestoreProject(
    clientQuery.data?.clients.filter((c) => !c.archivedAt),
  );

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
        <Button onClick={() => setAddingClient(true)}>
          <Plus aria-hidden strokeWidth={2.25} />
          Add client
        </Button>
      </header>

      <Listing
        query={{
          data: groups,
          error: clientQuery.error ?? projectQuery.error,
          isLoading: clientQuery.isLoading || projectQuery.isLoading,
        }}
        also={[settings, expenses]}
        empty="No clients yet. Add one to set a rate and bill against it."
      >
        {(shown) => {
          const card = (g: Group) => (
            <Card
              key={g.client?.id ?? '__none__'}
              client={g.client}
              defaultRate={defaultRate}
              onEditClient={editingClient.show}
              onRestoreClient={restoreClient.mutate}
              onAdd={() => setCreating(g.client?.id ?? null)}
              onAddExpense={() => g.client && addingExpense.show(g.client)}
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
                  onEdit={() => editing.show(project)}
                  onRestore={() => restoreProject.mutate(project)}
                />
              ))}
            </Card>
          );
          const archived = shown.filter((g) => g.client?.archivedAt);
          return (
            <div className="flex flex-col gap-3">
              {shown.filter((g) => !g.client?.archivedAt).map(card)}
              {archived.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    aria-expanded={showArchived}
                    className={`${rowButton} ${rowBleed} flex items-center gap-1.5 py-2 type-label text-muted`}
                  >
                    <ChevronRight
                      aria-hidden
                      strokeWidth={2}
                      className={`size-3.5 transition-transform motion-reduce:transition-none ${showArchived ? 'rotate-90' : ''}`}
                    />
                    Archived ({archived.length})
                  </button>
                  {showArchived ? archived.map(card) : null}
                </>
              ) : null}
            </div>
          );
        }}
      </Listing>

      <ProjectDialog
        open={creating !== undefined}
        onOpenChange={(open) => !open && setCreating(undefined)}
        defaultClientId={creating}
      />
      <ProjectDialog
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        existing={editing.subject}
      />
      {addingExpense.subject ? (
        <ExpenseDialog
          open={addingExpense.open}
          onOpenChange={addingExpense.onOpenChange}
          client={addingExpense.subject}
        />
      ) : null}
      {editingClient.subject ? (
        <ClientDialog
          open={editingClient.open}
          onOpenChange={editingClient.onOpenChange}
          client={editingClient.subject}
        />
      ) : null}
      <ClientDialog open={addingClient} onOpenChange={setAddingClient} />
    </Page>
  );
}

function clientSummary(client: Client | null, defaultRate: number | null) {
  if (!client) return 'Not assigned to a client';
  return [
    clientRate(client, defaultRate),
    // Like the rate: an archived client bills nothing new.
    client.billingSchedule && client.archivedAt == null
      ? `Billed ${BILLING_PERIOD_LABELS[client.billingSchedule.period].toLowerCase()}`
      : null,
    client.email,
  ]
    .filter(Boolean)
    .join(' · ');
}

function clientRate(client: Client, defaultRate: number | null) {
  /* An archived client bills nothing new, so no rate. */
  if (client.archivedAt != null) return null;
  if (client.hourlyRate != null) return rateLabel(client.hourlyRate, client);
  if (defaultRate != null) return `${rateLabel(defaultRate, client)} · default`;
  return 'No rate';
}

/**
 * One client and its projects. The spine down the left edge is the client's
 * color, repeated as each row's dot, so the belonging is drawn rather than
 * labeled — no "Projects" subheader.
 *
 * "No client" is a grouping, not a record: dashed, with no rate or Edit.
 * Nor is it "Internal work" — null also covers work not yet assigned
 * to a client and speculative work, and only `isBillableDefault` tells them
 * apart.
 */
function Card({
  client,
  defaultRate,
  onEditClient,
  onRestoreClient,
  onAdd,
  onAddExpense,
  expenses,
  children,
}: {
  client: Client | null;
  defaultRate: number | null;
  onEditClient: (client: Client) => void;
  onRestoreClient: (client: Client) => void;
  onAdd: () => void;
  onAddExpense: () => void;
  /** The card's Expenses, below its projects. "No client" has none: an
   *  expense is always some client's to pay back. */
  expenses: React.ReactNode;
  children: React.ReactNode[];
}) {
  const spine = client?.color ?? INTERNAL_SWATCH;
  const archived = client?.archivedAt != null;
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
              className={`truncate type-heading ${client && !archived ? 'text-strong' : 'text-muted'}`}
            >
              {client ? client.name : 'No client'}
            </h2>
            {archived ? (
              <span className="flex-none type-badge text-subtle">Archived</span>
            ) : null}
          </div>
          <p className="truncate type-support text-subtle">
            {clientSummary(client, defaultRate)}
          </p>
        </div>
        {client && archived ? (
          <RestoreButton
            name={client.name}
            onRestore={() => onRestoreClient(client)}
          />
        ) : null}
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
        <CardActions
          client={client}
          onAdd={onAdd}
          onAddExpense={onAddExpense}
        />
      </div>
    </section>
  );
}

function CardActions({
  client,
  onAdd,
  onAddExpense,
}: {
  client: Client | null;
  onAdd: () => void;
  onAddExpense: () => void;
}) {
  return (
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
  );
}

function Row({
  project,
  client,
  defaultRate,
  onEdit,
  onRestore,
}: {
  project: Project;
  client: Client | null;
  defaultRate: number | null;
  onEdit: () => void;
  onRestore: () => void;
}) {
  const archived = project.archivedAt != null;
  /* Under an archived client a project bills nothing new either. */
  const recedes = archived || client?.archivedAt != null;
  /* The row is the button, so a card has one Edit (the client's) rather
     than one per project; the pencil says it opens where there's no hover
     (.claude/rules/web-ui.md). An archived row's Restore sits beside it,
     since a button cannot hold another. */
  return (
    <li className={archived ? 'flex items-center gap-1' : undefined}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${project.name}`}
        className={`${rowButton} ${archived ? '-ml-2 min-w-0 flex-1' : rowBleed} flex items-center gap-3 py-2.5`}
      >
        {/* An archived row recedes: it bills nothing new, so its name steps
            down a shade, its rate goes, and the badge sits with the name. */}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`truncate type-control ${recedes ? 'text-muted' : 'text-strong'}`}
          >
            {project.name}
          </span>
          {archived ? (
            <span className="flex-none type-badge text-subtle">Archived</span>
          ) : null}
        </span>
        <span className="flex-none text-right">
          {recedes ? null : (
            <ProjectRate
              project={project}
              client={client}
              userDefaultRate={defaultRate}
            />
          )}
        </span>
        <Pencil
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 flex-none text-subtle group-hover:text-strong"
        />
      </button>
      {archived ? (
        <RestoreButton name={project.name} onRestore={onRestore} />
      ) : null}
    </li>
  );
}

/** An archived row's Restore: one press, predicted, so the row is back
    among the active at once (Constitution VI). */
function RestoreButton({
  name,
  onRestore,
}: {
  name: string;
  onRestore: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onRestore}
      aria-label={`Restore ${name}`}
      className="flex-none"
    >
      <ArchiveRestore aria-hidden strokeWidth={1.75} />
      <span className="max-sm:hidden">Restore</span>
    </Button>
  );
}

interface Group {
  client: Client | null;
  projects: Project[];
}

/**
 * Active clients in name order, then "No client", then archived clients in
 * name order; within each, active projects A–Z, then archived ones.
 *
 * "No client" is last of the active because it is the residue, not a peer:
 * everything above is a named engagement and this is what did not belong to
 * one. Every client shows, even one with no projects: this is the only list
 * of clients.
 */
function group(projects: Project[], clients: Client[]): Group[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const ordered = [...projects].sort(
    (a, b) =>
      Number(a.archivedAt != null) - Number(b.archivedAt != null) ||
      a.name.localeCompare(b.name),
  );
  const named = (archived: boolean): Group[] =>
    clients
      .filter((c) => (c.archivedAt != null) === archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((client) => ({
        client,
        projects: ordered.filter((p) => p.clientId === client.id),
      }));

  /* A project whose client is missing (not merely archived) would otherwise
     vanish. Keep it visible under "No client" rather than dropping a row. */
  const orphaned = ordered.filter(
    (p) => p.clientId == null || !byId.has(p.clientId),
  );
  return [
    ...named(false),
    ...(orphaned.length > 0 ? [{ client: null, projects: orphaned }] : []),
    ...named(true),
  ];
}
