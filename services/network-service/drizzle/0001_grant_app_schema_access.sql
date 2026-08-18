-- `scripts/init-databases.sql` yalnızca `public` şemasında `network_app`'e yetki verir çünkü
-- `network` ve `customer` şemaları o an henüz yok — bu migration'ın önceki adımında yaratılıyorlar.
-- Runtime kullanıcısı (`network_app`) bu şemalara da erişebilmeli.
GRANT USAGE ON SCHEMA network TO network_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA customer TO network_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA network TO network_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA customer TO network_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA network TO network_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA customer TO network_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE network_migrator IN SCHEMA network
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO network_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE network_migrator IN SCHEMA customer
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO network_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE network_migrator IN SCHEMA network
  GRANT USAGE, SELECT ON SEQUENCES TO network_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE network_migrator IN SCHEMA customer
  GRANT USAGE, SELECT ON SEQUENCES TO network_app;
