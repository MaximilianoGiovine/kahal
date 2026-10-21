-- Un pastor/líder no puede tener dos citas activas que empiecen en el mismo instante.
CREATE UNIQUE INDEX "Appointment_host_active_slot_key"
  ON "Appointment" ("hostId", "startsAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
