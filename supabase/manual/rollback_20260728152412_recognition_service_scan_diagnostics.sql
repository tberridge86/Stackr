-- Rollback for 20260728152412_recognition_service_scan_diagnostics.sql.
-- This removes only the private Stage 7 recognition-service diagnostics table.

drop table if exists ml.recognition_scan_diagnostics;
