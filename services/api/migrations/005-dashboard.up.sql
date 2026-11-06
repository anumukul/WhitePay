CREATE TABLE webhook_tests (
 id text PRIMARY KEY, merchant_id text NOT NULL REFERENCES merchants(id),
 response_status integer NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX webhook_tests_merchant ON webhook_tests(merchant_id,created_at DESC);
