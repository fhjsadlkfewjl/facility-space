CREATE INDEX furniture_inventory_normalized ON furniture ((nullif(btrim(inventory_number),''))) WHERE nullif(btrim(inventory_number),'') IS NOT NULL;
CREATE INDEX assignments_employee_period ON workplace_assignments(employee_id,valid_from,valid_to);
CREATE INDEX assignments_workplace_period ON workplace_assignments(workplace_id,valid_from,valid_to);
