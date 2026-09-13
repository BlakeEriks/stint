import { LegalPage, Clause, legalMetadata } from '../landing/legal';

export const metadata = legalMetadata('Privacy');

/**
 * FIRST DRAFT — not reviewed by a lawyer.
 *
 * It describes what the app actually does today, which is the part worth
 * getting right first: a policy that promises something the code does not do
 * is worse than no policy. Have it reviewed before launch, and revisit it the
 * moment analytics, a mailing list or a payment processor is added, because
 * each of those changes the answers below.
 */
export default function Page() {
  return (
    <LegalPage title="Privacy" updated="September 2026">
      <Clause heading="The short version">
        <p>
          Stint holds the data you put into it &mdash; your hours, your rates,
          your clients and the invoices you generate. It is not sold, it is not
          shared with advertisers, and it is not used to train anything. You can
          export all of it, or delete your account, whenever you want.
        </p>
      </Clause>

      <Clause heading="What is collected">
        <p>
          <strong className="text-primary">Your account:</strong> an email
          address. There is no password &mdash; signing in sends a one-time link
          to that address.
        </p>
        <p>
          <strong className="text-primary">What you enter:</strong> time
          entries, clients, projects, hourly rates, invoice details and the
          payment details you choose to put on your invoices.
        </p>
        <p>
          <strong className="text-primary">Ordinary server logs:</strong> IP
          address, browser user agent and timestamps, kept for a short period
          for security and debugging.
        </p>
        <p>
          There is no advertising, no tracking pixel, and no third-party
          analytics that follows you between sites.
        </p>
      </Clause>

      <Clause heading="What it is used for">
        <p>
          Running the product: showing your hours, resolving your rates,
          generating your invoices, and signing you in. Nothing else.
        </p>
        <p>
          Stint does not send your invoices. The PDF is generated and downloaded
          by you, and you send it from your own email address, so your
          clients&rsquo; addresses are never used to send mail from Stint.
        </p>
      </Clause>

      <Clause heading="Who else can see it">
        <p>
          Infrastructure providers who host the application and its database
          process data on Stint&rsquo;s behalf and are bound to it. No one else
          receives your data, and it is never sold.
        </p>
        <p>
          Data may be disclosed if the law requires it &mdash; a court order or
          equivalent legal process.
        </p>
      </Clause>

      <Clause heading="Keeping and deleting it">
        <p>
          Your data is kept while your account exists. Delete your account and
          it is removed, other than anything a legal or tax obligation requires
          be retained.
        </p>
        <p>
          Export everything at any time, on any plan. Invoices you have already
          generated are PDFs in your own files and do not depend on Stint.
        </p>
      </Clause>

      <Clause heading="Security">
        <p>
          Data is encrypted in transit and at rest, and access is scoped per
          account at the database level. No system is perfect; if something goes
          wrong that affects you, you will be told.
        </p>
      </Clause>

      <Clause heading="Children">
        <p>Stint is not intended for anyone under 16.</p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If this policy changes in a way that materially affects you, the
          change will be announced in the app before it takes effect.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>
          Questions about any of this can be sent to the support address listed
          in the app.
        </p>
      </Clause>
    </LegalPage>
  );
}
