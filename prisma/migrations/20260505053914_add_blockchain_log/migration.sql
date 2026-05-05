-- CreateTable
CREATE TABLE "BlockchainLog" (
    "id" TEXT NOT NULL,
    "blockNumber" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockchainLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainLog_blockNumber_key" ON "BlockchainLog"("blockNumber");
