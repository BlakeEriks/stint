# Quickstart: automatic drafts

1. New invoice → Generate: the draft has no number; its PDF shows STINT-000N; reopening keeps it.
2. Delete a draft never opened as PDF: Settings' next number is unchanged.
3. Give a client a schedule; `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3101/api/v1/cron/drafts`: a draft appears for the current period; running again adds none.
4. Set that draft's period in the past in the DB and run again: one email in Mailpit (127.0.0.1:54324) with a link to it; again: none.
5. Settings: turn off automatic drafts; run: nothing new.
