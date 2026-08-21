-- Faz 11 — planlı kesinti zamanlayıcısı.
-- Aktif küme artık `status = 'STARTED' AND started_at <= now()` ile süzülüyor; zamanlayıcı
-- ayrıca gelecek taraftaki `MIN(started_at)`'i soruyor. Mevcut kısmi indeks `cbs_id`
-- üzerindeydi ve iki sorguya da yaramıyordu.

CREATE INDEX "idx_outage_states_ro_started_at" ON "network"."outage_states_ro" USING btree ("started_at") WHERE "network"."outage_states_ro"."status" = 'STARTED';
