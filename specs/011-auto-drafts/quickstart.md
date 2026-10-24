# Quickstart: automatic drafts

1. New invoice → Generate: the draft has no number; its PDF shows STINT-000N; reopening keeps it.
2. Delete a draft never opened as PDF: Settings' next number is unchanged.
3. Give a client with work last period a schedule; `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3101/api/v1/cron/drafts`: a draft appears for the period that ended, and one email in Mailpit (127.0.0.1:54324) links to it; running again adds neither.
5. Settings: turn off automatic drafts; run: nothing new.
