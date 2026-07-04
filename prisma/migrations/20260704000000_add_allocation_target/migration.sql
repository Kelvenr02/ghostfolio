-- Adiciona a persistência de alocação-alvo por ativo (Módulo 03 — Otimizador de Aporte Mensal).
-- Cada linha representa o percentual-alvo de um SymbolProfile na carteira de um User,
-- junto com a classificação de modo de compra (contínuo/discreto) e o valor mínimo de compra.
-- CreateEnum
CREATE TYPE "PurchaseMode" AS ENUM ('CONTINUOUS', 'DISCRETE');

-- CreateTable
CREATE TABLE "AllocationTarget" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "minPurchaseValue" DOUBLE PRECISION,
    "purchaseMode" "PurchaseMode" NOT NULL DEFAULT 'DISCRETE',
    "symbolProfileId" TEXT NOT NULL,
    "targetPercentage" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AllocationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllocationTarget_userId_symbolProfileId_key" ON "AllocationTarget"("userId", "symbolProfileId");

-- AddForeignKey
ALTER TABLE "AllocationTarget" ADD CONSTRAINT "AllocationTarget_symbolProfileId_fkey" FOREIGN KEY ("symbolProfileId") REFERENCES "SymbolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationTarget" ADD CONSTRAINT "AllocationTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
