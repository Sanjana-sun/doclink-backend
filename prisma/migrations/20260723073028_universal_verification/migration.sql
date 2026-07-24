-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "medicalCouncil" TEXT,
ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'provisional';
