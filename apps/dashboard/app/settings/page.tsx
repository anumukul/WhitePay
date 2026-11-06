import { api } from '../../lib/server';
import { KeyForm, WebhookForm, WebhookTestForm } from './forms';
import { revokeApiKey, renameMerchant } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [merchant, keys, webhook] = await Promise.all([
    api('/v1/merchant'),
    api('/v1/api-keys'),
    api('/v1/webhook-endpoints'),
  ]);

  return (
    <main>
      <h1>Merchant settings</h1>
      {(await searchParams).error && (
        <p role="alert">
          Settings could not be saved. Check the values and destination URL.
        </p>
      )}
      <h2>Profile</h2>
      <p>Payout address: {merchant.payoutAddress}</p>
      <form action={renameMerchant}>
        <label htmlFor="merchant-name">Merchant name</label>
        <input
          id="merchant-name"
          name="name"
          defaultValue={merchant.name}
          required
          maxLength={200}
        />
        <button>Save name</button>
      </form>
      <h2>API keys</h2>
      <p>Secrets are shown only when created. Existing keys are masked.</p>
      <KeyForm />
      <ul>
        {keys.data.map((k: any) => (
          <li key={k.id}>
            <code>{k.prefix}…</code>{' '}
            {k.revokedAt ? (
              'Revoked'
            ) : (
              <form action={revokeApiKey} style={{ display: 'inline' }}>
                <input type="hidden" name="id" value={k.id} />
                <button aria-label={'Revoke key ' + k.prefix}>Revoke</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <h2>Webhook</h2>
      <WebhookForm url={webhook.url ?? ''} />
      <p>
        Use HTTPS. Private destinations are rejected. Rotating a secret requires
        updating your receiver.
      </p>
      {webhook.url && <WebhookTestForm />}
      {webhook.lastTest && (
        <p>
          Last test response: {webhook.lastTest.responseStatus || 'No response'}
        </p>
      )}
      <p>
        Test events never grant purchases; fulfill only verified
        payment.succeeded events.
      </p>
    </main>
  );
}
