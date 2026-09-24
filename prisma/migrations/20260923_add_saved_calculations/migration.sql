CREATE TABLE "SavedCalculation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "calculatorType" TEXT NOT NULL,
    "inputData" TEXT NOT NULL,
    "resultData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCalculation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedCalculation_userId_createdAt_idx"
ON "SavedCalculation"("userId", "createdAt");

ALTER TABLE "SavedCalculation"
ADD CONSTRAINT "SavedCalculation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;ALTER TABLE "SavedCalculation" ENABLE ROW LEVEL SECURITY;