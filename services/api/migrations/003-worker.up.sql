CREATE TABLE submission_quotes (
 order_digest text PRIMARY KEY, submission_id text NOT NULL REFERENCES submissions(id),
 order_payload jsonb NOT NULL, order_typed_data jsonb NOT NULL, token_typed_data jsonb NOT NULL, created_at bigint NOT NULL
);
INSERT INTO submission_quotes SELECT order_digest,id,order_payload,order_typed_data,token_typed_data,created_at FROM submissions;
CREATE INDEX submission_quotes_event ON submission_quotes((order_payload->>'orderId'),lower(order_payload->>'payer'),(order_payload->>'quoteId'));
CREATE TABLE chain_cursors (
 scope text PRIMARY KEY, chain_id integer NOT NULL, checkout text NOT NULL, last_block bigint NOT NULL, last_block_hash text NOT NULL
);
CREATE TABLE settlement_events (
 event_id text PRIMARY KEY, chain_id integer NOT NULL, checkout text NOT NULL, tx_hash text NOT NULL,
 log_index integer NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('matched','unmatched','rejected','conflict')), reason text, payment_id text REFERENCES payments(id),
 UNIQUE(chain_id,tx_hash,log_index)
);
CREATE UNIQUE INDEX payment_one_per_session ON payments(session_id);
CREATE TABLE webhook_outbox (
 id text PRIMARY KEY, event_id text NOT NULL UNIQUE REFERENCES settlement_events(event_id),
 payment_id text NOT NULL REFERENCES payments(id), merchant_id text NOT NULL REFERENCES merchants(id),
 url text NOT NULL, payload text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivering','delivered','dead')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at bigint NOT NULL, lease_token text, lease_until bigint,
 last_response_code integer, delivered_at bigint, created_at bigint NOT NULL
);
CREATE INDEX webhook_outbox_due ON webhook_outbox(state,next_attempt_at,lease_until);
