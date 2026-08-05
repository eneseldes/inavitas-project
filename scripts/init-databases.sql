CREATE DATABASE access_db;
CREATE DATABASE outage_db;
CREATE DATABASE work_order_db;

-- 2. Servis kullanıcıları (uygulamalar bu kullanıcılarla bağlanır, superuser ile değil)
CREATE USER access_svc     WITH PASSWORD 'access_pw';
CREATE USER outage_svc     WITH PASSWORD 'outage_pw';
CREATE USER work_order_svc WITH PASSWORD 'work_order_pw';

-- 3. KRİTİK: varsayılan PUBLIC CONNECT hakkını geri al.
--    Bu satır olmadan her kullanıcı her veritabanına bağlanabilir.
REVOKE CONNECT ON DATABASE access_db     FROM PUBLIC;
REVOKE CONNECT ON DATABASE outage_db     FROM PUBLIC;
REVOKE CONNECT ON DATABASE work_order_db FROM PUBLIC;

-- 4. Yalnızca sahibine CONNECT + CREATE ver, veritabanının sahipliğini ona devret
GRANT CONNECT, CREATE ON DATABASE access_db     TO access_svc;
GRANT CONNECT, CREATE ON DATABASE outage_db     TO outage_svc;
GRANT CONNECT, CREATE ON DATABASE work_order_db TO work_order_svc;

ALTER DATABASE access_db     OWNER TO access_svc;
ALTER DATABASE outage_db     OWNER TO outage_svc;
ALTER DATABASE work_order_db OWNER TO work_order_svc;

-- 5. Her veritabanına bağlanıp gereken uzantıları kur (uzantılar veritabanı başınadır)
\c access_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

\c outage_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c work_order_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;