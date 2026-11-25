CREATE TRIGGER calibration_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON floor_calibrations FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
