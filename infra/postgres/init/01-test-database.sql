-- Runs once when the postgres volume is first created (docker-entrypoint-initdb.d).
-- Separate database for integration tests (docs/11-testing.md §2); migrations create pg_trgm.
CREATE DATABASE wems_test OWNER wems;
