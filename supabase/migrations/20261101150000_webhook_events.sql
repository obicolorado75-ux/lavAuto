-- Webhook d'activation automatique des abonnements (P1 encaissement)
--
-- Registre d'idempotence du webhook `POST /api/v1/payments/webhook`
-- (server/payments-webhook.ts). Une ligne par evenement vu, cle DERIVEE
-- (transaction + verdict) : un succes puis un refund sur la meme
-- transaction sont deux evenements distincts, et le second doit pouvoir
-- fermer l'intention que le premier a ouverte. Sans ce registre, chaque
-- rejeu réseau offrirait un mois de plus.
--
-- Pas de RLS : table technique de la plateforme, sans organisation porteuse,
-- comme error_events. Jamais exposee par une route de station ; seule la
-- session applicative y touche, sous verrou HMAC-SHA256 (PAYMENT_WEBHOOK_SECRET).
CREATE TABLE IF NOT EXISTS webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL DEFAULT 'manual',
 transaction_id text NOT NULL,
 event_key text NOT NULL UNIQUE,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','processed','failed')),
 result jsonb,
 error text,
 processed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_created_idx ON webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_tx_idx ON webhook_events(transaction_id);

-- Droits du rôle applicatif : la baseline DEFAULT PRIVILEGES couvre les
-- créations futures faites par le propriétaire, mais sur une base hébergée
-- les GRANT explicites restent la garantie que le démarrage ne casse pas.
DO $whk$
BEGIN
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO washpilot_app';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE '[webhook] droits du rôle washpilot_app non accordés sur webhook_events.';
END $whk$;
