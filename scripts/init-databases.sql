CREATE DATABASE access_db;
CREATE DATABASE outage_db;
CREATE DATABASE work_order_db;
CREATE DATABASE translation_db;

-- Servis başına iki kullanıcı: biri DDL diğeri DML yetkisine sahip
CREATE USER access_migrator     WITH PASSWORD 'access_migrator_pw';
CREATE USER access_app          WITH PASSWORD 'access_app_pw';
CREATE USER outage_migrator     WITH PASSWORD 'outage_migrator_pw';
CREATE USER outage_app          WITH PASSWORD 'outage_app_pw';
CREATE USER work_order_migrator WITH PASSWORD 'work_order_migrator_pw';
CREATE USER work_order_app      WITH PASSWORD 'work_order_app_pw';
CREATE USER translation_migrator WITH PASSWORD 'translation_migrator_pw';
CREATE USER translation_app      WITH PASSWORD 'translation_app_pw';

-- Varsayılan PUBLIC CONNECT hakkını geri al
REVOKE CONNECT ON DATABASE access_db      FROM PUBLIC;
REVOKE CONNECT ON DATABASE outage_db      FROM PUBLIC;
REVOKE CONNECT ON DATABASE work_order_db  FROM PUBLIC;
REVOKE CONNECT ON DATABASE translation_db FROM PUBLIC;

-- Migrator yetkileri
GRANT CONNECT, CREATE ON DATABASE access_db      TO access_migrator;
GRANT CONNECT, CREATE ON DATABASE outage_db      TO outage_migrator;
GRANT CONNECT, CREATE ON DATABASE work_order_db  TO work_order_migrator;
GRANT CONNECT, CREATE ON DATABASE translation_db TO translation_migrator;

ALTER DATABASE access_db      OWNER TO access_migrator;
ALTER DATABASE outage_db      OWNER TO outage_migrator;
ALTER DATABASE work_order_db  OWNER TO work_order_migrator;
ALTER DATABASE translation_db OWNER TO translation_migrator;

-- App kullanıcısına yalnızca bağlanma yetkisi
GRANT CONNECT ON DATABASE access_db      TO access_app;
GRANT CONNECT ON DATABASE outage_db      TO outage_app;
GRANT CONNECT ON DATABASE work_order_db  TO work_order_app;
GRANT CONNECT ON DATABASE translation_db TO translation_app;

-- Veritabanlarına gerekli uzantıları kur, sonra app kullanıcısına DML yetkisi ver
\c access_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
GRANT USAGE ON SCHEMA public TO access_app;
ALTER DEFAULT PRIVILEGES FOR ROLE access_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO access_app;
ALTER DEFAULT PRIVILEGES FOR ROLE access_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO access_app;

\c outage_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT USAGE ON SCHEMA public TO outage_app;
ALTER DEFAULT PRIVILEGES FOR ROLE outage_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO outage_app;
ALTER DEFAULT PRIVILEGES FOR ROLE outage_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO outage_app;

\c work_order_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT USAGE ON SCHEMA public TO work_order_app;
ALTER DEFAULT PRIVILEGES FOR ROLE work_order_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO work_order_app;
ALTER DEFAULT PRIVILEGES FOR ROLE work_order_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO work_order_app;

\c translation_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT USAGE ON SCHEMA public TO translation_app;
ALTER DEFAULT PRIVILEGES FOR ROLE translation_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO translation_app;
ALTER DEFAULT PRIVILEGES FOR ROLE translation_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO translation_app;

