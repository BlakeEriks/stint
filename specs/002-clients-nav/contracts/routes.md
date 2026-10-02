# Routes

| Address | Result |
| --- | --- |
| `/clients` | Grouped screen, Active |
| `/clients?status=archived` | Grouped screen, Archived |
| `/clients?status=all` | Grouped screen, All |
| `/projects[?status=…]` | 308 to `/clients[?status=…]` |
| `/clients/[id]`, `/clients/new`, `/clients/[id]/edit` | Unchanged |

The nav **Sections** lists Home, Calendar, Clients, Invoices, Settings.
