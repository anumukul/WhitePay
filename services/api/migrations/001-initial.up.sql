CREATE TABLE merchants (
 id text PRIMARY KEY, name text NOT NULL, payout_address text NOT NULL,
 webhook_url text, webhook_secret text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE api_keys (
 id text PRIMARY KEY, merchant_id text NOT NULL REFERENCES merchants(id), key_hash text UNIQUE NOT NULL,
 prefix text NOT NULL, created_at bigint NOT NULL, expires_at bigint, revoked_at bigint
);
CREATE TABLE products (
 id text PRIMARY KEY, merchant_id text NOT NULL REFERENCES merchants(id), name text NOT NULL,
 created_at bigint NOT NULL, UNIQUE(id,merchant_id)
);
CREATE TABLE prices (
 id text PRIMARY KEY, merchant_id text NOT NULL REFERENCES merchants(id), product_id text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 currency text NOT NULL CHECK(currency='USDT'), token_address text NOT NULL CHECK(lower(token_address)='0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7'),
 created_at bigint NOT NULL, UNIQUE(id,merchant_id), UNIQUE(product_id,version),
 FOREIGN KEY(product_id,merchant_id) REFERENCES products(id,merchant_id)
);
CREATE TABLE checkout_sessions (
 id text PRIMARY KEY, merchant_id text NOT NULL REFERENCES merchants(id), price_id text NOT NULL,
 external_order_id text NOT NULL, status text NOT NULL CHECK(status IN ('open','settled','canceled')),
 redirect_url text NOT NULL, success_url text, amount_minor bigint NOT NULL, currency text NOT NULL,
 token_address text NOT NULL, payout_address text NOT NULL, created_at bigint NOT NULL,
 UNIQUE(merchant_id,external_order_id), UNIQUE(id,merchant_id),
 FOREIGN KEY(price_id,merchant_id) REFERENCES prices(id,merchant_id)
);
CREATE TABLE idempotency_keys (
 key text NOT NULL, merchant_id text NOT NULL REFERENCES merchants(id), request_hash text NOT NULL,
 response_body jsonb NOT NULL, response_status integer NOT NULL, created_at bigint NOT NULL,
 PRIMARY KEY(merchant_id,key)
);
CREATE TABLE submissions (
 id text PRIMARY KEY, merchant_id text NOT NULL, session_id text NOT NULL, payer_address text NOT NULL,
 order_payload jsonb NOT NULL, order_typed_data jsonb NOT NULL, token_typed_data jsonb NOT NULL,
 order_digest text UNIQUE NOT NULL, order_signature text, token_signature text,
 status text NOT NULL CHECK(status IN ('awaiting_signature','queued','submitted','settled','failed','expired')),
 tx_hash text, error_reason text, created_at bigint NOT NULL, updated_at bigint NOT NULL,
 UNIQUE(session_id,payer_address), FOREIGN KEY(session_id,merchant_id) REFERENCES checkout_sessions(id,merchant_id)
);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE TABLE payments (
 id text PRIMARY KEY, merchant_id text NOT NULL, session_id text NOT NULL,
 status text NOT NULL, amount_minor bigint NOT NULL, tx_hash text, block_number bigint, created_at bigint NOT NULL,
 FOREIGN KEY(session_id,merchant_id) REFERENCES checkout_sessions(id,merchant_id)
);
CREATE INDEX idx_payments_merchant ON payments(merchant_id);
CREATE FUNCTION immutable_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Prices are immutable; create a new version'; END $$;
CREATE TRIGGER prices_immutable BEFORE UPDATE OR DELETE ON prices FOR EACH ROW EXECUTE FUNCTION immutable_price();
