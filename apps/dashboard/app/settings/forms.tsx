'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import {
  newApiKey,
  saveWebhook,
  sendWebhookTest,
  type SettingsResult,
} from '../actions';
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  );
}
function Result({ result }: { result: SettingsResult }) {
  return (
    <>
      {result.error && <p role="alert">{result.error}</p>}
      {result.message && <p role="status">{result.message}</p>}
      {result.secret && (
        <pre
          data-testid="one-time-secret"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {result.secret}
        </pre>
      )}
    </>
  );
}
export function KeyForm() {
  const [result, action] = useFormState(newApiKey, {});
  return (
    <>
      <form action={action}>
        <Submit>Create API key</Submit>
      </form>
      <Result result={result} />
    </>
  );
}
export function WebhookForm({ url }: { url: string }) {
  const [result, action] = useFormState(saveWebhook, {});
  const [endpoint, setEndpoint] = useState(url);
  return (
    <>
      <form action={action}>
        <label htmlFor="url">Webhook URL</label>
        <input
          id="url"
          type="url"
          name="url"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          required
        />
        <label>
          <input type="checkbox" name="rotateSecret" />
          Rotate signing secret
        </label>
        <Submit>Save webhook</Submit>
      </form>
      <Result result={result} />
    </>
  );
}
export function WebhookTestForm() {
  const [result, action] = useFormState(sendWebhookTest, {});
  return (
    <>
      <form action={action}>
        <Submit>Send signed test event</Submit>
      </form>
      <Result result={result} />
    </>
  );
}
