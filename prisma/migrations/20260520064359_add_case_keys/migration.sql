-- CreateTable
CREATE TABLE "CaseKey" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseKey_caseId_doctorId_key" ON "CaseKey"("caseId", "doctorId");
