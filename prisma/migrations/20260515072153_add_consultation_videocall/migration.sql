-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "roomName" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doctorId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
