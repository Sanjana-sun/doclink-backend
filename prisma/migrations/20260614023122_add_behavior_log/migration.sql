-- CreateTable
CREATE TABLE "BehaviorLog" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehaviorLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BehaviorLog" ADD CONSTRAINT "BehaviorLog_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
