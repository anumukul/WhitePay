CREATE TABLE relay_attempts (
 id text PRIMARY KEY, submission_id text NOT NULL REFERENCES submissions(id), order_digest text NOT NULL UNIQUE,
 chain_id integer NOT NULL CHECK(chain_id=1874), relayer text NOT NULL, nonce bigint NOT NULL,
 unsigned_tx jsonb NOT NULL, unsigned_hash text NOT NULL, raw_transaction text, tx_hash text,
 state text NOT NULL CHECK(state IN ('reserved','signed','pending','mined','failed','quarantined')),
 budget_day text NOT NULL, reserved_wei numeric(78,0) NOT NULL CHECK(reserved_wei>=0),
 charged_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(charged_wei>=0),
 broadcast_attempted boolean NOT NULL DEFAULT false, reason text,
 created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE INDEX relay_attempts_recovery ON relay_attempts(chain_id,relayer,state,nonce);

CREATE UNIQUE INDEX relay_nonce_active ON relay_attempts(chain_id,relayer,nonce) WHERE state <> 'failed' OR broadcast_attempted;
