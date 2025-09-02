-- devices
CREATE TABLE IF NOT EXISTS mlink.devices (
  device_id text PRIMARY KEY,
  label text,
  meta jsonb NOT NULL DEFAULT '{}',
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz
);

-- telemetry + geom trigger
CREATE TABLE IF NOT EXISTS mlink.telemetry (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL REFERENCES mlink.devices(device_id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  lat double precision, lon double precision, alt double precision,
  hr smallint, battery smallint,
  sos boolean,
  extra jsonb NOT NULL DEFAULT '{}',
  geom geography(Point,4326)
);

CREATE OR REPLACE FUNCTION mlink._fill_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
    NEW.geom := geography(ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat),4326));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_geom ON mlink.telemetry;
CREATE TRIGGER trg_fill_geom
BEFORE INSERT OR UPDATE ON mlink.telemetry
FOR EACH ROW EXECUTE PROCEDURE mlink._fill_geom();

-- device_status + upsert trigger
CREATE TABLE IF NOT EXISTS mlink.device_status (
  device_id text PRIMARY KEY REFERENCES mlink.devices(device_id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  lat double precision, lon double precision, alt double precision,
  hr smallint, battery smallint,
  sos boolean, online boolean,
  geom geography(Point,4326)
);

CREATE OR REPLACE FUNCTION mlink._upsert_status() RETURNS trigger AS $$
BEGIN
  INSERT INTO mlink.device_status(device_id, ts, lat, lon, alt, hr, battery, sos, online, geom)
  VALUES(NEW.device_id, NEW.ts, NEW.lat, NEW.lon, NEW.alt, NEW.hr, NEW.battery, NEW.sos, true, NEW.geom)
  ON CONFLICT (device_id) DO UPDATE SET
    ts=EXCLUDED.ts, lat=EXCLUDED.lat, lon=EXCLUDED.lon, alt=EXCLUDED.alt,
    hr=EXCLUDED.hr, battery=EXCLUDED.battery, sos=EXCLUDED.sos,
    online=true, geom=EXCLUDED.geom;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upsert_status ON mlink.telemetry;
CREATE TRIGGER trg_upsert_status
AFTER INSERT ON mlink.telemetry
FOR EACH ROW EXECUTE PROCEDURE mlink._upsert_status();

-- indexes + views
CREATE INDEX IF NOT EXISTS idx_tel_dev_ts ON mlink.telemetry (device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tel_geom   ON mlink.telemetry USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_tel_sos    ON mlink.telemetry (sos) WHERE sos IS TRUE;

CREATE OR REPLACE VIEW mlink.v_trail AS
SELECT device_id, ts, lat, lon, alt, hr, battery, sos FROM mlink.telemetry;
